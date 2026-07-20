import { submissionMatchesTask } from './dataModel.js';
import { shiftDate } from './studentInsights.js';
import { getLocalDateString, isTaskDueOn, parseLocalDate } from './taskSchedule.js';

const CHALLENGING_FEELINGS = new Set(['イライラ', 'かなしい']);

const dayOrdinal = value => {
  const [year, month, day] = value.split('-').map(Number);
  return Date.UTC(year, month - 1, day) / 86400000;
};

const daysBetween = (start, end) => dayOrdinal(end) - dayOrdinal(start);

const mondayOf = dateString => {
  const date = parseLocalDate(dateString);
  const day = date.getDay();
  date.setDate(date.getDate() - day + (day === 0 ? -6 : 1));
  return getLocalDateString(date);
};

const submissionWindow = ({ studentId, startDate, endDate, tasks, logs }) => {
  const requirements = new Map(tasks.map(task => [task.id, 0]));
  const activeWeeks = new Map(tasks.map(task => [task.id, new Set()]));
  const cursor = parseLocalDate(startDate);
  const end = parseLocalDate(endDate);
  while (cursor <= end) {
    const date = getLocalDateString(cursor);
    tasks.forEach(task => {
      if (!isTaskDueOn(task, date)) return;
      if (task.type === '週回数') activeWeeks.get(task.id).add(mondayOf(date));
      else requirements.set(task.id, (requirements.get(task.id) || 0) + 1);
    });
    cursor.setDate(cursor.getDate() + 1);
  }
  tasks.forEach(task => {
    if (task.type === '週回数') {
      requirements.set(task.id, activeWeeks.get(task.id).size * Number.parseInt(task.value || 1, 10));
    }
  });

  const windowLogs = logs.filter(item => item.studentId === studentId && item.date >= startDate && item.date <= endDate);
  const required = [...requirements.values()].reduce((sum, count) => sum + count, 0);
  const submitted = tasks.reduce((sum, task) =>
    sum + windowLogs.filter(item => submissionMatchesTask(item, task)).length, 0);
  return { required, submitted, rate: required > 0 ? Math.round((submitted / required) * 100) : null };
};

const countWindow = (items, studentId, startDate, endDate) =>
  items.filter(item => item.studentId === studentId && item.date >= startDate && item.date <= endDate).length;

const feelingWindow = (items, studentId, startDate, endDate) => {
  const records = items.filter(item => item.studentId === studentId && item.date >= startDate && item.date <= endDate);
  const challenging = records.filter(item => CHALLENGING_FEELINGS.has(item.feeling)).length;
  return { total: records.length, challenging, rate: records.length ? Math.round((challenging / records.length) * 100) : null };
};

const comparison = ({ label, before, after, unit, deltaUnit = unit, favorableDirection, emptyMessage, note }) => {
  const comparable = before !== null && after !== null;
  const delta = comparable ? after - before : null;
  let summary = emptyMessage;
  if (comparable) {
    if (delta === 0) summary = `${label}は前期間と同じです。`;
    else summary = `${label}は前期間より${Math.abs(delta)}${deltaUnit}${delta > 0 ? '増加' : '減少'}しています。`;
  }
  return {
    label,
    before,
    after,
    beforeDisplay: before === null ? '—' : `${before}${unit}`,
    afterDisplay: after === null ? '—' : `${after}${unit}`,
    delta,
    favorable: delta === null || delta === 0 ? null : (favorableDirection === 'up' ? delta > 0 : delta < 0),
    summary,
    note,
  };
};

const categoryOrder = category => {
  if (category === '学習準備') return ['forgotten', 'submission', 'feelings', 'attendance'];
  if (category === '課題提出' || category === '学習') return ['submission', 'forgotten', 'feelings', 'attendance'];
  if (category === '生活・体調' || category === '友人関係') return ['feelings', 'attendance', 'submission', 'forgotten'];
  return ['submission', 'forgotten', 'feelings', 'attendance'];
};

export const buildSupportImpact = ({
  support,
  today,
  tasks = [],
  logs = [],
  dailyCheckIns = [],
  forgottenItems = [],
  absences = [],
}) => {
  const elapsedDays = daysBetween(support.date, today) + 1;
  if (elapsedDays <= 0) {
    return { available: false, reason: '支援開始日前のため、比較データはまだありません。', daysCompared: 0, metrics: [] };
  }

  const daysCompared = Math.min(14, elapsedDays);
  const periods = {
    before: { start: shiftDate(support.date, -daysCompared), end: shiftDate(support.date, -1) },
    after: { start: support.date, end: shiftDate(support.date, daysCompared - 1) },
  };
  const beforeSubmission = submissionWindow({ studentId: support.studentId, startDate: periods.before.start, endDate: periods.before.end, tasks, logs });
  const afterSubmission = submissionWindow({ studentId: support.studentId, startDate: periods.after.start, endDate: periods.after.end, tasks, logs });
  const beforeFeelings = feelingWindow(dailyCheckIns, support.studentId, periods.before.start, periods.before.end);
  const afterFeelings = feelingWindow(dailyCheckIns, support.studentId, periods.after.start, periods.after.end);

  const byKey = {
    submission: {
      key: 'submission',
      ...comparison({
        label: '課題提出率', before: beforeSubmission.rate, after: afterSubmission.rate, unit: '%', deltaUnit: 'ポイント', favorableDirection: 'up',
        emptyMessage: '比較期間に提出対象の課題がないため、提出率は比較できません。',
        note: `前 ${beforeSubmission.submitted}/${beforeSubmission.required}回・後 ${afterSubmission.submitted}/${afterSubmission.required}回`,
      }),
    },
    forgotten: {
      key: 'forgotten',
      ...comparison({
        label: '忘れ物記録',
        before: countWindow(forgottenItems, support.studentId, periods.before.start, periods.before.end),
        after: countWindow(forgottenItems, support.studentId, periods.after.start, periods.after.end),
        unit: '件', favorableDirection: 'down', emptyMessage: '', note: '同じ日数の記録件数を比較',
      }),
    },
    feelings: {
      key: 'feelings',
      ...comparison({
        label: '困り感のある選択', before: beforeFeelings.rate, after: afterFeelings.rate, unit: '%', favorableDirection: 'down',
        emptyMessage: 'チェックイン記録がない期間を含むため、きもちの割合は比較できません。',
        note: `前 ${beforeFeelings.challenging}/${beforeFeelings.total}件・後 ${afterFeelings.challenging}/${afterFeelings.total}件`,
      }),
    },
    attendance: {
      key: 'attendance',
      ...comparison({
        label: '欠席・遅刻記録',
        before: countWindow(absences, support.studentId, periods.before.start, periods.before.end),
        after: countWindow(absences, support.studentId, periods.after.start, periods.after.end),
        unit: '件', favorableDirection: 'down', emptyMessage: '', note: '同じ日数の記録件数を比較',
      }),
    },
  };

  return {
    available: true,
    daysCompared,
    maturity: daysCompared >= 7 ? '比較可能' : '記録を継続中',
    periods,
    metrics: categoryOrder(support.category).map(key => byKey[key]),
    disclaimer: '前後の記録差を示すもので、支援との因果関係や診断を示すものではありません。',
  };
};
