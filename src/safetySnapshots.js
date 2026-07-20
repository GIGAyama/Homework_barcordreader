import { buildSafeBackupData, calculateDataFingerprint, sealBackup, summarizeBackup, validateBackupData } from './dataSafety.js';

export const SNAPSHOT_STORAGE_KEY = 'hp_safety_snapshots_v1';
export const AUTO_SNAPSHOT_AT_KEY = 'hp_safety_snapshot_auto_at';
export const SNAPSHOT_CHANGED_EVENT = 'shukudai-post:snapshots-changed';
export const MAX_SNAPSHOTS = 5;
export const AUTO_SNAPSHOT_INTERVAL = 30 * 60 * 1000;

const resolveStorage = storage => storage || globalThis.localStorage;

const notifyChanged = () => {
  if (typeof globalThis.dispatchEvent === 'function' && typeof globalThis.Event === 'function') {
    globalThis.dispatchEvent(new globalThis.Event(SNAPSHOT_CHANGED_EVENT));
  }
};

const readRawSnapshots = storage => {
  try {
    const parsed = JSON.parse(resolveStorage(storage).getItem(SNAPSHOT_STORAGE_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const persistWithPruning = (storage, snapshots) => {
  const target = resolveStorage(storage);
  const remaining = snapshots.slice(0, MAX_SNAPSHOTS);
  let lastError = null;
  while (remaining.length > 0) {
    try {
      target.setItem(SNAPSHOT_STORAGE_KEY, JSON.stringify(remaining));
      return remaining;
    } catch (error) {
      lastError = error;
      remaining.pop();
    }
  }
  throw lastError || new Error('復元ポイントを保存できませんでした');
};

export const listSafetySnapshots = storage => readRawSnapshots(storage)
  .filter(snapshot => snapshot?.id && validateBackupData(snapshot.backup).valid)
  .sort((a, b) => b.createdAt - a.createdAt)
  .map(({ backup: _backup, ...metadata }) => metadata);

export const getSafetySnapshot = (id, storage) => {
  const snapshot = readRawSnapshots(storage).find(item => item.id === id);
  if (!snapshot) return null;
  const validation = validateBackupData(snapshot.backup);
  return validation.valid ? snapshot : null;
};

export const saveBackupAsSafetySnapshot = (backup, {
  reason = '手動保存',
  now = Date.now(),
  storage,
  automatic = false,
} = {}) => {
  const target = resolveStorage(storage);
  const validation = validateBackupData(backup);
  if (!validation.valid) throw new Error(validation.errors.join('\n'));
  const protectedBackup = backup.integrity ? backup : sealBackup(backup);
  const contentFingerprint = calculateDataFingerprint(protectedBackup);
  const previous = readRawSnapshots(target);
  if (automatic && previous[0]?.contentFingerprint === contentFingerprint) {
    target.setItem(AUTO_SNAPSHOT_AT_KEY, String(now));
    return previous[0];
  }
  const summary = summarizeBackup(protectedBackup);
  const snapshot = {
    id: `snapshot-${now}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: now,
    reason,
    automatic,
    contentFingerprint,
    totalRecords: summary.totalRecords,
    counts: summary.counts,
    backup: protectedBackup,
  };
  persistWithPruning(target, [snapshot, ...previous]);
  if (automatic) target.setItem(AUTO_SNAPSHOT_AT_KEY, String(now));
  notifyChanged();
  return snapshot;
};

export const saveSafetySnapshot = (db, options = {}) => {
  const now = options.now ?? Date.now();
  return saveBackupAsSafetySnapshot(buildSafeBackupData(db, now, { snapshot: true }), { ...options, now });
};

export const deleteSafetySnapshot = (id, storage) => {
  const target = resolveStorage(storage);
  const next = readRawSnapshots(target).filter(item => item.id !== id);
  target.setItem(SNAPSHOT_STORAGE_KEY, JSON.stringify(next));
  notifyChanged();
};

export const shouldCreateAutomaticSnapshot = (storage, now = Date.now()) => {
  const previous = Number(resolveStorage(storage).getItem(AUTO_SNAPSHOT_AT_KEY) || 0);
  return !Number.isFinite(previous) || now - previous >= AUTO_SNAPSHOT_INTERVAL;
};
