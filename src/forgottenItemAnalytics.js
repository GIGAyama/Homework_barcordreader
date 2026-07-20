const countBy = (items, key) => items.reduce((counts, item) => {
  const value = item[key] || '未設定';
  counts[value] = (counts[value] || 0) + 1;
  return counts;
}, {});

const ranked = counts => Object.entries(counts)
  .map(([label, count]) => ({ label, count }))
  .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'ja'));

export const analyzeForgottenItems = (records = [], startDate, endDate) => {
  const filtered = records.filter(record =>
    (!startDate || record.date >= startDate) && (!endDate || record.date <= endDate)
  );
  const uniqueStudents = new Set(filtered.map(record => record.studentId));
  const noLessonImpact = filtered.filter(record => record.impact === '影響なし').length;

  return {
    total: filtered.length,
    affectedStudents: uniqueStudents.size,
    topItems: ranked(countBy(filtered, 'itemName')),
    topSubjects: ranked(countBy(filtered, 'subject')),
    noLessonImpactRate: filtered.length ? Math.round((noLessonImpact / filtered.length) * 100) : 0,
    records: filtered,
  };
};

export const buildForgottenItemInsight = analytics => {
  if (!analytics.total) return 'この期間の忘れ物記録はありません。よい状態を継続できています。';
  const topItem = analytics.topItems[0];
  const topSubject = analytics.topSubjects[0];
  if (topItem?.count >= 2 && topSubject?.count >= 2) {
    return `${topSubject.label}の「${topItem.label}」が目立ちます。時間割や持ち物案内の見せ方を確認する候補です。`;
  }
  if (topItem?.count >= 2) return `「${topItem.label}」の記録が${topItem.count}件あります。共通の準備方法を検討する候補です。`;
  return '特定の品目への大きな偏りはありません。記録を続けると曜日・教科別の傾向が見えてきます。';
};
