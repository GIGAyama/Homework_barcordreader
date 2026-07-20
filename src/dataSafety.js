import { DATA_SCHEMA_VERSION, buildBackupData, migrateData } from './dataModel.js';

export const BACKUP_COLLECTIONS = [
  ['students', '児童'],
  ['tasks', '課題'],
  ['logs', '提出'],
  ['dailyCheckIns', 'きもち'],
  ['absences', '出欠'],
  ['forgottenItems', '忘れ物'],
  ['supportActions', '児童支援'],
  ['classActions', '学級改善'],
  ['familyContacts', '家庭連携'],
  ['aiActivity', 'AI利用履歴'],
];

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const sortValue = value => {
  if (Array.isArray(value)) return value.map(sortValue);
  if (!value || typeof value !== 'object') return value;
  return Object.keys(value).sort().reduce((result, key) => {
    result[key] = sortValue(value[key]);
    return result;
  }, {});
};

export const stableStringify = value => JSON.stringify(sortValue(value));

// CRC32は暗号化ではなく、保存・転送中の偶発的な破損を検知するための整合性値。
export const crc32 = value => {
  let crc = 0xffffffff;
  for (let index = 0; index < value.length; index += 1) {
    crc ^= value.charCodeAt(index);
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return ((crc ^ 0xffffffff) >>> 0).toString(16).padStart(8, '0');
};

export const calculateBackupChecksum = backup => {
  const { integrity: _integrity, ...content } = backup || {};
  return crc32(stableStringify(content));
};

export const calculateDataFingerprint = source => {
  const { exportDate: _exportDate, syncMeta: _syncMeta, integrity: _integrity, ...data } = source || {};
  return crc32(stableStringify(data));
};

export const sealBackup = backup => ({
  ...backup,
  integrity: {
    algorithm: 'crc32',
    checksum: calculateBackupChecksum(backup),
  },
});

export const buildSafeBackupData = (db, updatedAt = Date.now(), syncMeta = {}) => {
  const backup = buildBackupData(db, updatedAt);
  return sealBackup({
    ...backup,
    syncMeta: {
      ...backup.syncMeta,
      backupFormat: 2,
      ...syncMeta,
    },
  });
};

export const verifyBackupIntegrity = backup => {
  if (!backup?.integrity) return { valid: true, status: 'legacy', message: '旧形式のため整合性値はありません' };
  if (backup.integrity.algorithm !== 'crc32' || typeof backup.integrity.checksum !== 'string') {
    return { valid: false, status: 'unsupported', message: '未対応の整合性形式です' };
  }
  const actual = calculateBackupChecksum(backup);
  const valid = actual === backup.integrity.checksum;
  return {
    valid,
    status: valid ? 'verified' : 'corrupted',
    message: valid ? '整合性を確認しました' : '内容が保存後に変化した可能性があります',
    expected: backup.integrity.checksum,
    actual,
  };
};

const countDuplicateIds = items => {
  const seen = new Set();
  let duplicates = 0;
  (items || []).forEach(item => {
    const id = String(item?.id ?? '');
    if (!id) return;
    if (seen.has(id)) duplicates += 1;
    seen.add(id);
  });
  return duplicates;
};

export const summarizeBackup = source => {
  const migrated = migrateData(source || {});
  const counts = Object.fromEntries(BACKUP_COLLECTIONS.map(([key]) => [key, migrated[key]?.length || 0]));
  const dates = BACKUP_COLLECTIONS.flatMap(([key]) => (migrated[key] || []).map(item => item?.date).filter(date => DATE_PATTERN.test(date)));
  return {
    counts,
    totalRecords: BACKUP_COLLECTIONS.reduce((sum, [key]) => sum + counts[key], 0),
    firstRecordDate: dates.length ? [...dates].sort()[0] : null,
    lastRecordDate: dates.length ? [...dates].sort().at(-1) : null,
    schemaVersion: Number(source?.schemaVersion || 1),
    exportedAt: source?.exportDate || null,
  };
};

export const validateBackupData = data => {
  const errors = [];
  const warnings = [];
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { valid: false, errors: ['バックアップがJSONオブジェクトではありません'], warnings, summary: null, integrity: { valid: false, status: 'missing' } };
  }

  ['students', 'tasks', 'logs'].forEach(key => {
    if (!Array.isArray(data[key])) errors.push(`${key} が配列ではありません`);
  });
  if (!data.config || typeof data.config !== 'object' || Array.isArray(data.config)) errors.push('config がありません');
  if (Number(data.schemaVersion || 1) > DATA_SCHEMA_VERSION) {
    errors.push(`このアプリより新しいデータ形式（v${data.schemaVersion}）です`);
  }

  BACKUP_COLLECTIONS.forEach(([key]) => {
    if (data[key] != null && !Array.isArray(data[key])) errors.push(`${key} が配列ではありません`);
  });

  if (errors.length === 0) {
    const duplicateStudents = countDuplicateIds(data.students);
    const duplicateTasks = countDuplicateIds(data.tasks);
    if (duplicateStudents) warnings.push(`児童IDの重複が${duplicateStudents}件あります`);
    if (duplicateTasks) warnings.push(`課題IDの重複が${duplicateTasks}件あります`);

    const studentIds = new Set((data.students || []).map(item => String(item.id)));
    const orphaned = ['logs', 'dailyCheckIns', 'absences', 'forgottenItems', 'supportActions', 'familyContacts']
      .flatMap(key => (data[key] || []).filter(item => item.studentId != null && !studentIds.has(String(item.studentId))));
    if (orphaned.length) warnings.push(`現在の名簿にない児童の記録が${orphaned.length}件あります（記録は保持されます）`);
  }

  const integrity = verifyBackupIntegrity(data);
  if (!integrity.valid) errors.push(`整合性チェックに失敗しました：${integrity.message}`);
  if (integrity.status === 'legacy') warnings.push('旧形式バックアップのため破損検知情報がありません');

  return {
    valid: errors.length === 0,
    errors: [...new Set(errors)],
    warnings: [...new Set(warnings)],
    summary: errors.length ? null : summarizeBackup(data),
    integrity,
  };
};

export const buildRestorePreview = (currentDb, incoming) => {
  const current = summarizeBackup(buildBackupData(currentDb, 0));
  const next = summarizeBackup(incoming);
  const changes = BACKUP_COLLECTIONS.map(([key, label]) => ({
    key,
    label,
    current: current.counts[key],
    next: next.counts[key],
    delta: next.counts[key] - current.counts[key],
  }));
  return { current, next, changes };
};

export const formatRestoreConfirmation = (preview, sourceLabel = 'バックアップ') => {
  const changed = preview.changes.filter(item => item.current !== item.next);
  const lines = changed.length
    ? changed.map(item => `${item.label}: ${item.current} → ${item.next}${item.delta ? `（${item.delta > 0 ? '+' : ''}${item.delta}）` : ''}`)
    : ['件数上の変化はありません'];
  return [
    `⚠️ ${sourceLabel}から復元します。`,
    '',
    ...lines,
    '',
    '復元前の現在データは「復元ポイント」へ自動退避します。続行しますか？',
  ].join('\n');
};

export const applyBackupToDb = (db, source) => {
  const validation = validateBackupData(source);
  if (!validation.valid) throw new Error(validation.errors.join('\n'));
  const data = migrateData(source);
  db.setStudents(data.students);
  db.setTasks(data.tasks);
  db.setLogs(data.logs);
  db.setConfig(data.config);
  db.setAbsences(data.absences);
  db.setDailyCheckIns(data.dailyCheckIns);
  db.setForgottenItems(data.forgottenItems);
  db.setSupportActions(data.supportActions);
  db.setClassActions(data.classActions);
  db.setFamilyContacts(data.familyContacts);
  db.setAiActivity(data.aiActivity);
  db.setSchemaVersion(data.schemaVersion);
  return data;
};

export const classifySyncState = ({
  localUpdated = 0,
  remoteUpdated = 0,
  lastSyncedAt = 0,
  remoteRevision = '',
  lastSyncedRevision = '',
}) => {
  const localDirty = localUpdated > lastSyncedAt;
  const remoteChanged = remoteRevision && lastSyncedRevision
    ? remoteRevision !== lastSyncedRevision
    : remoteUpdated > lastSyncedAt;

  if (localDirty && remoteChanged) return 'conflict';
  if (remoteChanged || (!localDirty && remoteUpdated > localUpdated)) return 'download';
  if (localDirty || localUpdated > remoteUpdated) return 'upload';
  return 'synced';
};
