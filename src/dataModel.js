export const DATA_SCHEMA_VERSION = 2;

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
    supportActions: (source.supportActions || []).map(item => ({ ...item, eventType: 'support-action' })),
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
  exportDate: new Date().toISOString(),
  syncMeta: { app: 'shukudai-post', version: DATA_SCHEMA_VERSION, updatedAt },
});

export const isValidBackupData = data =>
  !!(data && Array.isArray(data.students) && Array.isArray(data.tasks) && Array.isArray(data.logs) && data.config);
