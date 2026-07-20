const CHALLENGING_FEELINGS = new Set(['イライラ', 'かなしい']);

const toDateString = date => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const shiftDate = (dateString, days) => {
  const [year, month, day] = dateString.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + days);
  return toDateString(date);
};

const inRange = (item, startDate, endDate) => item.date >= startDate && item.date <= endDate;

export const summarizeStudent = ({
  studentId,
  startDate,
  endDate,
  logs = [],
  dailyCheckIns = [],
  forgottenItems = [],
  absences = [],
  supportActions = [],
}) => {
  const submissions = logs.filter(item => item.studentId === studentId && inRange(item, startDate, endDate));
  const checkIns = dailyCheckIns.filter(item => item.studentId === studentId && inRange(item, startDate, endDate));
  const forgotten = forgottenItems.filter(item => item.studentId === studentId && inRange(item, startDate, endDate));
  const attendance = absences.filter(item => item.studentId === studentId && inRange(item, startDate, endDate));
  const supports = supportActions.filter(item => item.studentId === studentId);
  const feelings = { 'げんき': 0, 'ねむい': 0, 'イライラ': 0, 'かなしい': 0 };
  checkIns.forEach(item => {
    if (Object.hasOwn(feelings, item.feeling)) feelings[item.feeling]++;
  });

  return {
    submissions: submissions.length,
    checkIns: checkIns.length,
    forgottenItems: forgotten.length,
    absenceOrLate: attendance.length,
    activeSupports: supports.filter(item => item.status !== '完了').length,
    completedSupports: supports.filter(item => item.status === '完了').length,
    feelings,
  };
};

export const buildSupportSignals = ({
  students = [],
  today,
  dailyCheckIns = [],
  forgottenItems = [],
  supportActions = [],
}) => {
  const recent14Start = shiftDate(today, -13);
  return students.flatMap(student => {
    const signals = [];
    const recentForgotten = forgottenItems.filter(item =>
      item.studentId === student.id && item.date >= recent14Start && item.date <= today
    );
    if (recentForgotten.length >= 3) {
      signals.push({
        id: `forgotten-${student.id}`,
        studentId: student.id,
        studentName: student.name,
        type: '準備',
        priority: 2,
        title: '忘れ物の記録を確認',
        detail: `直近14日で${recentForgotten.length}件の記録があります`,
      });
    }

    const recentCheckIns = dailyCheckIns
      .filter(item => item.studentId === student.id && item.date <= today)
      .sort((a, b) => b.date.localeCompare(a.date) || b.timestamp - a.timestamp)
      .slice(0, 10);
    const challengingCount = recentCheckIns.filter(item => CHALLENGING_FEELINGS.has(item.feeling)).length;
    if (challengingCount >= 3) {
      signals.push({
        id: `feeling-${student.id}`,
        studentId: student.id,
        studentName: student.name,
        type: 'きもち',
        priority: 2,
        title: '最近のきもちを確認',
        detail: `直近${recentCheckIns.length}回中${challengingCount}回、困り感のある選択がありました`,
      });
    }

    supportActions
      .filter(item => item.studentId === student.id && item.status !== '完了' && item.followUpDate && item.followUpDate <= today)
      .forEach(item => signals.push({
        id: `follow-up-${item.id}`,
        studentId: student.id,
        studentName: student.name,
        supportActionId: item.id,
        type: '振り返り',
        priority: item.followUpDate < today ? 3 : 2,
        title: '支援の振り返り時期です',
        detail: `${item.category}・確認予定 ${item.followUpDate}`,
      }));

    return signals;
  }).sort((a, b) => b.priority - a.priority || a.studentName.localeCompare(b.studentName, 'ja'));
};

const timelineTimestamp = item => item.timestamp || item.updatedAt || item.createdAt || 0;

export const buildStudentTimeline = ({
  studentId,
  logs = [],
  tasks = [],
  dailyCheckIns = [],
  forgottenItems = [],
  absences = [],
  supportActions = [],
  familyContacts = [],
}) => {
  const taskById = new Map(tasks.map(task => [task.id, task.name]));
  const submissionsByDate = new Map();
  logs.filter(item => item.studentId === studentId).forEach(item => {
    const taskName = taskById.get(item.taskId) || item.taskName || '課題';
    const entry = submissionsByDate.get(item.date) || { names: [], timestamp: 0 };
    entry.names.push(taskName);
    entry.timestamp = Math.max(entry.timestamp, timelineTimestamp(item));
    submissionsByDate.set(item.date, entry);
  });

  const submissionEvents = [...submissionsByDate.entries()].map(([date, entry]) => ({
    id: `submissions-${date}`,
    date,
    timestamp: entry.timestamp,
    kind: 'submission',
    title: `提出 ${entry.names.length}件`,
    detail: [...new Set(entry.names)].join('、'),
  }));

  const events = [
    ...submissionEvents,
    ...dailyCheckIns.filter(item => item.studentId === studentId).map(item => ({
      id: item.id, date: item.date, timestamp: timelineTimestamp(item), kind: 'check-in',
      title: `きもち：${item.feeling}`, detail: '児童本人による朝のチェックイン',
    })),
    ...forgottenItems.filter(item => item.studentId === studentId).map(item => ({
      id: item.id, date: item.date, timestamp: timelineTimestamp(item), kind: 'forgotten-item',
      title: `忘れ物：${item.itemName}`, detail: `${item.subject}・${item.response}・${item.impact}`,
    })),
    ...absences.filter(item => item.studentId === studentId).map(item => ({
      id: item.id, date: item.date, timestamp: timelineTimestamp(item), kind: 'attendance',
      title: item.status, detail: '出欠記録',
    })),
    ...supportActions.filter(item => item.studentId === studentId).map(item => ({
      id: item.id, date: item.date, timestamp: timelineTimestamp(item), kind: 'support',
      title: `支援：${item.category}`, detail: `${item.action}${item.outcome ? ` ／ 結果：${item.outcome}` : ''}`,
      status: item.status,
    })),
    ...familyContacts.filter(item => item.studentId === studentId).map(item => ({
      id: item.id, date: item.date, timestamp: timelineTimestamp(item), kind: 'family-contact',
      title: `家庭連携：${item.channel}`, detail: `${item.topic}・共有：${item.sharedFacts}・合意：${item.agreement}`,
      status: item.status,
    })),
  ];

  return events.sort((a, b) => b.date.localeCompare(a.date) || b.timestamp - a.timestamp);
};
