/**
 * 宿題ポスト - GIGA Standard Edition
 * v1.0 (Email Customization)
 */

const PROPS = PropertiesService.getScriptProperties();

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
  const ssId = PROPS.getProperty('SS_ID');
  const template = HtmlService.createTemplateFromFile('index');
  template.isSetup = !!ssId; 
  return template.evaluate()
    .setTitle('宿題ポスト')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .setFaviconUrl('https://drive.google.com/uc?id=1WdiAC8nE2Sa62rbsm3XO3v9OvCFV2At4&.png');
}

function runInitialSetup() {
  try {
    if (PROPS.getProperty('SS_ID')) throw new Error('すでにセットアップが完了しています。');

    const ss = SpreadsheetApp.create('宿題ポスト_データベース');
    const ssId = ss.getId();
    
    // 名簿
    const shStudents = ss.insertSheet(SHEETS.STUDENTS);
    shStudents.appendRow(['ID', '児童名', '保護者メール', '削除日時']);
    shStudents.appendRow(['1001', 'さとう 花子', '', '']);
    shStudents.appendRow(['1002', 'すずき 太郎', '', '']);
    styleSheet(shStudents);

    // 課題
    const shTasks = ss.insertSheet(SHEETS.TASKS);
    shTasks.appendRow(['UUID', '種類', '設定値', '課題名', '期限', '削除日時']);
    styleSheet(shTasks);

    // ログ
    const shLogs = ss.insertSheet(SHEETS.LOGS);
    shLogs.appendRow(['提出日時', '児童ID', '児童名', '課題名', '課題日付']);
    styleSheet(shLogs);

    // 設定
    const shConfig = ss.insertSheet(SHEETS.CONFIG);
    shConfig.appendRow(['項目', '値']);
    shConfig.appendRow(['notification_time', '17']);
    shConfig.appendRow(['email_subject', '【未提出通知】']);
    shConfig.appendRow(['admin_password', '1234']); 
    // メールアドレス設定用の行は saveConfig で自動追加されるため、ここでは必須ではないが枠だけ用意
    shConfig.appendRow(['notification_email', '']); 
    styleSheet(shConfig);

    const defaultSheet = ss.getSheetByName('シート1');
    if (defaultSheet) ss.deleteSheet(defaultSheet);

    PROPS.setProperty('SS_ID', ssId);
    updateTrigger('17');

    return { success: true, url: ss.getUrl() };

  } catch (e) {
    return { success: false, error: e.message };
  }
}

function styleSheet(sheet) {
  sheet.setFrozenRows(1);
  const lastCol = sheet.getLastColumn();
  sheet.getRange(1, 1, 1, lastCol).setFontWeight('bold').setBackground('#1a73e8').setFontColor('#ffffff');
  sheet.getRange(2, 1, sheet.getMaxRows() - 1, lastCol).applyRowBanding(SpreadsheetApp.BandingTheme.LIGHT_GREY);
}

function getDB() {
  const id = PROPS.getProperty('SS_ID');
  if (!id) throw new Error('セットアップが完了していません。');
  try {
    return SpreadsheetApp.openById(id);
  } catch (e) {
    console.warn('DB修復実行', e);
    PROPS.deleteProperty('SS_ID');
    const res = runInitialSetup();
    if (res.success) return SpreadsheetApp.openById(PROPS.getProperty('SS_ID'));
    throw new Error('修復失敗: ' + res.error);
  }
}

// ==========================================
// 2. API: 認証・セキュリティ
// ==========================================

function verifyPassword(inputPass) {
  const ss = getDB();
  const shConfig = ss.getSheetByName(SHEETS.CONFIG);
  const data = shConfig.getDataRange().getValues();
  let storedPass = '1234'; 
  for(let i=1; i<data.length; i++) {
    if(data[i][0] === 'admin_password') {
      storedPass = String(data[i][1]);
      break;
    }
  }
  return String(inputPass) === storedPass;
}

// ==========================================
// 3. API: 児童用
// ==========================================

function getStudentData(inputId) {
  const ss = getDB();
  const shStudents = ss.getSheetByName(SHEETS.STUDENTS);
  if (!shStudents) return { error: true, message: '名簿シートが見つかりません' };

  const data = shStudents.getDataRange().getValues();
  let student = null;

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(inputId) && data[i][3] === "") {
      student = { id: data[i][0], name: data[i][1] };
      break;
    }
  }

  if (!student) return { error: true, message: 'IDが見つかりません。' };

  const today = new Date();
  const tasks = getActiveTasks(ss, today);
  const statusTasks = checkSubmission(ss, student.id, tasks, today);

  // 表示すべき課題だけフィルタリング
  const visibleTasks = statusTasks.filter(task => {
    // 週回数タイプで、今日未提出 かつ 既に今週の目標回数を達成している場合は非表示にする
    if (task.type === '週回数' && !task.done && task.quotaReached) {
      return false; // もうやらなくていい
    }
    return true;
  });

  return { error: false, student: student, tasks: visibleTasks };
}

function submitHomework(payload) {
  const ss = getDB();
  const shLogs = ss.getSheetByName(SHEETS.LOGS);
  const timestamp = new Date();

  payload.tasks.forEach(task => {
    shLogs.appendRow([timestamp, payload.id, payload.name, task.name, task.date]);
  });
  return { success: true };
}

// ==========================================
// 4. API: 管理者用
// ==========================================

function getAdminData() {
  const ss = getDB();
  const shTasks = ss.getSheetByName(SHEETS.TASKS);
  const shStudents = ss.getSheetByName(SHEETS.STUDENTS);
  const shConfig = ss.getSheetByName(SHEETS.CONFIG);
  
  // 課題
  const taskRows = shTasks.getDataRange().getValues();
  const tasks = [];
  for(let i=1; i<taskRows.length; i++){
    if(taskRows[i][5] === "" && taskRows[i][1] !== '除外') {
      tasks.push({
        uuid: taskRows[i][0], type: taskRows[i][1], value: formatDateIfDate(taskRows[i][2]),
        name: taskRows[i][3], deadline: formatDateIfDate(taskRows[i][4])
      });
    }
  }

  // 児童
  const stRows = shStudents.getDataRange().getValues();
  const students = [];
  for(let i=1; i<stRows.length; i++){
    if(stRows[i][3] === "") {
      students.push({ id: stRows[i][0], name: stRows[i][1], email: stRows[i][2] });
    }
  }

  // 設定
  const configRows = shConfig.getDataRange().getValues();
  const config = {};
  for(let i=1; i<configRows.length; i++){
    config[configRows[i][0]] = configRows[i][1];
  }

  return { tasks: tasks, students: students, config: config };
}

// 日付を指定して「その日に有効な課題リスト」を取得する（管理画面用）
function getAdminDailyTasks(dateStr) {
  const ss = getDB();
  const targetDate = new Date(dateStr);
  const activeTasks = getActiveTasks(ss, targetDate);
  
  // 管理画面用に整形
  return activeTasks.map(t => ({
    uuid: t.uuid,
    name: t.name,
    type: t.originalType || '不明'
  }));
}

function saveTask(task) {
  const ss = getDB();
  const shTasks = ss.getSheetByName(SHEETS.TASKS);
  const uuid = Utilities.getUuid();
  shTasks.appendRow([uuid, task.type, task.value, task.name, task.deadline, ""]);
  return getAdminData();
}

function deleteTask(uuid) {
  const ss = getDB();
  const shTasks = ss.getSheetByName(SHEETS.TASKS);
  const data = shTasks.getDataRange().getValues();
  const now = new Date();
  for(let i=1; i<data.length; i++){
    if(String(data[i][0]) === uuid) {
      shTasks.getRange(i+1, 6).setValue(now);
      break;
    }
  }
  return getAdminData();
}

function excludeTask(taskUuid, dateStr) {
  const ss = getDB();
  const shTasks = ss.getSheetByName(SHEETS.TASKS);
  const newUuid = Utilities.getUuid();
  shTasks.appendRow([newUuid, '除外', dateStr, taskUuid, '', '']);
  return getAdminDailyTasks(dateStr);
}

// --- 児童一括登録 ---
function saveStudent(st) {
  const ss = getDB();
  const shStudents = ss.getSheetByName(SHEETS.STUDENTS);
  const data = shStudents.getDataRange().getValues();
  let row = -1;
  for(let i=1; i<data.length; i++){
    if(String(data[i][0]) === String(st.id) && data[i][3] === "") {
      row = i + 1; break;
    }
  }
  if (row > 0) {
    shStudents.getRange(row, 2).setValue(st.name);
    shStudents.getRange(row, 3).setValue(st.email);
  } else {
    shStudents.appendRow([st.id, st.name, st.email, ""]);
  }
  return getAdminData();
}

function bulkSaveStudents(tsvData) {
  const ss = getDB();
  const shStudents = ss.getSheetByName(SHEETS.STUDENTS);
  const data = shStudents.getDataRange().getValues();
  const idMap = new Map();
  for(let i=1; i<data.length; i++) {
    if(data[i][3] === "") idMap.set(String(data[i][0]), i + 1);
  }

  const lines = tsvData.split('\n');
  const rowsToAdd = [];

  lines.forEach(line => {
    const parts = line.split(/[\t,]+/).map(s => s.trim());
    if (parts.length < 2) return; 
    const id = parts[0];
    const name = parts[1];
    const email = parts[2] || "";

    if (idMap.has(id)) {
      const row = idMap.get(id);
      shStudents.getRange(row, 2).setValue(name);
      shStudents.getRange(row, 3).setValue(email);
    } else {
      rowsToAdd.push([id, name, email, ""]);
    }
  });

  if (rowsToAdd.length > 0) {
    shStudents.getRange(shStudents.getLastRow() + 1, 1, rowsToAdd.length, 4).setValues(rowsToAdd);
  }
  return getAdminData();
}

function deleteStudent(id) {
  const ss = getDB();
  const shStudents = ss.getSheetByName(SHEETS.STUDENTS);
  const data = shStudents.getDataRange().getValues();
  const now = new Date();
  for(let i=1; i<data.length; i++){
    if(String(data[i][0]) === String(id) && data[i][3] === "") {
      shStudents.getRange(i+1, 4).setValue(now);
      break;
    }
  }
  return getAdminData();
}

// --- 設定・リセット ---
function saveConfig(config) {
  const ss = getDB();
  const shConfig = ss.getSheetByName(SHEETS.CONFIG);
  
  // 設定シートを一度クリアして書き直す
  const lastRow = shConfig.getLastRow();
  if (lastRow > 1) shConfig.getRange(2, 1, lastRow - 1, 2).clearContent();
  
  let row = 2;
  const keys = ['notification_time', 'email_subject', 'admin_password', 'notification_email']; // キー追加
  keys.forEach(key => {
    if (config[key]) {
      shConfig.getRange(row, 1).setValue(key);
      shConfig.getRange(row, 2).setValue(config[key]);
      row++;
    }
  });

  updateTrigger(config.notification_time);
  return { success: true };
}

function resetForNewYear() {
  const ss = getDB();
  const now = new Date();
  const timeStr = Utilities.formatDate(now, Session.getScriptTimeZone(), 'yyyyMMdd_HHmm');
  const shLogs = ss.getSheetByName(SHEETS.LOGS);
  if (shLogs) shLogs.setName(`${SHEETS.LOGS}_${timeStr}`);
  const newLogs = ss.insertSheet(SHEETS.LOGS);
  newLogs.appendRow(['提出日時', '児童ID', '児童名', '課題名', '課題日付']);
  styleSheet(newLogs);
  const shStudents = ss.getSheetByName(SHEETS.STUDENTS);
  if (shStudents.getLastRow() > 1) shStudents.deleteRows(2, shStudents.getLastRow() - 1);
  const shTasks = ss.getSheetByName(SHEETS.TASKS);
  if (shTasks.getLastRow() > 1) shTasks.deleteRows(2, shTasks.getLastRow() - 1);
  return { success: true };
}

// ==========================================
// 5. 分析レポート機能
// ==========================================

function getPeriodReport(startStr, endStr) {
  const ss = getDB();
  const startDate = new Date(startStr);
  const endDate = new Date(endStr);
  startDate.setHours(0,0,0,0);
  endDate.setHours(0,0,0,0);

  const shStudents = ss.getSheetByName(SHEETS.STUDENTS);
  const stData = shStudents.getDataRange().getValues();
  const students = {};
  for (let i = 1; i < stData.length; i++) {
    if (stData[i][3] === "") students[stData[i][0]] = { id: stData[i][0], name: stData[i][1], submitted: 0, required: 0 };
  }

  const shLogs = ss.getSheetByName(SHEETS.LOGS);
  const logs = shLogs.getDataRange().getValues();
  const logMap = new Set();
  for (let i = 1; i < logs.length; i++) {
    const lDateObj = new Date(logs[i][4]);
    if (lDateObj >= startDate && lDateObj <= endDate) {
      const dStr = Utilities.formatDate(lDateObj, Session.getScriptTimeZone(), 'yyyy/MM/dd');
      logMap.add(`${dStr}_${logs[i][1]}_${logs[i][3]}`);
    }
  }

  const shTasks = ss.getSheetByName(SHEETS.TASKS);
  const taskData = shTasks.getDataRange().getValues();
  
  const exclusionMap = new Map();
  for(let i=1; i<taskData.length; i++) {
    const [uuid, type, value, name, deadline, deletedAt] = taskData[i];
    if(deletedAt === "" && type === '除外') {
      const dateKey = formatDateIfDate(value);
      if(!exclusionMap.has(dateKey)) exclusionMap.set(dateKey, new Set());
      exclusionMap.get(dateKey).add(name);
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
      if(deletedAt !== "" || !name || type === '除外') continue;
      if (exclusions.has(uuid)) continue;

      let isMatch = false;
      if(type === '日付指定') {
        const d = new Date(value); d.setHours(0,0,0,0);
        if(d.getTime() === loopDate.getTime()) isMatch = true;
      } else if(type === '曜日固定') {
        if(value === dayStr) isMatch = true;
      } else if(type === '毎日（平日）') {
        if(dayNum >= 1 && dayNum <= 5) isMatch = true;
      } else if(type === '特別') {
        const start = new Date(value); start.setHours(0,0,0,0);
        const end = new Date(deadline); end.setHours(0,0,0,0);
        if(loopDate >= start && loopDate <= end) isMatch = true;
      } else if(type === '週回数') {
        isMatch = true; 
      }
      if(isMatch) activeTasks.push(name);
    }

    if (activeTasks.length > 0) {
      Object.keys(students).forEach(stId => {
        students[stId].required += activeTasks.length;
        activeTasks.forEach(taskName => {
          if (logMap.has(`${dateStr}_${stId}_${taskName}`)) {
            students[stId].submitted++;
          }
        });
      });
    }
    loopDate.setDate(loopDate.getDate() + 1);
  }

  const studentList = Object.values(students).map(st => ({
    id: st.id, name: st.name, submitted: st.submitted, required: st.required,
    rate: st.required > 0 ? Math.round((st.submitted / st.required) * 100) : 0
  }));
  studentList.sort((a, b) => a.rate - b.rate);
  const totalReq = studentList.reduce((acc, cur) => acc + cur.required, 0);
  const totalSub = studentList.reduce((acc, cur) => acc + cur.submitted, 0);
  const overallRate = totalReq > 0 ? Math.round((totalSub / totalReq) * 100) : 0;

  return { start: startStr, end: endStr, overallRate: overallRate, students: studentList };
}

// ==========================================
// 6. ユーティリティ & トリガー
// ==========================================

function updateTrigger(hour) {
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(t => { if (t.getHandlerFunction() === 'sendReport') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('sendReport').timeBased().atHour(parseInt(hour)).everyDays(1).create();
}

function sendReport() {
  const ss = getDB();
  const shConfig = ss.getSheetByName(SHEETS.CONFIG);
  const shStudents = ss.getSheetByName(SHEETS.STUDENTS);
  
  const configRows = shConfig.getDataRange().getValues();
  const config = {};
  for(let i=1; i<configRows.length; i++) config[configRows[i][0]] = configRows[i][1];

  // 送信先の決定: 設定があればそれ、なければ実行ユーザー
  const teacherEmail = config['notification_email'] || Session.getEffectiveUser().getEmail();
  
  const today = new Date();
  const dateStr = Utilities.formatDate(today, Session.getScriptTimeZone(), 'yyyy/MM/dd');

  const tasks = getActiveTasks(ss, today);
  if (tasks.length === 0) return;

  const stRows = shStudents.getDataRange().getValues();
  const unsubmittedList = [];

  for (let i = 1; i < stRows.length; i++) {
    const [id, name, email, deletedAt] = stRows[i];
    if (deletedAt !== "") continue;

    const statusTasks = checkSubmission(ss, id, tasks, today);
    const missing = statusTasks.filter(t => {
      if (t.done) return false;
      if (t.type === '週回数' && t.quotaReached) return false;
      return true;
    });

    if (missing.length > 0) {
      const taskNames = missing.map(t => t.name).join(', ');
      unsubmittedList.push(`・${name} さん (${taskNames})`);
    }
  }

  if (unsubmittedList.length > 0) {
    const subject = config['email_subject'] || '【未提出通知】';
    const body = `お疲れ様です。\n本日(${dateStr})の未提出状況をお知らせします。\n\n【未提出者一覧】\n${unsubmittedList.join('\n')}\n\nご確認ください。`;
    MailApp.sendEmail({ to: teacherEmail, subject: subject, body: body });
  }
}

function getActiveTasks(ss, targetDate) {
  const shTasks = ss.getSheetByName(SHEETS.TASKS);
  const data = shTasks.getDataRange().getValues();
  
  targetDate.setHours(0,0,0,0);
  const dateStr = Utilities.formatDate(targetDate, Session.getScriptTimeZone(), 'yyyy/MM/dd');
  const dayStr = ['日', '月', '火', '水', '木', '金', '土'][targetDate.getDay()];
  const dayNum = targetDate.getDay();

  const exclusions = new Set();
  for(let i=1; i<data.length; i++) {
    const [uuid, type, value, name, deadline, deletedAt] = data[i];
    if (deletedAt === "" && type === '除外') {
      if (formatDateIfDate(value) === dateStr) {
        exclusions.add(name);
      }
    }
  }

  const tasks = [];
  for(let i=1; i<data.length; i++) {
    const [uuid, type, value, name, deadline, deletedAt] = data[i];
    if(deletedAt !== "" || !name || type === '除外') continue;
    if (exclusions.has(uuid)) continue;

    let isMatch = false;
    let weeklyTarget = 0;

    if(type === '日付指定') {
      const d = new Date(value); d.setHours(0,0,0,0);
      if(d.getTime() === targetDate.getTime()) isMatch = true;
    } else if(type === '曜日固定') {
      if(value === dayStr) isMatch = true;
    } else if(type === '毎日（平日）') {
      if(dayNum >= 1 && dayNum <= 5) isMatch = true;
    } else if(type === '特別') {
      const start = new Date(value); 
      const end = new Date(deadline);
      start.setHours(0,0,0,0); end.setHours(0,0,0,0);
      if(targetDate >= start && targetDate <= end) isMatch = true;
    } else if (type === '週回数') {
      isMatch = true;
      weeklyTarget = parseInt(value, 10) || 1;
    }
    
    if(isMatch) {
      tasks.push({
        uuid, name, date: dateStr, 
        type: type, originalType: type,
        weeklyTarget: weeklyTarget 
      });
    }
  }
  return tasks;
}

function checkSubmission(ss, studentId, tasks, targetDate) {
  const shLogs = ss.getSheetByName(SHEETS.LOGS);
  const logs = shLogs.getDataRange().getValues();
  const dateStr = Utilities.formatDate(targetDate, Session.getScriptTimeZone(), 'yyyy/MM/dd');

  const d = new Date(targetDate);
  const day = d.getDay();
  const diffToMon = d.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(d.setDate(diffToMon)); monday.setHours(0,0,0,0);
  const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6); sunday.setHours(23,59,59,999);

  const weeklyCounts = {};
  for(let i=logs.length-1; i>=1; i--) {
    const [lTime, lId, lName, lTask, lDate] = logs[i];
    if(String(lId) !== String(studentId)) continue;
    const logDate = new Date(lDate);
    if(logDate >= monday && logDate <= sunday) {
      weeklyCounts[lTask] = (weeklyCounts[lTask] || 0) + 1;
    }
  }

  return tasks.map(task => {
    let isDone = false;
    for(let i=logs.length-1; i>=1; i--) {
      const [lTime, lId, lName, lTask, lDate] = logs[i];
      if(String(lId) === String(studentId) && lTask === task.name && formatDateIfDate(lDate) === dateStr) {
        isDone = true;
        break;
      }
    }

    let quotaReached = false;
    let weeklyCount = 0;
    if (task.type === '週回数') {
      weeklyCount = weeklyCounts[task.name] || 0;
      if (weeklyCount >= task.weeklyTarget) quotaReached = true;
    }

    return { ...task, done: isDone, weeklyCount: weeklyCount, quotaReached: quotaReached };
  });
}

function formatDateIfDate(v) {
  if(v instanceof Date) return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy/MM/dd');
  return v;
}
