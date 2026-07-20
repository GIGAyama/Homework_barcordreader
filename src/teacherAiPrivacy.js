import { buildDailyOperations, buildHandoverBrief } from './dailyOperations.js';
import { submissionMatchesTask } from './dataModel.js';
import { isTaskDueOn, parseLocalDate, getLocalDateString } from './taskSchedule.js';

export const AI_TASKS = Object.freeze({
  CLASS_WEEKLY_SUMMARY: 'class_weekly_summary',
  FAMILY_MEETING_DRAFT: 'family_meeting_draft',
  HANDOVER_REWRITE: 'handover_rewrite',
  SUPPORT_NOTE_STRUCTURE: 'support_note_structure',
});

const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const PHONE_PATTERN = /(?:\+?81[-\s]?)?0\d{1,4}[-\s]?\d{1,4}[-\s]?\d{3,4}/g;
const POSTAL_PATTERN = /〒?\s?\d{3}-\d{4}/g;

const escapeRegExp = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const compactName = value => String(value || '').replace(/[\s\u3000]/g, '');

export const createStudentAliases = (students = [], targetStudentId = null) => {
  const aliases = {};
  const reverse = {};
  students.forEach((student, index) => {
    const alias = student.id === targetStudentId ? '対象児童' : `児童${String.fromCharCode(65 + (index % 26))}${index >= 26 ? Math.floor(index / 26) : ''}`;
    const name = String(student.name || '').trim();
    if (!name) return;
    aliases[name] = alias;
    reverse[alias] = name;
  });
  return { aliases, reverse };
};

export const redactSensitiveText = (value, students = [], targetStudentId = null) => {
  let text = String(value ?? '');
  const { aliases } = createStudentAliases(students, targetStudentId);
  Object.entries(aliases)
    .sort(([left], [right]) => right.length - left.length)
    .forEach(([name, alias]) => {
      text = text.replace(new RegExp(escapeRegExp(name), 'g'), alias);
      const compact = compactName(name);
      if (compact && compact !== name) text = text.replace(new RegExp(escapeRegExp(compact), 'g'), alias);
    });
  return text
    .replace(EMAIL_PATTERN, '[メールアドレス]')
    .replace(PHONE_PATTERN, '[電話番号]')
    .replace(POSTAL_PATTERN, '[郵便番号]');
};

const sanitizeDeep = (value, students, targetStudentId) => {
  if (typeof value === 'string') return redactSensitiveText(value, students, targetStudentId);
  if (Array.isArray(value)) return value.map(item => sanitizeDeep(item, students, targetStudentId));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, sanitizeDeep(item, students, targetStudentId)]));
  }
  return value;
};

export const rehydrateAliases = (value, reverseAliases = {}) => {
  if (typeof value === 'string') {
    return Object.entries(reverseAliases).reduce(
      (text, [alias, name]) => text.replace(new RegExp(escapeRegExp(alias), 'g'), name),
      value
    );
  }
  if (Array.isArray(value)) return value.map(item => rehydrateAliases(item, reverseAliases));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, rehydrateAliases(item, reverseAliases)]));
  }
  return value;
};

const shiftDate = (dateString, days) => {
  const date = parseLocalDate(dateString);
  date.setDate(date.getDate() + days);
  return getLocalDateString(date);
};

const datesBetween = (startDate, endDate) => {
  const dates = [];
  for (let date = startDate; date <= endDate; date = shiftDate(date, 1)) dates.push(date);
  return dates;
};

const countBy = (items, getter) => Object.entries(items.reduce((counts, item) => {
  const key = String(getter(item) || '未設定');
  counts[key] = (counts[key] || 0) + 1;
  return counts;
}, {})).map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'ja'));

const isWithin = (item, startDate, endDate) => item.date >= startDate && item.date <= endDate;

const buildSubmissionSummary = ({ students, tasks, logs, absences, startDate, endDate, studentId = null }) => {
  const targetStudents = studentId ? students.filter(student => student.id === studentId) : students;
  const dates = datesBetween(startDate, endDate);
  let required = 0;
  let submitted = 0;
  targetStudents.forEach(student => {
    dates.forEach(date => {
      if (absences.some(item => item.studentId === student.id && item.date === date && item.status === '欠席')) return;
      tasks.filter(task => task.type !== '週回数' && isTaskDueOn(task, date)).forEach(task => {
        required += 1;
        if (logs.some(log => log.studentId === student.id && log.date === date && submissionMatchesTask(log, task))) submitted += 1;
      });
    });
    tasks.filter(task => task.type === '週回数').forEach(task => {
      const quota = Number.parseInt(task.value || 1, 10);
      const activeWeeks = new Set(dates.filter(date => isTaskDueOn(task, date)).map(date => {
        const parsed = parseLocalDate(date);
        const day = parsed.getDay();
        parsed.setDate(parsed.getDate() - day + (day === 0 ? -6 : 1));
        return getLocalDateString(parsed);
      }));
      activeWeeks.forEach(weekStart => {
        const weekEnd = shiftDate(weekStart, 6);
        required += quota;
        const count = logs.filter(log => log.studentId === student.id && log.date >= weekStart && log.date <= weekEnd && submissionMatchesTask(log, task)).length;
        submitted += Math.min(quota, count);
      });
    });
  });
  return { required, submitted, rate: required ? Math.round((submitted / required) * 100) : null };
};

export const buildClassWeeklyPayload = ({ today, db }) => {
  const startDate = shiftDate(today, -6);
  const inPeriod = items => (items || []).filter(item => isWithin(item, startDate, today));
  const feelings = inPeriod(db.dailyCheckIns);
  const forgotten = inPeriod(db.forgottenItems);
  const attendance = inPeriod(db.absences);
  const payload = {
    period: { startDate, endDate: today, schoolDays: datesBetween(startDate, today).filter(date => ![0, 6].includes(parseLocalDate(date).getDay())).length },
    classSize: db.students.length,
    submissions: buildSubmissionSummary({ ...db, startDate, endDate: today }),
    checkIns: { total: feelings.length, byFeeling: countBy(feelings, item => item.feeling) },
    forgottenItems: {
      total: forgotten.length,
      studentCount: new Set(forgotten.map(item => item.studentId)).size,
      byItem: countBy(forgotten, item => item.itemName).slice(0, 8),
      bySubject: countBy(forgotten, item => item.subject).slice(0, 8),
      byImpact: countBy(forgotten, item => item.impact).slice(0, 8),
    },
    attendance: { total: attendance.length, byStatus: countBy(attendance, item => item.status) },
    openSupportCount: (db.supportActions || []).filter(item => item.status !== '完了').length,
    openClassImprovementCount: (db.classActions || []).filter(item => item.status !== '完了').length,
  };
  return { payload, reverseAliases: {}, sourceRecordCount: feelings.length + forgotten.length + attendance.length + inPeriod(db.logs).length };
};

export const buildFamilyMeetingPayload = ({ studentId, startDate, endDate, db }) => {
  const student = db.students.find(item => item.id === studentId);
  if (!student) throw new Error('対象児童を選択してください');
  const inStudentPeriod = items => (items || []).filter(item => item.studentId === studentId && isWithin(item, startDate, endDate));
  const feelings = inStudentPeriod(db.dailyCheckIns);
  const forgotten = inStudentPeriod(db.forgottenItems);
  const attendance = inStudentPeriod(db.absences);
  const supports = (db.supportActions || []).filter(item => item.studentId === studentId && (isWithin(item, startDate, endDate) || item.status !== '完了'));
  const contacts = inStudentPeriod(db.familyContacts).map(item => ({
    date: item.date,
    topic: item.topic,
    sharedFacts: item.sharedFacts,
    agreement: item.agreement,
    status: item.status,
  }));
  const { reverse } = createStudentAliases(db.students, studentId);
  const payload = sanitizeDeep({
    subject: '対象児童',
    period: { startDate, endDate },
    submissions: buildSubmissionSummary({ ...db, startDate, endDate, studentId }),
    checkIns: { days: new Set(feelings.map(item => item.date)).size, byFeeling: countBy(feelings, item => item.feeling) },
    forgottenItems: {
      total: forgotten.length,
      byItem: countBy(forgotten, item => item.itemName).slice(0, 8),
      bySubject: countBy(forgotten, item => item.subject).slice(0, 8),
      byImpact: countBy(forgotten, item => item.impact).slice(0, 8),
    },
    attendance: { total: attendance.length, byStatus: countBy(attendance, item => item.status) },
    supports: supports.map(item => ({ category: item.category, action: item.action, goal: item.goal, status: item.status, outcome: item.outcome || '' })),
    previousSharedContacts: contacts,
  }, db.students, studentId);
  return { payload, reverseAliases: reverse, sourceRecordCount: feelings.length + forgotten.length + attendance.length + supports.length + contacts.length };
};

export const buildHandoverPayload = ({ today, db }) => {
  const operations = buildDailyOperations({ today, ...db });
  const brief = buildHandoverBrief({ today, operations });
  const { reverse } = createStudentAliases(db.students);
  return {
    payload: { date: today, currentBrief: redactSensitiveText(brief, db.students) },
    reverseAliases: reverse,
    sourceRecordCount: operations.actions.length,
  };
};

export const buildSupportNotePayload = ({ note, students }) => {
  const trimmed = String(note || '').trim();
  if (trimmed.length < 10) throw new Error('観察メモを10文字以上入力してください');
  const { reverse } = createStudentAliases(students);
  return {
    payload: { observationMemo: redactSensitiveText(trimmed, students) },
    reverseAliases: reverse,
    sourceRecordCount: 1,
  };
};

export const findDirectIdentifiers = (payload, students = []) => {
  const text = JSON.stringify(payload);
  const found = [];
  students.forEach(student => {
    const name = String(student.name || '').trim();
    if (name && (text.includes(name) || text.includes(compactName(name)))) found.push(`児童名:${name}`);
  });
  if (EMAIL_PATTERN.test(text)) found.push('メールアドレス');
  EMAIL_PATTERN.lastIndex = 0;
  if (PHONE_PATTERN.test(text)) found.push('電話番号');
  PHONE_PATTERN.lastIndex = 0;
  return [...new Set(found)];
};

export const getPayloadByteLength = payload => new TextEncoder().encode(JSON.stringify(payload)).length;
