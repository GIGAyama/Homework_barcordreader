import { submissionMatchesTask } from './dataModel.js';
import { getWeekRangeStrings, isTaskDueOn } from './taskSchedule.js';

const CHALLENGING_FEELINGS = new Set(['イライラ', 'かなしい']);

const uniqueNames = items => [...new Set(items.map(item => item.studentName).filter(Boolean))];
const namesText = names => names.length > 6 ? `${names.slice(0, 6).join('、')}ほか${names.length - 6}名` : names.join('、');

const latestCheckIns = (dailyCheckIns, today) => {
  const latest = new Map();
  dailyCheckIns.filter(item => item.date === today).forEach(item => {
    const previous = latest.get(item.studentId);
    if (!previous || Number(item.timestamp || 0) >= Number(previous.timestamp || 0)) latest.set(item.studentId, item);
  });
  return latest;
};

export const buildDailyOperations = ({
  today,
  students = [],
  tasks = [],
  logs = [],
  dailyCheckIns = [],
  absences = [],
  forgottenItems = [],
  supportActions = [],
  familyContacts = [],
  classActions = [],
}) => {
  const todayLogs = logs.filter(item => item.date === today);
  const todayAbsences = absences.filter(item => item.date === today);
  const absentIds = new Set(todayAbsences.map(item => item.studentId));
  const checkInByStudent = latestCheckIns(dailyCheckIns, today);
  const actedIds = new Set([...todayLogs.map(item => item.studentId), ...checkInByStudent.keys(), ...absentIds]);
  const unknownStudents = students.filter(student => !actedIds.has(student.id));
  const challengingStudents = students.filter(student => CHALLENGING_FEELINGS.has(checkInByStudent.get(student.id)?.feeling));

  const dueTasks = tasks.filter(task => isTaskDueOn(task, today));
  const [weekStart, weekEnd] = getWeekRangeStrings(today);
  const taskGaps = dueTasks.map(task => {
    const studentsWithGap = [];
    let remaining = 0;
    students.filter(student => !absentIds.has(student.id)).forEach(student => {
      const studentLogs = logs.filter(item => item.studentId === student.id);
      if (task.type === '週回数') {
        const completed = studentLogs.filter(item => item.date >= weekStart && item.date <= weekEnd && submissionMatchesTask(item, task)).length;
        const gap = Math.max(0, Number.parseInt(task.value || 1, 10) - completed);
        if (gap > 0) { studentsWithGap.push(student); remaining += gap; }
      } else {
        const submitted = todayLogs.some(item => item.studentId === student.id && submissionMatchesTask(item, task));
        if (!submitted) { studentsWithGap.push(student); remaining += 1; }
      }
    });
    return { taskId: task.id, taskName: task.name, taskType: task.type, students: studentsWithGap, remaining };
  }).filter(item => item.remaining > 0);

  const todayForgotten = forgottenItems.filter(item => item.date === today);
  const dueSupports = supportActions.filter(item => item.status !== '完了' && item.followUpDate && item.followUpDate <= today);
  const dueFamily = familyContacts.filter(item => item.status !== '完了' && item.followUpDate && item.followUpDate <= today);
  const dueClass = classActions.filter(item => item.status !== '完了' && item.reviewDate && item.reviewDate <= today);
  const actions = [];

  if (unknownStudents.length > 0) actions.push({
    id: 'morning-unconfirmed', group: '朝の確認', priority: 3, route: 'dashboard',
    title: `未確認の児童が${unknownStudents.length}名`,
    detail: `提出・きもち・出欠のいずれも記録がありません：${namesText(unknownStudents.map(item => item.name))}`,
  });
  if (challengingStudents.length > 0) actions.push({
    id: 'morning-feelings', group: '朝の確認', priority: 3, route: 'support',
    title: `きもちを確認したい児童が${challengingStudents.length}名`,
    detail: `今日「イライラ」「かなしい」を選択：${namesText(challengingStudents.map(item => item.name))}`,
  });
  if (taskGaps.length > 0) actions.push({
    id: 'submission-gaps', group: '提出・授業', priority: 2, route: 'dashboard',
    title: `提出確認が必要な課題が${taskGaps.length}種類`,
    detail: taskGaps.slice(0, 4).map(item => `${item.taskName} 残り${item.remaining}回`).join('、'),
  });
  if (todayForgotten.length > 0) actions.push({
    id: 'today-forgotten', group: '提出・授業', priority: 2, route: 'forgotten',
    title: `今日の忘れ物が${todayForgotten.length}件`,
    detail: `${uniqueNames(todayForgotten).length}名の記録があります。授業への影響と対応を確認します。`,
  });
  if (dueSupports.length > 0) actions.push({
    id: 'support-followups', group: '連携・振り返り', priority: 3, route: 'support',
    title: `児童支援の振り返りが${dueSupports.length}件`,
    detail: namesText(uniqueNames(dueSupports)),
  });
  if (dueFamily.length > 0) actions.push({
    id: 'family-followups', group: '連携・振り返り', priority: 3, route: 'family',
    title: `家庭連携の確認が${dueFamily.length}件`,
    detail: `${namesText(uniqueNames(dueFamily))}（校内限定情報はブリーフに含めません）`,
  });
  if (dueClass.length > 0) actions.push({
    id: 'class-reviews', group: '連携・振り返り', priority: 2, route: 'class-insights',
    title: `学級改善の振り返りが${dueClass.length}件`,
    detail: dueClass.slice(0, 3).map(item => item.title).join('、'),
  });
  if (actions.length === 0) actions.push({
    id: 'all-clear', group: '今日の状態', priority: 1, route: 'dashboard',
    title: '現在、優先確認項目はありません', detail: '日々の記録を続け、変化があれば確認します。',
  });

  actions.sort((a, b) => b.priority - a.priority || a.group.localeCompare(b.group, 'ja'));
  const summary = {
    students: students.length,
    morningConfirmed: students.length - unknownStudents.length,
    morningRate: students.length ? Math.round(((students.length - unknownStudents.length) / students.length) * 100) : 0,
    absentOrLate: todayAbsences.length,
    challenging: challengingStudents.length,
    submissionGaps: taskGaps.reduce((sum, item) => sum + item.remaining, 0),
    forgotten: todayForgotten.length,
    dueFollowUps: dueSupports.length + dueFamily.length + dueClass.length,
  };

  return { summary, actions, taskGaps, unknownStudents, challengingStudents, dueSupports, dueFamily, dueClass };
};

export const buildHandoverBrief = ({ today, operations }) => {
  const { summary, actions } = operations;
  const lines = [
    `【${today}】宿題ポスト・今日の校務ブリーフ`,
    `朝の確認：${summary.morningConfirmed}/${summary.students}名（${summary.morningRate}%）`,
    `出欠記録：${summary.absentOrLate}件／提出の残り：${summary.submissionGaps}回／忘れ物：${summary.forgotten}件`,
    '',
  ];
  actions.forEach(action => lines.push(`■ ${action.title}\n${action.detail}`));
  lines.push('', '※校内の引き継ぎ用です。家庭から聞いた校内限定内容や自動診断は含みません。');
  return lines.join('\n');
};
