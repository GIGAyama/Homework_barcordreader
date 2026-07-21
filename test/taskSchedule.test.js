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

test('task start date excludes days before the task existed', () => {
  const task = { type: '毎日（平日）', startDate: '2026-07-20' };
  // 開始日より前の平日は必要回数に数えない
  assert.equal(isTaskDueOn(task, '2026-07-17'), false);
  // 開始日当日から有効（境界は含む）
  assert.equal(isTaskDueOn(task, '2026-07-20'), true);
  assert.equal(isTaskDueOn(task, '2026-07-21'), true);
});

test('task end date excludes days after the task period ends', () => {
  const task = { type: '毎日（平日）', endDate: '2026-07-21' };
  assert.equal(isTaskDueOn(task, '2026-07-21'), true);
  // 終了日の翌平日以降は数えない（境界は含む）
  assert.equal(isTaskDueOn(task, '2026-07-22'), false);
});

test('start and end dates bound weekly-count tasks together', () => {
  const task = { type: '週回数', value: '3', startDate: '2026-07-20', endDate: '2026-07-24' };
  assert.equal(isTaskDueOn(task, '2026-07-19'), false);
  assert.equal(isTaskDueOn(task, '2026-07-20'), true);
  assert.equal(isTaskDueOn(task, '2026-07-24'), true);
  assert.equal(isTaskDueOn(task, '2026-07-25'), false);
});

test('week range uses Monday through Sunday without UTC date shifts', () => {
  assert.deepEqual(getWeekRangeStrings('2026-07-22'), ['2026-07-20', '2026-07-26']);
  assert.deepEqual(getWeekRangeStrings('2026-07-26'), ['2026-07-20', '2026-07-26']);
});
