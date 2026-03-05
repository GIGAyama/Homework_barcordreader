/**
 * 宿題ポスト
 * 宿題提出と気持ちメーターに特化
 */

const SHEETS = {
  STUDENTS: '名簿',
  TASKS: '課題設定',
  LOGS: '提出ログ',
  CONFIG: '設定'
};

// ==========================================
// 1. ルーティング & 初期化
// ==========================================

function doGet(e) {
  const template = HtmlService.createTemplateFromFile('index');
  template.isSetup = checkSetup(); 
  return template.evaluate()
    .setTitle('宿題ポスト')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=0')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .setFaviconUrl('https://drive.google.com/uc?id=1WdiAC8nE2Sa62rbsm3XO3v9OvCFV2At4&.png');
}

function checkSetup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) return false;
  return !!ss.getSheetByName(SHEETS.STUDENTS) && 
         !!ss.getSheetByName(SHEETS.TASKS) && 
         !!ss.getSheetByName(SHEETS.LOGS) && 
         !!ss.getSheetByName(SHEETS.CONFIG);
}

function runInitialSetup() {
  try {
    if (checkSetup()) throw new Error('すでにセットアップが完了しています。');

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    if (!ss) throw new Error('スプレッドシートが見つかりません。');

    // --- パスワードをスクリプトプロパティの金庫に初期設定 ---
    const props = PropertiesService.getScriptProperties();
    if (!props.getProperty('ADMIN_PASSWORD')) {
      props.setProperty('ADMIN_PASSWORD', '1234');
    }
    
    // 名簿
    if (!ss.getSheetByName(SHEETS.STUDENTS)) {
      const shStudents = ss.insertSheet(SHEETS.STUDENTS);
      shStudents.appendRow(['ID', '児童名', '保護者メール', '削除日時']);
      shStudents.appendRow(['1001', 'さとう 花子', '', '']);
      shStudents.appendRow(['1002', 'すずき 太郎', '', '']);
      styleSheet(shStudents);
    }

    // 課題
    if (!ss.getSheetByName(SHEETS.TASKS)) {
      const shTasks = ss.insertSheet(SHEETS.TASKS);
      shTasks.appendRow(['UUID', '種類', '設定値', '課題名', '期限', '削除日時']);
      styleSheet(shTasks);
    }

    // ログ
    if (!ss.getSheetByName(SHEETS.LOGS)) {
      const shLogs = ss.insertSheet(SHEETS.LOGS);
      shLogs.appendRow(['提出日時', '児童ID', '児童名', '課題名', '課題日付', 'きもち']);
      styleSheet(shLogs);
    }

    // 設定
    if (!ss.getSheetByName(SHEETS.CONFIG)) {
      const shConfig = ss.insertSheet(SHEETS.CONFIG);
      shConfig.appendRow(['項目', '値']);
      shConfig.appendRow(['notification_time', '17']);
      shConfig.appendRow(['email_subject', '【未提出通知】']);
      shConfig.appendRow(['notification_email', '']); 
      styleSheet(shConfig);
    }

    const defaultSheet = ss.getSheetByName('シート1');
    if (defaultSheet && ss.getSheets().length > 1) { ss.deleteSheet(defaultSheet); }

    updateTrigger('17');
    return { success: true };
  } catch (e) { return { success: false, error: e.message }; }
}

function styleSheet(sheet) {
  sheet.setFrozenRows(1);
  const lastCol = sheet.getLastColumn();
  sheet.getRange(1, 1, 1, lastCol).setFontWeight('bold').setBackground('#4f46e5').setFontColor('#ffffff');
  sheet.getRange(2, 1, sheet.getMaxRows() - 1, lastCol).applyRowBanding(SpreadsheetApp.BandingTheme.LIGHT_GREY);
}

function getDB() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('データベースエラー: アクセスできません。');
  return ss;
}

// ==========================================
// 2. API: 認証
// ==========================================

function verifyPassword(inputPass) {
  const props = PropertiesService.getScriptProperties();
  const storedPass = props.getProperty('ADMIN_PASSWORD') || '1234';
  return String(inputPass) === storedPass;
}

// ==========================================
// 3. API: 児童用 (提出・きもち)
// ==========================================

function getStudentData(inputId) {
  const ss = getDB();
  const shStudents = ss.getSheetByName(SHEETS.STUDENTS);
  if (!shStudents) throw new Error('システムエラー: 名簿がありません。');

  const data = shStudents.getDataRange().getValues();
  let student = null;
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(inputId) && data[i][3] === "") { student = { id: data[i][0], name: data[i][1] }; break; }
  }
  if (!student) throw new Error('IDがみつかりません。');

  const today = new Date();
  const tasks = getActiveTasks(ss, today);
  const statusTasks = checkSubmission(ss, student.id, tasks, today);

  const visibleTasks = statusTasks.filter(task => {
    if (task.type === '週回数' && !task.done && task.quotaReached) return false;
    return true;
  });

  return { error: false, student: student, tasks: visibleTasks };
}

function submitHomeworkAndFeeling(payload) {
  const ss = getDB();
  const shLogs = ss.getSheetByName(SHEETS.LOGS);
  const timestamp = new Date();

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    payload.tasks.forEach(task => {
      shLogs.appendRow([timestamp, payload.id, payload.name, task.name, task.date, payload.feeling || '']);
    });
    return { success: true };
  } catch (e) {
    throw new Error('システムが混み合っています。自動でやり直します...');
  } finally {
    lock.releaseLock();
  }
}

// ==========================================
// 4. API: 管理者用コアロジック
// ==========================================

function getAdminData() {
  const ss = getDB();
  const shTasks = ss.getSheetByName(SHEETS.TASKS);
  const shStudents = ss.getSheetByName(SHEETS.STUDENTS);
  const shConfig = ss.getSheetByName(SHEETS.CONFIG);
  
  const tasks = [];
  const taskRows = shTasks.getDataRange().getValues();
  for(let i=1; i<taskRows.length; i++){
    if(taskRows[i][5] === "" && taskRows[i][1] !== '除外') {
      tasks.push({ uuid: taskRows[i][0], type: taskRows[i][1], value: formatDateIfDate(taskRows[i][2]), name: taskRows[i][3], deadline: formatDateIfDate(taskRows[i][4]) });
    }
  }

  const students = [];
  const stRows = shStudents.getDataRange().getValues();
  for(let i=1; i<stRows.length; i++){
    if(stRows[i][3] === "") { students.push({ id: stRows[i][0], name: stRows[i][1], email: stRows[i][2] }); }
  }

  const config = {};
  const configRows = shConfig.getDataRange().getValues();
  for(let i=1; i<configRows.length; i++) config[configRows[i][0]] = configRows[i][1];
  
  const props = PropertiesService.getScriptProperties();
  config['admin_password'] = props.getProperty('ADMIN_PASSWORD') || '1234';

  return { tasks, students, config };
}

function getTodayFeelings() {
  const shLogs = getDB().getSheetByName(SHEETS.LOGS);
  if(!shLogs) return [];
  
  const today = new Date();
  today.setHours(0,0,0,0);
  const logs = shLogs.getDataRange().getValues();
  const feelingsMap = {};
  
  for (let i = logs.length - 1; i >= 1; i--) {
    const logDate = new Date(logs[i][0]);
    if (logDate >= today) {
      const stId = String(logs[i][1]);
      const feeling = logs[i][5];
      if (!feelingsMap[stId] && feeling) {
        feelingsMap[stId] = { id: stId, name: logs[i][2], feeling: feeling, time: Utilities.formatDate(logDate, Session.getScriptTimeZone(), 'HH:mm') };
      }
    }
  }
  return Object.values(feelingsMap).sort((a,b) => a.id.localeCompare(b.id));
}

function getAdminDailyTasks(dateStr) {
  return getActiveTasks(getDB(), new Date(dateStr)).map(t => ({ uuid: t.uuid, name: t.name, type: t.originalType || '不明' }));
}

function saveTask(task) {
  getDB().getSheetByName(SHEETS.TASKS).appendRow([Utilities.getUuid(), task.type, task.value, task.name, task.deadline, ""]);
  return getAdminData();
}

function deleteTask(uuid) {
  const shTasks = getDB().getSheetByName(SHEETS.TASKS);
  const data = shTasks.getDataRange().getValues();
  for(let i=1; i<data.length; i++){
    if(String(data[i][0]) === uuid) { shTasks.getRange(i+1, 6).setValue(new Date()); break; }
  }
  return getAdminData();
}

function excludeTask(taskUuid, dateStr) {
  getDB().getSheetByName(SHEETS.TASKS).appendRow([Utilities.getUuid(), '除外', dateStr, taskUuid, '', '']);
  return getAdminDailyTasks(dateStr);
}

function saveStudent(st) {
  const shStudents = getDB().getSheetByName(SHEETS.STUDENTS);
  const data = shStudents.getDataRange().getValues();
  let row = -1;
  for(let i=1; i<data.length; i++){
    if(String(data[i][0]) === String(st.id) && data[i][3] === "") { row = i + 1; break; }
  }
  if (row > 0) {
    shStudents.getRange(row, 2).setValue(st.name); shStudents.getRange(row, 3).setValue(st.email);
  } else {
    shStudents.appendRow([st.id, st.name, st.email, ""]);
  }
  return getAdminData();
}

function deleteStudent(id) {
  const shStudents = getDB().getSheetByName(SHEETS.STUDENTS);
  const data = shStudents.getDataRange().getValues();
  for(let i=1; i<data.length; i++){
    if(String(data[i][0]) === String(id) && data[i][3] === "") { shStudents.getRange(i+1, 4).setValue(new Date()); break; }
  }
  return getAdminData();
}

function saveConfig(config) {
  const props = PropertiesService.getScriptProperties();
  if (config.admin_password) {
    props.setProperty('ADMIN_PASSWORD', config.admin_password);
  }

  const shConfig = getDB().getSheetByName(SHEETS.CONFIG);
  const data = shConfig.getDataRange().getValues();
  const configMap = {};
  for(let i=1; i<data.length; i++) configMap[data[i][0]] = i + 1;

  const keys = ['notification_time', 'email_subject', 'notification_email'];
  keys.forEach(key => {
    if (config[key] !== undefined) {
      if (configMap[key]) { shConfig.getRange(configMap[key], 2).setValue(config[key]); } 
      else { shConfig.appendRow([key, config[key]]); }
    }
  });
  updateTrigger(config.notification_time);
  return { success: true };
}

function getPeriodReport(startStr, endStr) {
  const ss = getDB();
  const startDate = new Date(startStr); const endDate = new Date(endStr);
  startDate.setHours(0,0,0,0); endDate.setHours(0,0,0,0);
  const shStudents = ss.getSheetByName(SHEETS.STUDENTS);
  const stData = shStudents.getDataRange().getValues();
  const students = {};
  for (let i = 1; i < stData.length; i++) {
    if (stData[i][3] === "") students[stData[i][0]] = { id: stData[i][0], name: stData[i][1], submitted: 0, required: 0 };
  }
  const logs = ss.getSheetByName(SHEETS.LOGS).getDataRange().getValues();
  const logMap = new Set();
  for (let i = 1; i < logs.length; i++) {
    const lDateObj = new Date(logs[i][4]);
    if (lDateObj >= startDate && lDateObj <= endDate) {
      logMap.add(`${Utilities.formatDate(lDateObj, Session.getScriptTimeZone(), 'yyyy/MM/dd')}_${logs[i][1]}_${logs[i][3]}`);
    }
  }
  const taskData = ss.getSheetByName(SHEETS.TASKS).getDataRange().getValues();
  const exclusionMap = new Map();
  for(let i=1; i<taskData.length; i++) {
    if(taskData[i][5] === "" && taskData[i][1] === '除外') {
      const dateKey = formatDateIfDate(taskData[i][2]);
      if(!exclusionMap.has(dateKey)) exclusionMap.set(dateKey, new Set());
      exclusionMap.get(dateKey).add(taskData[i][3]);
    }
  }
  let loopDate = new Date(startDate);
  const dayNames = ['日', '月', '火', '水', '木', '金', '土'];
  while (loopDate <= endDate) {
    const dateStr = Utilities.formatDate(loopDate, Session.getScriptTimeZone(), 'yyyy/MM/dd');
    const dayStr = dayNames[loopDate.getDay()];
    const dayNum = loopDate.getDay();
    const exclusions = exclusionMap.get(dateStr) || new Set();
    const activeTasks = [];
    for(let i=1; i<taskData.length; i++) {
      const [uuid, type, value, name, deadline, deletedAt] = taskData[i];
      if(deletedAt !== "" || !name || type === '除外' || exclusions.has(uuid)) continue;
      let isMatch = false;
      if(type === '日付指定') { const d = new Date(value); d.setHours(0,0,0,0); if(d.getTime() === loopDate.getTime()) isMatch = true; } 
      else if(type === '曜日固定') { if(value === dayStr) isMatch = true; } 
      else if(type === '毎日（平日）') { if(dayNum >= 1 && dayNum <= 5) isMatch = true; } 
      else if(type === '特別') { const start = new Date(value); const end = new Date(deadline); start.setHours(0,0,0,0); end.setHours(0,0,0,0); if(loopDate >= start && loopDate <= end) isMatch = true; } 
      else if(type === '週回数') { isMatch = true; }
      if(isMatch) activeTasks.push(name);
    }
    if (activeTasks.length > 0) {
      Object.keys(students).forEach(stId => {
        students[stId].required += activeTasks.length;
        activeTasks.forEach(taskName => {
          if (logMap.has(`${dateStr}_${stId}_${taskName}`)) students[stId].submitted++;
        });
      });
    }
    loopDate.setDate(loopDate.getDate() + 1);
  }
  const studentList = Object.values(students).map(st => ({
    id: st.id, name: st.name, submitted: st.submitted, required: st.required,
    rate: st.required > 0 ? Math.round((st.submitted / st.required) * 100) : 0
  })).sort((a, b) => a.rate - b.rate);
  const totalReq = studentList.reduce((acc, cur) => acc + cur.required, 0);
  const totalSub = studentList.reduce((acc, cur) => acc + cur.submitted, 0);
  return { start: startStr, end: endStr, overallRate: totalReq > 0 ? Math.round((totalSub / totalReq) * 100) : 0, students: studentList };
}

function updateTrigger(hour) {
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(t => { if (t.getHandlerFunction() === 'sendReport') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('sendReport').timeBased().atHour(parseInt(hour)).everyDays(1).create();
}

function sendReport() {
  const ss = getDB();
  const configMap = {};
  ss.getSheetByName(SHEETS.CONFIG).getDataRange().getValues().forEach(row => { configMap[row[0]] = row[1]; });
  
  const teacherEmail = configMap['notification_email'] || Session.getEffectiveUser().getEmail();
  const today = new Date();
  const dateStr = Utilities.formatDate(today, Session.getScriptTimeZone(), 'yyyy/MM/dd');

  const tasks = getActiveTasks(ss, today);
  if (tasks.length === 0) return;

  const stRows = ss.getSheetByName(SHEETS.STUDENTS).getDataRange().getValues();
  const unsubmittedList = [];

  for (let i = 1; i < stRows.length; i++) {
    if (stRows[i][3] !== "") continue;
    const statusTasks = checkSubmission(ss, stRows[i][0], tasks, today);
    const missing = statusTasks.filter(t => !t.done && !(t.type === '週回数' && t.quotaReached));
    if (missing.length > 0) unsubmittedList.push(`・${stRows[i][1]} さん (${missing.map(t => t.name).join(', ')})`);
  }

  if (unsubmittedList.length > 0) {
    const subject = configMap['email_subject'] || '【未提出通知】';
    const body = `お疲れ様です。\n本日(${dateStr})の未提出状況をお知らせします。\n\n【未提出者一覧】\n${unsubmittedList.join('\n')}\n\nご確認ください。`;
    MailApp.sendEmail({ to: teacherEmail, subject: subject, body: body });
  }
}

function getActiveTasks(ss, targetDate) {
  const data = ss.getSheetByName(SHEETS.TASKS).getDataRange().getValues();
  targetDate.setHours(0,0,0,0);
  const dateStr = Utilities.formatDate(targetDate, Session.getScriptTimeZone(), 'yyyy/MM/dd');
  const dayStr = ['日', '月', '火', '水', '木', '金', '土'][targetDate.getDay()];
  const dayNum = targetDate.getDay();

  const exclusions = new Set();
  for(let i=1; i<data.length; i++) {
    if (data[i][5] === "" && data[i][1] === '除外' && formatDateIfDate(data[i][2]) === dateStr) exclusions.add(data[i][3]);
  }

  const tasks = [];
  for(let i=1; i<data.length; i++) {
    const [uuid, type, value, name, deadline, deletedAt] = data[i];
    if(deletedAt !== "" || !name || type === '除外' || exclusions.has(uuid)) continue;

    let isMatch = false; let weeklyTarget = 0;
    if(type === '日付指定') { const d = new Date(value); d.setHours(0,0,0,0); if(d.getTime() === targetDate.getTime()) isMatch = true; } 
    else if(type === '曜日固定') { if(value === dayStr) isMatch = true; } 
    else if(type === '毎日（平日）') { if(dayNum >= 1 && dayNum <= 5) isMatch = true; } 
    else if(type === '特別') { const start = new Date(value); const end = new Date(deadline); start.setHours(0,0,0,0); end.setHours(0,0,0,0); if(targetDate >= start && targetDate <= end) isMatch = true; } 
    else if (type === '週回数') { isMatch = true; weeklyTarget = parseInt(value, 10) || 1; }
    
    if(isMatch) tasks.push({ uuid, name, date: dateStr, type: type, originalType: type, weeklyTarget: weeklyTarget });
  }
  return tasks;
}

function checkSubmission(ss, studentId, tasks, targetDate) {
  const logs = ss.getSheetByName(SHEETS.LOGS).getDataRange().getValues();
  const dateStr = Utilities.formatDate(targetDate, Session.getScriptTimeZone(), 'yyyy/MM/dd');
  const d = new Date(targetDate);
  const diffToMon = d.getDate() - d.getDay() + (d.getDay() === 0 ? -6 : 1);
  const monday = new Date(d.setDate(diffToMon)); monday.setHours(0,0,0,0);
  const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6); sunday.setHours(23,59,59,999);

  const weeklyCounts = {};
  for(let i=logs.length-1; i>=1; i--) {
    if(String(logs[i][1]) !== String(studentId)) continue;
    const logDate = new Date(logs[i][4]);
    if(logDate >= monday && logDate <= sunday) { weeklyCounts[logs[i][3]] = (weeklyCounts[logs[i][3]] || 0) + 1; }
  }

  return tasks.map(task => {
    let isDone = false;
    for(let i=logs.length-1; i>=1; i--) {
      if(String(logs[i][1]) === String(studentId) && logs[i][3] === task.name && formatDateIfDate(logs[i][4]) === dateStr) { isDone = true; break; }
    }
    const weeklyCount = task.type === '週回数' ? (weeklyCounts[task.name] || 0) : 0;
    return { ...task, done: isDone, weeklyCount: weeklyCount, quotaReached: task.type === '週回数' && weeklyCount >= task.weeklyTarget };
  });
}

function formatDateIfDate(v) { return v instanceof Date ? Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy/MM/dd') : v; }
