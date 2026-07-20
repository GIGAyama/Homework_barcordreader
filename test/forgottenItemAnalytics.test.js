import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeForgottenItems, buildForgottenItemInsight } from '../src/forgottenItemAnalytics.js';

test('forgotten item analytics filters dates and ranks patterns', () => {
  const result = analyzeForgottenItems([
    { date: '2026-07-01', studentId: '1', itemName: '筆箱', subject: '算数', impact: '影響なし' },
    { date: '2026-07-02', studentId: '1', itemName: '筆箱', subject: '算数', impact: '少し困った' },
    { date: '2026-07-03', studentId: '2', itemName: 'ノート', subject: '国語', impact: '影響なし' },
    { date: '2026-06-01', studentId: '3', itemName: '教科書', subject: '理科', impact: '影響なし' },
  ], '2026-07-01', '2026-07-31');

  assert.equal(result.total, 3);
  assert.equal(result.affectedStudents, 2);
  assert.deepEqual(result.topItems[0], { label: '筆箱', count: 2 });
  assert.equal(result.noLessonImpactRate, 67);
  assert.match(buildForgottenItemInsight(result), /算数/);
});

test('empty analytics celebrates the positive state', () => {
  const result = analyzeForgottenItems([], '2026-07-01', '2026-07-31');
  assert.match(buildForgottenItemInsight(result), /よい状態/);
});
