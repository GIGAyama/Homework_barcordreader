import test from 'node:test';
import assert from 'node:assert/strict';
import { buildBackupData } from '../src/dataModel.js';
import {
  buildRestorePreview,
  calculateBackupChecksum,
  classifySyncState,
  formatRestoreConfirmation,
  sealBackup,
  validateBackupData,
  verifyBackupIntegrity,
} from '../src/dataSafety.js';

const db = {
  students: [{ id: '1', name: '山田 花子' }],
  tasks: [{ id: 't1', name: '音読' }],
  logs: [{ id: 'l1', studentId: '1', taskId: 't1', date: '2026-07-20' }],
  config: { pin: 'admin' },
  absences: [], dailyCheckIns: [], forgottenItems: [], supportActions: [], classActions: [], familyContacts: [],
};

test('sealed backups verify and detect accidental changes', () => {
  const backup = sealBackup(buildBackupData(db, 100));
  assert.equal(verifyBackupIntegrity(backup).valid, true);
  assert.equal(calculateBackupChecksum(backup), backup.integrity.checksum);

  const changed = { ...backup, students: [{ id: '1', name: '変更された名前' }] };
  const validation = validateBackupData(changed);
  assert.equal(validation.valid, false);
  assert.match(validation.errors.join(' '), /整合性チェック/);
});

test('legacy backups remain restorable with an explicit warning', () => {
  const backup = buildBackupData(db, 100);
  const validation = validateBackupData(backup);
  assert.equal(validation.valid, true);
  assert.equal(validation.integrity.status, 'legacy');
  assert.ok(validation.warnings.some(message => message.includes('旧形式')));
});

test('validation rejects future schemas and malformed required collections', () => {
  const future = { ...buildBackupData(db), schemaVersion: 999 };
  assert.equal(validateBackupData(future).valid, false);
  assert.equal(validateBackupData({ students: {}, tasks: [], logs: [], config: {} }).valid, false);
});

test('restore preview shows collection deltas before replacement', () => {
  const incoming = sealBackup(buildBackupData({ ...db, students: [...db.students, { id: '2', name: '鈴木 太郎' }], logs: [] }, 200));
  const preview = buildRestorePreview(db, incoming);
  assert.deepEqual(preview.changes.find(item => item.key === 'students'), { key: 'students', label: '児童', current: 1, next: 2, delta: 1 });
  assert.match(formatRestoreConfirmation(preview), /児童: 1 → 2/);
  assert.match(formatRestoreConfirmation(preview), /自動退避/);
});

test('sync classification never overwrites divergent local and remote updates', () => {
  assert.equal(classifySyncState({ localUpdated: 30, remoteUpdated: 40, lastSyncedAt: 20, remoteRevision: 'remote-2', lastSyncedRevision: 'remote-1' }), 'conflict');
  assert.equal(classifySyncState({ localUpdated: 20, remoteUpdated: 40, lastSyncedAt: 20, remoteRevision: 'remote-2', lastSyncedRevision: 'remote-1' }), 'download');
  assert.equal(classifySyncState({ localUpdated: 40, remoteUpdated: 20, lastSyncedAt: 20, remoteRevision: 'remote-1', lastSyncedRevision: 'remote-1' }), 'upload');
  assert.equal(classifySyncState({ localUpdated: 20, remoteUpdated: 20, lastSyncedAt: 20, remoteRevision: 'remote-1', lastSyncedRevision: 'remote-1' }), 'synced');
});
