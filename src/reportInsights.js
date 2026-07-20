const isWithin = (date, startDate, endDate) => Boolean(date && date >= startDate && date <= endDate);

const rankValues = (items, key) => {
  const counts = new Map();
  items.forEach(item => {
    const value = String(item[key] || '').trim();
    if (value) counts.set(value, (counts.get(value) || 0) + 1);
  });
  return [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'ja'));
};

const toFamilySupport = item => ({
  id: item.id,
  category: item.category,
  action: item.action,
  goal: item.goal,
  status: item.status,
  outcome: item.outcome || '',
  outcomeRating: item.outcomeRating || null,
});

const toInternalSupport = item => ({
  ...toFamilySupport(item),
  observation: item.observation || '',
  date: item.date,
  followUpDate: item.followUpDate || '',
});

export const buildStudentReportInsights = ({
  studentId,
  startDate,
  endDate,
  taskStats = [],
  dailyCheckIns = [],
  forgottenItems = [],
  absences = [],
  supportActions = [],
}) => {
  const totalRequired = taskStats.reduce((sum, task) => sum + task.required, 0);
  const totalSubmitted = taskStats.reduce((sum, task) => sum + task.submitted, 0);
  const checkIns = dailyCheckIns.filter(item => item.studentId === studentId && isWithin(item.date, startDate, endDate));
  const forgotten = forgottenItems.filter(item => item.studentId === studentId && isWithin(item.date, startDate, endDate));
  const attendance = absences.filter(item => item.studentId === studentId && isWithin(item.date, startDate, endDate));
  const supports = supportActions
    .filter(item => item.studentId === studentId && (
      isWithin(item.date, startDate, endDate)
      || (item.status !== '完了' && (!item.date || item.date <= endDate))
    ))
    .sort((a, b) => (a.status === '完了') - (b.status === '完了') || String(b.date || '').localeCompare(String(a.date || '')));

  return {
    totalRequired,
    totalSubmitted,
    overallRate: totalRequired > 0 ? Math.round((totalSubmitted / totalRequired) * 100) : null,
    checkInDays: new Set(checkIns.map(item => item.date)).size,
    forgotten: {
      total: forgotten.length,
      topItems: rankValues(forgotten, 'itemName'),
      topSubjects: rankValues(forgotten, 'subject'),
    },
    attendance: {
      total: attendance.length,
      byStatus: rankValues(attendance, 'status'),
    },
    familySupports: supports.map(toFamilySupport),
    internalSupports: supports.map(toInternalSupport),
  };
};
