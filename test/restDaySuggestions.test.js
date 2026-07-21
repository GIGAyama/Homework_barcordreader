import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildRestDaySuggestionsForTask,
  buildRestDaySuggestions,
  REST_DAY_TARGET_TASK_TYPES,
} from '../src/restDaySuggestions.js';

const students = [
  { id: 's1', name: 'A' },
  { id: 's2', name: 'B' },
  { id: 's3', name: 'C' },
  { id: 's4', name: 'D' },
  { id: 's5', name: 'E' },
];

const submission = (studentId, taskId, date) => ({ studentId, taskId, date });

test('flags days whose submission rate is below 20% of the class as rest-day candidates', () => {
  const task = { id: 't1', type: '毎日（平日）', name: '音読', excludeDates: [] };
  const logs = [
    // 2026-07-13 (月): 4/5 提出 = 80% → 提案しない
    submission('s1', 't1', '2026-07-13'),
    submission('s2', 't1', '2026-07-13'),
    submission('s3', 't1', '2026-07-13'),
    submission('s4', 't1', '2026-07-13'),
    // 2026-07-14 (火): 0/5 提出 = 0% → 提案する
    // 2026-07-15 (水): 1/5 提出 = 20% → しきい値以上なので提案しない
    submission('s1', 't1', '2026-07-15'),
  ];

  const result = buildRestDaySuggestionsForTask(task, {
    students,
    logs,
    today: '2026-07-16',
    lookbackDays: 10,
  });

  const dates = result.map(item => item.date);
  assert.ok(dates.includes('2026-07-14'), '0%の日は提案される');
  assert.ok(!dates.includes('2026-07-13'), '80%の日は提案されない');
  assert.ok(!dates.includes('2026-07-15'), 'ちょうど20%の日は提案されない');
});

test('excludes today and future days because their submissions are not final', () => {
  const task = { id: 't1', type: '毎日（平日）', name: '音読', excludeDates: [] };
  const result = buildRestDaySuggestionsForTask(task, {
    students,
    logs: [],
    today: '2026-07-15',
    lookbackDays: 5,
  });
  const dates = result.map(item => item.date);
  assert.ok(!dates.includes('2026-07-15'), '当日は判断しない');
  assert.ok(dates.includes('2026-07-14'), '前日以前は判断する');
});

test('absent students are removed from the class denominator', () => {
  const task = { id: 't1', type: '毎日（平日）', name: '音読', excludeDates: [] };
  const logs = [submission('s1', 't1', '2026-07-14')];
  // 4名欠席 → 母数は1名、提出1名 = 100% → 提案しない
  const absences = ['s2', 's3', 's4', 's5'].map(id => ({ studentId: id, date: '2026-07-14', status: '欠席' }));

  const result = buildRestDaySuggestionsForTask(task, {
    students,
    logs,
    absences,
    today: '2026-07-15',
    lookbackDays: 1, // 2026-07-14 のみを対象に確認する
  });
  assert.equal(result.length, 0, '欠席で母数が減れば提出率100%となり提案されない');
});

test('does not suggest days already set as rest days or outside the active period', () => {
  const task = {
    id: 't1',
    type: '毎日（平日）',
    name: '音読',
    excludeDates: ['2026-07-14'],
    startDate: '2026-07-14',
  };
  const result = buildRestDaySuggestionsForTask(task, {
    students,
    logs: [],
    today: '2026-07-16',
    lookbackDays: 10,
  });
  const dates = result.map(item => item.date);
  assert.ok(!dates.includes('2026-07-14'), 'すでにおやすみ日の日は再提案しない');
  assert.ok(!dates.includes('2026-07-13'), '開始日より前の日は提案しない');
  assert.ok(dates.includes('2026-07-15'), '有効期間内の低提出日は提案する');
});

test('weekly-count tasks are not suggested day by day', () => {
  assert.ok(!REST_DAY_TARGET_TASK_TYPES.includes('週回数'));
  const task = { id: 't1', type: '週回数', value: '3', name: '自主学習', excludeDates: [] };
  const result = buildRestDaySuggestionsForTask(task, {
    students,
    logs: [],
    today: '2026-07-16',
    lookbackDays: 10,
  });
  assert.equal(result.length, 0);
});

test('returns nothing when there are no students', () => {
  const task = { id: 't1', type: '毎日（平日）', name: '音読', excludeDates: [] };
  const result = buildRestDaySuggestionsForTask(task, {
    students: [],
    logs: [],
    today: '2026-07-16',
    lookbackDays: 10,
  });
  assert.equal(result.length, 0);
});

test('buildRestDaySuggestions aggregates across tasks and skips archived ones', () => {
  const tasks = [
    { id: 't1', type: '毎日（平日）', name: '音読', excludeDates: [] },
    { id: 't2', type: '毎日（平日）', name: '計算', excludeDates: [], archived: true, archivedAt: '2026-07-01' },
  ];
  const { byTaskId, totalCount } = buildRestDaySuggestions(tasks, {
    students,
    logs: [],
    today: '2026-07-16',
    lookbackDays: 5,
  });
  assert.ok(byTaskId.t1, '有効な課題は提案対象');
  assert.ok(!byTaskId.t2, 'アーカイブ済みの課題は提案しない');
  assert.equal(totalCount, byTaskId.t1.length);
});

test('caps suggestions to the most recent days', () => {
  const task = { id: 't1', type: '毎日（平日）', name: '音読', excludeDates: [] };
  const result = buildRestDaySuggestionsForTask(task, {
    students,
    logs: [],
    today: '2026-07-31',
    lookbackDays: 60,
    maxSuggestions: 3,
  });
  assert.equal(result.length, 3, '上限件数まで');
  // 新しい日付が優先される（降順）
  assert.deepEqual(result.map(item => item.date), ['2026-07-30', '2026-07-29', '2026-07-28']);
});
