import test from 'node:test';
import assert from 'node:assert/strict';
import { buildClassInsights } from '../src/classInsights.js';

const report = (required, submitted) => ({ taskStats: [{ required, submitted }] });

test('class insights compare periods and propose aggregate actions without student ranking', () => {
  const result = buildClassInsights({
    currentReports: [report(10, 6), report(10, 7)],
    previousReports: [report(10, 9), report(10, 9)],
    currentStart: '2026-07-07', currentEnd: '2026-07-20',
    previousStart: '2026-06-23', previousEnd: '2026-07-06',
    dailyCheckIns: [
      { date: '2026-07-10', feeling: 'かなしい', studentName: '表示してはいけない名前' },
      { date: '2026-07-11', feeling: 'イライラ' },
      { date: '2026-07-12', feeling: 'げんき' },
      { date: '2026-07-13', feeling: 'げんき' },
      { date: '2026-07-14', feeling: 'げんき' },
    ],
    forgottenItems: [
      { date: '2026-07-10', itemName: '筆箱', subject: '算数' },
      { date: '2026-07-11', itemName: '筆箱', subject: '算数' },
      { date: '2026-07-12', itemName: 'ノート', subject: '国語' },
    ],
  });

  assert.equal(result.metrics.submission.rate, 65);
  assert.equal(result.metrics.submission.delta, -25);
  assert.ok(result.insights.some(item => item.id === 'submission-routine'));
  assert.ok(result.insights.some(item => item.id === 'preparation-guide'));
  assert.ok(result.insights.some(item => item.id === 'morning-check-in'));
  assert.equal(JSON.stringify(result).includes('表示してはいけない名前'), false);
  assert.ok(result.insights.every(item => !Object.hasOwn(item, 'studentId')));
});

test('class insights surface overdue support reviews as an operational issue', () => {
  const result = buildClassInsights({
    currentStart: '2026-07-07', currentEnd: '2026-07-20',
    previousStart: '2026-06-23', previousEnd: '2026-07-06',
    supportActions: [
      { status: '実施中', followUpDate: '2026-07-19' },
      { status: '完了', followUpDate: '2026-07-10' },
    ],
  });

  assert.equal(result.metrics.support.dueFollowUps, 1);
  assert.ok(result.insights.some(item => item.id === 'support-review-routine'));
});

test('class insights recommend continued measurement when no threshold is triggered', () => {
  const result = buildClassInsights({
    currentReports: [report(10, 10)],
    previousReports: [report(10, 10)],
    currentStart: '2026-07-07', currentEnd: '2026-07-20',
    previousStart: '2026-06-23', previousEnd: '2026-07-06',
    dailyCheckIns: [{ date: '2026-07-10', feeling: 'げんき' }],
  });

  assert.deepEqual(result.insights.map(item => item.id), ['steady-operation']);
});
