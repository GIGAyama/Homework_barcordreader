import { isTaskDueOn, parseLocalDate, getLocalDateString } from './taskSchedule.js';
import { submissionMatchesTask } from './dataModel.js';

// 「その日の提出率が全体の20%に満たない日は、そもそも提出が不要だった（先生が出さなかった）可能性が高い」
// という考え方にもとづき、アプリ側から「おやすみ日」の候補を提案するためのロジック。
export const REST_DAY_RATE_THRESHOLD = 0.2; // 全体（在籍児童）の20%
export const REST_DAY_DEFAULT_LOOKBACK_DAYS = 60; // さかのぼって調べる日数（提案が増えすぎないための上限）
export const REST_DAY_MAX_SUGGESTIONS = 12; // 1課題あたりの提案件数の上限（新しい日付を優先）

// 「その日は必ず提出があるはず」と言える課題タイプだけを対象にする。
// 週回数タイプは、ある日に提出が少ないのが通常運用のため（週の中で提出日を選ぶ）、日単位の提案は行わない。
export const REST_DAY_TARGET_TASK_TYPES = ['毎日（平日）', '曜日固定', '日付指定'];

// 欠席の児童はそもそもその日に提出できないため、提出率の母数（全体）から除く。
// 遅刻は登校しており提出可能なので母数に含める。
const countAbsentStudents = (absences, date) =>
  (absences || []).filter(record => record.date === date && record.status === '欠席').length;

// 指定した課題について、過去の「提出が必要だった各日」の提出率を調べ、
// しきい値（既定20%）に満たなかった日を「おやすみ日」の候補として返す。
export const buildRestDaySuggestionsForTask = (
  task,
  {
    students = [],
    logs = [],
    absences = [],
    today = getLocalDateString(new Date()),
    threshold = REST_DAY_RATE_THRESHOLD,
    lookbackDays = REST_DAY_DEFAULT_LOOKBACK_DAYS,
    maxSuggestions = REST_DAY_MAX_SUGGESTIONS,
  } = {}
) => {
  if (!task || !REST_DAY_TARGET_TASK_TYPES.includes(task.type)) return [];

  const rosterSize = students.length;
  if (rosterSize === 0) return [];

  // 当日は提出が締め切られておらず判断できないため、前日までを対象にする。
  const endDate = new Date(parseLocalDate(today));
  endDate.setDate(endDate.getDate() - 1);
  const startDate = new Date(parseLocalDate(today));
  startDate.setDate(startDate.getDate() - lookbackDays);

  const suggestions = [];
  const cursor = new Date(startDate);
  while (cursor <= endDate) {
    const dateStr = getLocalDateString(cursor);
    cursor.setDate(cursor.getDate() + 1);

    // isTaskDueOn が false の日（おやすみ日・有効期間外・アーカイブ後など）は対象外。
    if (!isTaskDueOn(task, dateStr)) continue;

    const expected = rosterSize - countAbsentStudents(absences, dateStr);
    if (expected <= 0) continue; // 全員欠席などで母数が無い日は判断しない

    const submitters = new Set(
      logs
        .filter(log => log.date === dateStr && submissionMatchesTask(log, task))
        .map(log => log.studentId)
    );
    const submitted = submitters.size;
    const rate = submitted / expected;

    if (rate < threshold) {
      suggestions.push({ date: dateStr, submitted, expected, rate });
    }
  }

  // 新しい日付を優先して上限まで返す。
  return suggestions.sort((a, b) => b.date.localeCompare(a.date)).slice(0, maxSuggestions);
};

// すべての課題についてまとめて提案を計算する。UIのバッジ表示などに使う合計件数も返す。
export const buildRestDaySuggestions = (tasks = [], context = {}) => {
  const byTaskId = {};
  let totalCount = 0;
  (tasks || []).forEach(task => {
    if (task.archived) return; // 終了した課題には新しいおやすみ日を提案しない
    const suggestions = buildRestDaySuggestionsForTask(task, context);
    if (suggestions.length > 0) {
      byTaskId[task.id] = suggestions;
      totalCount += suggestions.length;
    }
  });
  return { byTaskId, totalCount };
};
