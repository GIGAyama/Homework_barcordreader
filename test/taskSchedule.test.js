import test from 'node:test';
import assert from 'node:assert/strict';
import { getWeekRangeStrings, isTaskDueOn } from '../src/taskSchedule.js';

test('task schedule applies weekdays, exclusions and archive boundaries consistently', () => {
  const task = { type: '毎日（平日）', excludeDates: ['2026-07-21'] };
  assert.equal(isTaskDueOn(task, '2026-07-20'), true);
  assert.equal(isTaskDueOn(task, '2026-07-21'), false);
  assert.equal(isTaskDueOn(task, '2026-07-25'), false);
  assert.equal(isTaskDueOn({ ...task, archived: true, archivedAt: '2026-07-22' }, '2026-07-22'), false);
});

test('week range uses Monday through Sunday without UTC date shifts', () => {
  assert.deepEqual(getWeekRangeStrings('2026-07-22'), ['2026-07-20', '2026-07-26']);
  assert.deepEqual(getWeekRangeStrings('2026-07-26'), ['2026-07-20', '2026-07-26']);
});
