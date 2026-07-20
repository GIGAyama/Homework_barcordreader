import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DATA_SCHEMA_VERSION,
  buildBackupData,
  migrateData,
  submissionMatchesTask,
  upsertDailyCheckIn,
} from '../src/dataModel.js';

test('legacy feelings are deduplicated into one daily check-in', () => {
  const migrated = migrateData({
    students: [{ id: '1', name: '山田 花子' }],
    tasks: [{ id: 'task-1', name: '音読' }, { id: 'task-2', name: '計算' }],
    logs: [
      { id: 'a', date: '2026-07-20', studentId: '1', studentName: '山田 花子', taskName: '音読', feeling: 'げんき', timestamp: 10 },
      { id: 'b', date: '2026-07-20', studentId: '1', studentName: '山田 花子', taskName: '計算', feeling: 'げんき', timestamp: 11 },
    ],
    config: { pin: 'admin' },
  });

  assert.equal(migrated.schemaVersion, DATA_SCHEMA_VERSION);
  assert.equal(migrated.dailyCheckIns.length, 1);
  assert.equal(migrated.dailyCheckIns[0].feeling, 'げんき');
  assert.equal(migrated.logs.length, 2);
  assert.ok(migrated.logs.every(log => !Object.hasOwn(log, 'feeling')));
  assert.equal(migrated.logs[0].taskId, 'task-1');
});

test('existing daily check-in takes precedence over legacy log data', () => {
  const migrated = migrateData({
    students: [],
    tasks: [],
    logs: [{ date: '2026-07-20', studentId: '1', feeling: 'かなしい', timestamp: 10 }],
    dailyCheckIns: [{ id: 'current', date: '2026-07-20', studentId: '1', feeling: 'げんき', timestamp: 20 }],
    config: { pin: 'admin' },
  });

  assert.equal(migrated.dailyCheckIns.length, 1);
  assert.equal(migrated.dailyCheckIns[0].id, 'current');
  assert.equal(migrated.dailyCheckIns[0].feeling, 'げんき');
});

test('daily check-in upsert keeps one record per student and date', () => {
  const first = [{ id: 'keep-me', studentId: '1', date: '2026-07-20', feeling: 'ねむい' }];
  const result = upsertDailyCheckIn(first, { id: 'new-id', studentId: '1', date: '2026-07-20', feeling: 'げんき' });

  assert.equal(result.length, 1);
  assert.equal(result[0].id, 'keep-me');
  assert.equal(result[0].feeling, 'げんき');
});

test('submission matching prefers stable task ids while supporting legacy names', () => {
  const task = { id: 'task-1', name: '音読' };
  assert.equal(submissionMatchesTask({ taskId: 'task-1', taskName: '旧名称' }, task), true);
  assert.equal(submissionMatchesTask({ taskName: '音読' }, task), true);
  assert.equal(submissionMatchesTask({ taskId: 'task-2', taskName: '音読' }, task), false);
});

test('backup includes every versioned event collection', () => {
  const backup = buildBackupData({
    students: [], tasks: [], logs: [], config: { pin: 'x' }, absences: [],
    dailyCheckIns: [{ id: 'c' }], forgottenItems: [{ id: 'f' }], supportActions: [{ id: 's' }],
  }, 123);

  assert.equal(backup.schemaVersion, DATA_SCHEMA_VERSION);
  assert.equal(backup.dailyCheckIns.length, 1);
  assert.equal(backup.forgottenItems.length, 1);
  assert.equal(backup.supportActions.length, 1);
  assert.equal(backup.syncMeta.updatedAt, 123);
});
