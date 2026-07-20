const DAY_NAMES = ['日', '月', '火', '水', '木', '金', '土'];

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
  if (task.archived && (!task.archivedAt || dateString >= task.archivedAt)) return false;
  const day = parseLocalDate(dateString).getDay();
  if (task.type === '毎日（平日）') return day >= 1 && day <= 5;
  if (task.type === '曜日固定') return task.value === DAY_NAMES[day];
  if (task.type === '日付指定') return task.value === dateString;
  if (task.type === '週回数') return true;
  return false;
};
