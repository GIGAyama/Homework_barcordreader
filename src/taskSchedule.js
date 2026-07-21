const DAY_NAMES = ['日', '月', '火', '水', '木', '金', '土'];

// 繰り返し発生する課題タイプ。開始日・終了日（有効期間）の設定対象。
export const RECURRING_TASK_TYPES = ['毎日（平日）', '曜日固定', '週回数'];

export const parseLocalDate = value => {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
};

export const getLocalDateString = date => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const getWeekRangeStrings = dateString => {
  const date = parseLocalDate(dateString);
  const day = date.getDay();
  const monday = new Date(date);
  monday.setDate(date.getDate() - day + (day === 0 ? -6 : 1));
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return [getLocalDateString(monday), getLocalDateString(sunday)];
};

export const isTaskDueOn = (task, dateString) => {
  if ((task.excludeDates || []).includes(dateString)) return false;
  // 課題の有効期間（任意設定）。開始日より前・終了日より後は「必要回数」に数えない。
  // これにより、まだ課題を出していなかった時期が未提出として集計されるのを防ぐ。
  if (task.startDate && dateString < task.startDate) return false;
  if (task.endDate && dateString > task.endDate) return false;
  if (task.archived && (!task.archivedAt || dateString >= task.archivedAt)) return false;
  const day = parseLocalDate(dateString).getDay();
  if (task.type === '毎日（平日）') return day >= 1 && day <= 5;
  if (task.type === '曜日固定') return task.value === DAY_NAMES[day];
  if (task.type === '日付指定') return task.value === dateString;
  if (task.type === '週回数') return true;
  return false;
};
