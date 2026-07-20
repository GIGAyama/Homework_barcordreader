import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSupportImpact } from '../src/supportImpact.js';

test('support impact compares equal-length periods and orders the relevant metric first', () => {
  const impact = buildSupportImpact({
    support: { studentId: '1', date: '2026-07-13', category: '学習準備' },
    today: '2026-07-17',
    tasks: [{ id: 't1', name: '音読', type: '毎日（平日）', excludeDates: [] }],
    logs: [
      { studentId: '1', taskId: 't1', date: '2026-07-08' },
      { studentId: '1', taskId: 't1', date: '2026-07-13' },
      { studentId: '1', taskId: 't1', date: '2026-07-14' },
      { studentId: '1', taskId: 't1', date: '2026-07-15' },
      { studentId: '1', taskId: 't1', date: '2026-07-16' },
    ],
    forgottenItems: [
      { studentId: '1', date: '2026-07-08' },
      { studentId: '1', date: '2026-07-09' },
      { studentId: '1', date: '2026-07-10' },
      { studentId: '1', date: '2026-07-15' },
    ],
    dailyCheckIns: [
      { studentId: '1', date: '2026-07-08', feeling: 'かなしい' },
      { studentId: '1', date: '2026-07-09', feeling: 'げんき' },
      { studentId: '1', date: '2026-07-13', feeling: 'げんき' },
      { studentId: '1', date: '2026-07-14', feeling: 'げんき' },
    ],
  });

  assert.equal(impact.daysCompared, 5);
  assert.deepEqual(impact.periods.before, { start: '2026-07-08', end: '2026-07-12' });
  assert.deepEqual(impact.periods.after, { start: '2026-07-13', end: '2026-07-17' });
  assert.equal(impact.metrics[0].key, 'forgotten');
  assert.equal(impact.metrics[0].before, 3);
  assert.equal(impact.metrics[0].after, 1);
  assert.equal(impact.metrics[0].favorable, true);
  const submission = impact.metrics.find(metric => metric.key === 'submission');
  assert.equal(submission.before, 33);
  assert.equal(submission.after, 80);
});

test('support impact does not force a comparison when records are unavailable', () => {
  const impact = buildSupportImpact({
    support: { studentId: '1', date: '2026-07-13', category: '生活・体調' },
    today: '2026-07-20',
  });

  const feelings = impact.metrics.find(metric => metric.key === 'feelings');
  const submission = impact.metrics.find(metric => metric.key === 'submission');
  assert.equal(feelings.before, null);
  assert.equal(feelings.after, null);
  assert.match(feelings.summary, /比較できません/);
  assert.equal(submission.before, null);
  assert.equal(submission.after, null);
  assert.equal(JSON.stringify(impact).includes('改善しました'), false);
});

test('support impact waits until the support start date', () => {
  const impact = buildSupportImpact({
    support: { studentId: '1', date: '2026-07-21', category: 'その他' },
    today: '2026-07-20',
  });

  assert.equal(impact.available, false);
  assert.equal(impact.metrics.length, 0);
});
