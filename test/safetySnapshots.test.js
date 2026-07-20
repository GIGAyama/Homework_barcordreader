import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AUTO_SNAPSHOT_INTERVAL,
  deleteSafetySnapshot,
  getSafetySnapshot,
  listSafetySnapshots,
  saveSafetySnapshot,
  shouldCreateAutomaticSnapshot,
} from '../src/safetySnapshots.js';

const memoryStorage = () => {
  const values = new Map();
  return {
    getItem: key => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key),
  };
};

const db = {
  students: [{ id: '1', name: '山田 花子' }], tasks: [], logs: [], config: { pin: 'admin' },
  absences: [], dailyCheckIns: [], forgottenItems: [], supportActions: [], classActions: [], familyContacts: [],
};

test('safety snapshots retain a validated rolling history', () => {
  const storage = memoryStorage();
  for (let index = 1; index <= 7; index += 1) saveSafetySnapshot({ ...db, logs: [{ id: String(index) }] }, { storage, now: index, reason: `保存${index}` });
  const snapshots = listSafetySnapshots(storage);
  assert.equal(snapshots.length, 5);
  assert.equal(snapshots[0].reason, '保存7');
  const latest = getSafetySnapshot(snapshots[0].id, storage);
  assert.equal(latest.backup.logs[0].id, '7');
  assert.equal(latest.backup.integrity.algorithm, 'crc32');
  deleteSafetySnapshot(snapshots[0].id, storage);
  assert.equal(listSafetySnapshots(storage).length, 4);
});

test('automatic snapshot throttling and identical-data deduplication prevent storage growth', () => {
  const storage = memoryStorage();
  saveSafetySnapshot(db, { storage, now: 100, automatic: true });
  assert.equal(shouldCreateAutomaticSnapshot(storage, 100 + AUTO_SNAPSHOT_INTERVAL - 1), false);
  assert.equal(shouldCreateAutomaticSnapshot(storage, 100 + AUTO_SNAPSHOT_INTERVAL), true);
  saveSafetySnapshot(db, { storage, now: 100 + AUTO_SNAPSHOT_INTERVAL, automatic: true });
  assert.equal(listSafetySnapshots(storage).length, 1);
});
