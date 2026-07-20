export const DATA_SCHEMA_VERSION = 5;

const randomPart = () => {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return Math.random().toString(36).slice(2, 11);
};

export const createEventId = (prefix = 'event') => `${prefix}-${Date.now()}-${randomPart()}`;

export const submissionMatchesTask = (submission, task) =>
  submission.taskId ? submission.taskId === task.id : submission.taskName === task.name;

export const upsertDailyCheckIn = (checkIns, nextCheckIn) => {
  const list = checkIns || [];
  const index = list.findIndex(
    item => item.studentId === nextCheckIn.studentId && item.date === nextCheckIn.date
  );
  if (index < 0) return [...list, nextCheckIn];
  return list.map((item, itemIndex) => itemIndex === index ? { ...item, ...nextCheckIn, id: item.id } : item);
};

export const createDailyCheckIn = ({ student, date, feeling, timestamp = Date.now() }) => ({
  id: createEventId('checkin'),
  eventType: 'daily-check-in',
  date,
  studentId: student.id,
  studentName: student.name,
  feeling,
  timestamp,
});

export const createSubmissionEvent = ({ student, task, date, isManual = false, timestamp = Date.now() }) => ({
  id: createEventId('submission'),
  eventType: 'submission',
  date,
  studentId: student.id,
  studentName: student.name,
  taskId: task.id,
  taskName: task.name,
  timestamp,
  isManual,
});

export const createForgottenItemEvent = ({
  student,
  date,
  itemName,
  subject,
  period,
  impact,
  response,
  note = '',
  timestamp = Date.now(),
}) => ({
  id: createEventId('forgotten-item'),
  eventType: 'forgotten-item',
  date,
  studentId: student.id,
  studentName: student.name,
  itemName,
  subject,
  period,
  impact,
  response,
  note: note.trim(),
  timestamp,
});

export const createSupportAction = ({
  student,
  date,
  category,
  observation,
  action,
  goal,
  followUpDate,
  timestamp = Date.now(),
}) => ({
  id: createEventId('support-action'),
  eventType: 'support-action',
  date,
  studentId: student.id,
  studentName: student.name,
  category,
  observation: observation.trim(),
  action: action.trim(),
  goal: goal.trim(),
  followUpDate,
  status: '実施中',
  outcome: '',
  outcomeRating: null,
  createdAt: timestamp,
  updatedAt: timestamp,
});

export const recordSupportOutcome = (supportActions, id, { outcome, outcomeRating, status }) =>
  (supportActions || []).map(item => item.id === id ? {
    ...item,
    outcome: outcome.trim(),
    outcomeRating,
    status,
    completedAt: status === '完了' ? Date.now() : null,
    updatedAt: Date.now(),
  } : item);

export const createClassImprovementAction = ({
  sourceInsightId,
  area,
  title,
  evidence,
  action,
  measure,
  startDate,
  reviewDate,
  timestamp = Date.now(),
}) => ({
  id: createEventId('class-action'),
  eventType: 'class-improvement-action',
  sourceInsightId,
  area,
  title,
  evidence,
  action,
  measure,
  startDate,
  reviewDate,
  status: '実施中',
  result: '',
  outcomeRating: null,
  createdAt: timestamp,
  updatedAt: timestamp,
});

export const recordClassImprovementOutcome = (classActions, id, { result, outcomeRating, status }) =>
  (classActions || []).map(item => item.id === id ? {
    ...item,
    result: result.trim(),
    outcomeRating,
    status,
    completedAt: status === '完了' ? Date.now() : null,
    updatedAt: Date.now(),
  } : item);

export const createFamilyContact = ({
  student,
  date,
  channel,
  topic,
  sharedFacts,
  familyResponse,
  agreement,
  followUpDate = '',
  staffName = '',
  timestamp = Date.now(),
}) => ({
  id: createEventId('family-contact'),
  eventType: 'family-contact',
  date,
  studentId: student.id,
  studentName: student.name,
  channel,
  topic,
  sharedFacts: sharedFacts.trim(),
  familyResponse: familyResponse.trim(),
  agreement: agreement.trim(),
  followUpDate,
  staffName: staffName.trim(),
  status: followUpDate ? '要フォロー' : '完了',
  followUpNote: '',
  privacyLevel: '校内限定',
  createdAt: timestamp,
  updatedAt: timestamp,
});

export const recordFamilyContactFollowUp = (familyContacts, id, { followUpNote, status, followUpDate }) =>
  (familyContacts || []).map(item => item.id === id ? {
    ...item,
    followUpNote: followUpNote.trim(),
    status,
    followUpDate: status === '完了' ? item.followUpDate : followUpDate,
    completedAt: status === '完了' ? Date.now() : null,
    updatedAt: Date.now(),
  } : item);

const normalizeTasks = (tasks = []) => tasks.map((task, index) => ({
  ...task,
  id: String(task.id || `legacy-task-${index + 1}`),
  excludeDates: task.excludeDates || [],
}));

const migrateLegacyCheckIns = (logs = [], existingCheckIns = []) => {
  const byStudentAndDate = new Map();

  logs.filter(log => log.feeling).forEach(log => {
    const key = `${log.studentId}::${log.date}`;
    const previous = byStudentAndDate.get(key);
    if (!previous || Number(log.timestamp || 0) >= Number(previous.timestamp || 0)) {
      byStudentAndDate.set(key, {
        id: `checkin-${log.studentId}-${log.date}`,
        eventType: 'daily-check-in',
        date: log.date,
        studentId: log.studentId,
        studentName: log.studentName,
        feeling: log.feeling,
        timestamp: log.timestamp || Date.now(),
        migratedFromLegacyLog: true,
      });
    }
  });

  existingCheckIns.forEach(checkIn => {
    const key = `${checkIn.studentId}::${checkIn.date}`;
    byStudentAndDate.set(key, {
      ...checkIn,
      id: checkIn.id || `checkin-${checkIn.studentId}-${checkIn.date}`,
      eventType: 'daily-check-in',
    });
  });

  return [...byStudentAndDate.values()];
};

export const migrateData = (source = {}) => {
  const tasks = normalizeTasks(source.tasks);
  const taskIdByName = new Map(tasks.map(task => [task.name, task.id]));
  const logs = (source.logs || []).map((legacyLog, index) => {
    const { feeling: _legacyFeeling, ...log } = legacyLog;
    return {
      ...log,
      id: log.id || `legacy-submission-${index + 1}`,
      eventType: 'submission',
      taskId: log.taskId || taskIdByName.get(log.taskName) || null,
    };
  });

  return {
    schemaVersion: DATA_SCHEMA_VERSION,
    students: source.students || [],
    tasks,
    logs,
    config: source.config || { pin: 'admin' },
    absences: source.absences || [],
    dailyCheckIns: migrateLegacyCheckIns(source.logs || [], source.dailyCheckIns || []),
    forgottenItems: (source.forgottenItems || []).map(item => ({ ...item, eventType: 'forgotten-item' })),
    supportActions: (source.supportActions || []).map(item => ({
      status: '実施中',
      outcome: '',
      outcomeRating: null,
      ...item,
      eventType: 'support-action',
    })),
    classActions: (source.classActions || []).map(item => ({
      status: '実施中',
      result: '',
      outcomeRating: null,
      ...item,
      eventType: 'class-improvement-action',
    })),
    familyContacts: (source.familyContacts || []).map(item => ({
      status: item.followUpDate ? '要フォロー' : '完了',
      followUpNote: '',
      privacyLevel: '校内限定',
      ...item,
      eventType: 'family-contact',
    })),
  };
};

export const buildBackupData = (db, updatedAt = Date.now()) => ({
  schemaVersion: DATA_SCHEMA_VERSION,
  students: db.students,
  tasks: db.tasks,
  logs: db.logs,
  config: db.config,
  absences: db.absences || [],
  dailyCheckIns: db.dailyCheckIns || [],
  forgottenItems: db.forgottenItems || [],
  supportActions: db.supportActions || [],
  classActions: db.classActions || [],
  familyContacts: db.familyContacts || [],
  exportDate: new Date().toISOString(),
  syncMeta: { app: 'shukudai-post', version: DATA_SCHEMA_VERSION, updatedAt },
});

export const isValidBackupData = data =>
  !!(data && Array.isArray(data.students) && Array.isArray(data.tasks) && Array.isArray(data.logs) && data.config);
