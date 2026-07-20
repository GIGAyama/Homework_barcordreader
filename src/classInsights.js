const CHALLENGING_FEELINGS = new Set(['イライラ', 'かなしい']);

const inPeriod = (item, startDate, endDate) => item.date >= startDate && item.date <= endDate;

const rate = (part, whole) => whole > 0 ? Math.round((part / whole) * 100) : null;

const rankBy = (items, key) => {
  const counts = new Map();
  items.forEach(item => {
    const value = String(item[key] || '').trim();
    if (value) counts.set(value, (counts.get(value) || 0) + 1);
  });
  return [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'ja'));
};

const summarizeReports = reports => {
  let required = 0;
  let submitted = 0;
  reports.forEach(report => report.taskStats.forEach(task => {
    required += task.required;
    submitted += task.submitted;
  }));
  return { required, submitted, rate: rate(submitted, required) };
};

const summarizeFeelings = (checkIns, startDate, endDate) => {
  const records = checkIns.filter(item => inPeriod(item, startDate, endDate));
  const challenging = records.filter(item => CHALLENGING_FEELINGS.has(item.feeling)).length;
  return { total: records.length, challenging, challengingRate: rate(challenging, records.length) };
};

const delta = (current, previous) => current === null || previous === null ? null : current - previous;

export const buildClassInsights = ({
  currentReports = [],
  previousReports = [],
  dailyCheckIns = [],
  forgottenItems = [],
  supportActions = [],
  currentStart,
  currentEnd,
  previousStart,
  previousEnd,
}) => {
  const currentSubmission = summarizeReports(currentReports);
  const previousSubmission = summarizeReports(previousReports);
  const currentFeelings = summarizeFeelings(dailyCheckIns, currentStart, currentEnd);
  const previousFeelings = summarizeFeelings(dailyCheckIns, previousStart, previousEnd);
  const currentForgotten = forgottenItems.filter(item => inPeriod(item, currentStart, currentEnd));
  const previousForgotten = forgottenItems.filter(item => inPeriod(item, previousStart, previousEnd));
  const topItems = rankBy(currentForgotten, 'itemName');
  const topSubjects = rankBy(currentForgotten, 'subject');
  const dueFollowUps = supportActions.filter(item =>
    item.status !== '完了' && item.followUpDate && item.followUpDate <= currentEnd
  ).length;

  const metrics = {
    submission: {
      ...currentSubmission,
      previousRate: previousSubmission.rate,
      delta: delta(currentSubmission.rate, previousSubmission.rate),
    },
    feelings: {
      ...currentFeelings,
      previousRate: previousFeelings.challengingRate,
      delta: delta(currentFeelings.challengingRate, previousFeelings.challengingRate),
    },
    forgotten: {
      total: currentForgotten.length,
      previousTotal: previousForgotten.length,
      delta: currentForgotten.length - previousForgotten.length,
      topItems,
      topSubjects,
    },
    support: { dueFollowUps },
  };

  const insights = [];
  const submissionNeedsReview = currentSubmission.rate !== null
    && (currentSubmission.rate < 80 || (metrics.submission.delta !== null && metrics.submission.delta <= -10));
  if (submissionNeedsReview) {
    const comparison = metrics.submission.delta === null
      ? ''
      : `、前の14日間から${metrics.submission.delta >= 0 ? '+' : ''}${metrics.submission.delta}ポイント`;
    insights.push({
      id: 'submission-routine',
      area: '課題提出',
      priority: currentSubmission.rate < 60 ? 3 : 2,
      title: '提出動線を見直す候補',
      evidence: `直近14日間の提出率は${currentSubmission.rate}%（${currentSubmission.submitted}/${currentSubmission.required}回）${comparison}です。`,
      action: '提出場所と確認時刻を一つにそろえ、朝の会で提出手順を短く再確認する。',
      measure: '次の14日間の学級全体の課題提出率',
    });
  }

  if (currentForgotten.length >= 3 && topItems[0]?.count >= 2) {
    const topSubject = topSubjects[0];
    insights.push({
      id: 'preparation-guide',
      area: '学習準備',
      priority: currentForgotten.length >= 8 ? 3 : 2,
      title: '持ち物案内を改善する候補',
      evidence: `直近14日間に忘れ物が${currentForgotten.length}件あり、「${topItems[0].label}」が${topItems[0].count}件${topSubject ? `、${topSubject.label}が${topSubject.count}件` : ''}です。`,
      action: '帰りの会の持ち物表示を写真・実物・短い文で統一し、児童が自分で確認する時間を設ける。',
      measure: `次の14日間の「${topItems[0].label}」と忘れ物全体の件数`,
    });
  }

  if (currentFeelings.total >= 5 && currentFeelings.challengingRate >= 30) {
    insights.push({
      id: 'morning-check-in',
      area: '生活・体調',
      priority: currentFeelings.challengingRate >= 50 ? 3 : 2,
      title: '朝の安心づくりを確認する候補',
      evidence: `直近14日間のチェックイン${currentFeelings.total}件中、困り感のある選択が${currentFeelings.challenging}件（${currentFeelings.challengingRate}%）です。`,
      action: '朝の会に短いセルフケア選択肢と、必要な児童が個別に話せる時間を用意する。',
      measure: '次の14日間のきもち分布と、朝の声かけ後の学級の様子',
    });
  }

  if (dueFollowUps > 0) {
    insights.push({
      id: 'support-review-routine',
      area: '支援運用',
      priority: dueFollowUps >= 3 ? 3 : 2,
      title: '支援の振り返り時間を確保する候補',
      evidence: `振り返り予定日を迎えた実施中の支援が${dueFollowUps}件あります。`,
      action: '週1回10分の支援レビューを予定に入れ、事実・支援・変化を更新する。',
      measure: '期限を過ぎた支援記録の件数と、結果を記録できた件数',
    });
  }

  const hasRecords = currentSubmission.required > 0 || currentFeelings.total > 0 || currentForgotten.length > 0 || supportActions.length > 0;
  if (insights.length === 0) {
    insights.push({
      id: hasRecords ? 'steady-operation' : 'start-measuring',
      area: hasRecords ? '学級運用' : 'データ準備',
      priority: 1,
      title: hasRecords ? '現在の仕組みを継続する候補' : 'まず14日間の記録を集める',
      evidence: hasRecords
        ? '現在の集計では、設定した確認基準に該当する大きな変化はありません。'
        : '傾向を比較するための記録がまだ十分ではありません。',
      action: hasRecords
        ? '現在の提出・準備・朝の確認手順を継続し、14日後に同じ指標を確認する。'
        : '提出、朝のきもち、忘れ物を日々記録し、学級全体の基準値をつくる。',
      measure: '14日後の提出率・きもち分布・忘れ物件数',
    });
  }

  return { metrics, insights: insights.sort((a, b) => b.priority - a.priority || a.area.localeCompare(b.area, 'ja')) };
};
