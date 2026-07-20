import { useState, useRef, useCallback, useEffect } from 'react';
import { loadGsi, createTokenClient, revokeToken, findBackupFile, uploadBackup, downloadBackup } from './googleDrive';
import {
  applyBackupToDb,
  buildRestorePreview,
  buildSafeBackupData,
  classifySyncState,
  formatRestoreConfirmation,
  validateBackupData,
} from './dataSafety';
import { saveBackupAsSafetySnapshot, saveSafetySnapshot } from './safetySnapshots';

// ==========================================
// ☁️ Google ドライブ同期フック
// ------------------------------------------
// 複数端末でのデータ同期を担う。
// - connect():     Googleにログインして接続（同意）
// - backupNow():   現在のデータをクラウドへ保存（手動）
// - restoreNow():  クラウドのデータをこの端末へ復元（手動）
// - syncNow():     クラウドと端末を比較し、新しい方へ自動で寄せる
// - disconnect():  接続を解除（トークン失効）
// - 自動化:        データ変更時の自動バックアップ／起動時の復元確認
// ==========================================

// この端末の「最終更新時刻」。データ変更のたびに更新し、クラウドとの新旧比較に使う。
const LOCAL_UPDATED_KEY = 'hp_gdrive_local_updated';
// クラウド側から取り込んだ最新のバックアップ時刻（表示・整合用）
const REMOTE_SEEN_KEY = 'hp_gdrive_remote_seen';
const LAST_REVISION_KEY = 'hp_gdrive_last_revision';
const DEVICE_ID_KEY = 'hp_device_id';

const readNum = (key) => {
  const v = Number(window.localStorage.getItem(key) || 0);
  return Number.isFinite(v) ? v : 0;
};
const writeNum = (key, val) => {
  try { window.localStorage.setItem(key, String(val)); } catch { /* 保存不可でも致命的でない */ }
};
const readText = key => window.localStorage.getItem(key) || '';
const writeText = (key, val) => {
  try { window.localStorage.setItem(key, String(val || '')); } catch { /* 保存不可でも致命的でない */ }
};
const getDeviceId = () => {
  const existing = readText(DEVICE_ID_KEY);
  if (existing) return existing;
  const id = globalThis.crypto?.randomUUID?.() || `device-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  writeText(DEVICE_ID_KEY, id);
  return id;
};

export const useGoogleDriveSync = ({ db, clientId, autoSync, showToast }) => {
  const [connected, setConnected] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState(() => readNum(REMOTE_SEEN_KEY) || null);
  const [conflict, setConflict] = useState(null);

  const tokenRef = useRef(null);          // { token, expiresAt }
  const tokenClientRef = useRef(null);
  const pendingResolveRef = useRef(null);
  const pendingRejectRef = useRef(null);
  const applyingRemoteRef = useRef(false); // リモート適用中は自動アップロードを抑止
  const debounceRef = useRef(null);
  const firstDataRunRef = useRef(true);

  // 最新の値を副作用内から参照するための ref
  const dbRef = useRef(db);
  dbRef.current = db;
  const autoSyncRef = useRef(autoSync);
  autoSyncRef.current = autoSync;

  // clientId が変わったらトークンクライアントを作り直す
  useEffect(() => {
    tokenClientRef.current = null;
    tokenRef.current = null;
    setConnected(false);
  }, [clientId]);

  // ---- トークン取得 ---------------------------------------------------------
  const ensureTokenClient = useCallback(async () => {
    if (!clientId) throw new Error('先にGoogleクライアントIDを設定してください');
    await loadGsi();
    if (!tokenClientRef.current) {
      tokenClientRef.current = createTokenClient(
        clientId,
        (resp) => {
          if (resp.error) {
            const rej = pendingRejectRef.current;
            pendingRejectRef.current = pendingResolveRef.current = null;
            if (rej) rej(new Error(resp.error_description || resp.error));
            return;
          }
          tokenRef.current = {
            token: resp.access_token,
            expiresAt: Date.now() + (Number(resp.expires_in || 3600) - 60) * 1000,
          };
          setConnected(true);
          const res = pendingResolveRef.current;
          pendingResolveRef.current = pendingRejectRef.current = null;
          if (res) res(resp.access_token);
        },
        (err) => {
          const rej = pendingRejectRef.current;
          pendingRejectRef.current = pendingResolveRef.current = null;
          if (rej) rej(new Error(err?.message || 'Google認証に失敗しました'));
        }
      );
    }
    return tokenClientRef.current;
  }, [clientId]);

  const getToken = useCallback(async ({ interactive }) => {
    // 有効なトークンがあれば再利用
    if (tokenRef.current && tokenRef.current.expiresAt > Date.now()) {
      return tokenRef.current.token;
    }
    const client = await ensureTokenClient();
    return new Promise((resolve, reject) => {
      pendingResolveRef.current = resolve;
      pendingRejectRef.current = reject;
      try {
        // interactive: 同意画面を表示 / 非interactive: 画面なしで静かに更新
        client.requestAccessToken(interactive ? { prompt: 'consent' } : { prompt: '' });
      } catch (e) {
        pendingResolveRef.current = pendingRejectRef.current = null;
        reject(e);
      }
    });
  }, [ensureTokenClient]);

  // ---- リモートデータの適用 -------------------------------------------------
  const rememberRemote = useCallback((data, fallbackAt = Date.now()) => {
    const at = data.syncMeta?.updatedAt || fallbackAt;
    writeNum(LOCAL_UPDATED_KEY, at);
    writeNum(REMOTE_SEEN_KEY, at);
    writeText(LAST_REVISION_KEY, data.syncMeta?.revisionId || '');
    setLastSyncedAt(at);
  }, []);

  const applyRemote = useCallback((data, reason = 'クラウド復元前') => {
    const validation = validateBackupData(data);
    if (!validation.valid) throw new Error(`クラウドのデータを安全に確認できませんでした：${validation.errors.join('、')}`);
    applyingRemoteRef.current = true;
    const d = dbRef.current;
    saveSafetySnapshot(d, { reason });
    applyBackupToDb(d, data);
    rememberRemote(data);
    setConflict(null);
    // 状態更新に伴う自動アップロードを一巡ぶん抑止
    setTimeout(() => { applyingRemoteRef.current = false; }, 300);
  }, [rememberRemote]);

  // ---- 保存／復元の中核 -----------------------------------------------------
  const doUpload = useCallback(async ({ interactive, force = false, remote: suppliedRemote = null } = {}) => {
    const token = await getToken({ interactive: !!interactive });
    let remote = suppliedRemote;
    let existingId = suppliedRemote?.id || null;
    if (!remote) {
      const existing = await findBackupFile(token);
      existingId = existing?.id || null;
      if (existing) {
        const data = await downloadBackup(token, existing.id);
        const validation = validateBackupData(data);
        if (!validation.valid) {
          throw new Error(`クラウドのバックアップが破損している可能性があります：${validation.errors.join('、')}`);
        }
        remote = { data, modifiedTime: existing.modifiedTime, id: existing.id };
      }
    }

    const at = Date.now();
    const localUpdated = readNum(LOCAL_UPDATED_KEY);
    const previouslySyncedAt = readNum(REMOTE_SEEN_KEY);
    const lastRevision = readText(LAST_REVISION_KEY);
    const remoteUpdated = remote ? (remote.data.syncMeta?.updatedAt || new Date(remote.modifiedTime).getTime()) : 0;
    const remoteRevision = remote?.data.syncMeta?.revisionId || '';
    const state = remote ? classifySyncState({
      localUpdated,
      remoteUpdated,
      lastSyncedAt: previouslySyncedAt,
      remoteRevision,
      lastSyncedRevision: lastRevision,
    }) : 'upload';

    if (!force && remote && (state === 'conflict' || state === 'download')) {
      setConflict({
        remote,
        remoteUpdated,
        localUpdated,
        preview: buildRestorePreview(dbRef.current, remote.data),
      });
      const error = new Error('端末とクラウドの両方に未反映の更新があります。競合を解決してください');
      error.code = 'SYNC_CONFLICT';
      throw error;
    }
    if (force && remote) {
      saveBackupAsSafetySnapshot(remote.data, { reason: 'クラウド版を上書きする前' });
    }

    const revisionId = globalThis.crypto?.randomUUID?.() || `revision-${at}-${Math.random().toString(36).slice(2, 9)}`;
    const payload = buildSafeBackupData(dbRef.current, at, {
      revisionId,
      parentRevisionId: remoteRevision || lastRevision || null,
      deviceId: getDeviceId(),
    });
    await uploadBackup(token, payload, existingId);
    writeNum(LOCAL_UPDATED_KEY, at);
    writeNum(REMOTE_SEEN_KEY, at);
    writeText(LAST_REVISION_KEY, revisionId);
    setLastSyncedAt(at);
    setConflict(null);
    return at;
  }, [getToken]);

  const doDownload = useCallback(async ({ interactive } = {}) => {
    const token = await getToken({ interactive: !!interactive });
    const file = await findBackupFile(token);
    if (!file) return null;
    const data = await downloadBackup(token, file.id);
    const validation = validateBackupData(data);
    if (!validation.valid) {
      throw new Error(`クラウドのバックアップが破損している可能性があります：${validation.errors.join('、')}`);
    }
    return { data, modifiedTime: file.modifiedTime, id: file.id };
  }, [getToken]);

  // クラウドと端末を比較し、新しい方へ寄せる
  const compareAndSync = useCallback(async ({ interactive, silentWhenSynced } = {}) => {
    const remote = await doDownload({ interactive });
    const localUpdated = readNum(LOCAL_UPDATED_KEY);

    if (!remote) {
      // クラウドにまだバックアップが無い → 現在のデータで初回作成
      await doUpload({ force: true });
      showToast('クラウドに初回バックアップを作成しました');
      return;
    }
    const remoteUpdated = remote.data.syncMeta?.updatedAt || new Date(remote.modifiedTime).getTime();
    const state = classifySyncState({
      localUpdated,
      remoteUpdated,
      lastSyncedAt: readNum(REMOTE_SEEN_KEY),
      remoteRevision: remote.data.syncMeta?.revisionId || '',
      lastSyncedRevision: readText(LAST_REVISION_KEY),
    });

    if (state === 'conflict') {
      setConflict({ remote, remoteUpdated, localUpdated, preview: buildRestorePreview(dbRef.current, remote.data) });
      showToast('端末とクラウドの両方に更新があります。設定画面で採用するデータを選んでください', 'error');
    } else if (state === 'download') {
      const preview = buildRestorePreview(dbRef.current, remote.data);
      const proceed = window.confirm(formatRestoreConfirmation(preview, 'Googleドライブ'));
      if (proceed) {
        applyRemote(remote.data);
        showToast('クラウドから最新データを復元しました');
      } else {
        showToast('復元をキャンセルしました', 'error');
      }
    } else if (state === 'upload') {
      await doUpload({ remote });
      showToast('クラウドを最新の状態に更新しました');
    } else {
      writeNum(REMOTE_SEEN_KEY, remoteUpdated);
      writeText(LAST_REVISION_KEY, remote.data.syncMeta?.revisionId || '');
      setLastSyncedAt(remoteUpdated);
      if (!silentWhenSynced) showToast('すでに最新の状態です');
    }
  }, [doDownload, doUpload, applyRemote, showToast]);

  // ---- 公開アクション（UIから呼ぶ） ---------------------------------------
  const withSyncing = useCallback(async (fn) => {
    setSyncing(true);
    try { await fn(); }
    catch (e) { showToast(e?.message || '通信に失敗しました', 'error'); }
    finally { setSyncing(false); }
  }, [showToast]);

  const connect = useCallback(() => withSyncing(async () => {
    await getToken({ interactive: true });
    showToast('Googleドライブに接続しました');
    await compareAndSync({ interactive: false, silentWhenSynced: false });
  }), [withSyncing, getToken, compareAndSync, showToast]);

  const backupNow = useCallback(() => withSyncing(async () => {
    await doUpload({ interactive: !connected });
    showToast('クラウドにバックアップを保存しました');
  }), [withSyncing, doUpload, connected, showToast]);

  const restoreNow = useCallback(() => withSyncing(async () => {
    const remote = await doDownload({ interactive: !connected });
    if (!remote) { showToast('クラウドにバックアップが見つかりません', 'error'); return; }
    const validation = validateBackupData(remote.data);
    if (!validation.valid) throw new Error(`クラウドのバックアップが破損している可能性があります：${validation.errors.join('、')}`);
    const preview = buildRestorePreview(dbRef.current, remote.data);
    if (!window.confirm(formatRestoreConfirmation(preview, 'Googleドライブ'))) return;
    applyRemote(remote.data);
    showToast('クラウドから復元しました');
  }), [withSyncing, doDownload, connected, applyRemote, showToast]);

  const syncNow = useCallback(() => withSyncing(async () => {
    await compareAndSync({ interactive: !connected, silentWhenSynced: false });
  }), [withSyncing, compareAndSync, connected]);

  const resolveConflict = useCallback((choice) => withSyncing(async () => {
    if (!conflict?.remote) return;
    if (choice === 'remote') {
      applyRemote(conflict.remote.data, '同期競合でクラウド版を採用する前');
      showToast('クラウド版を採用しました。以前の端末データは復元ポイントに保存済みです');
      return;
    }
    await doUpload({ interactive: !connected, force: true, remote: conflict.remote });
    showToast('この端末のデータを採用しました。以前のクラウド版は復元ポイントに保存済みです');
  }), [withSyncing, conflict, applyRemote, showToast, doUpload, connected]);

  const dismissConflict = useCallback(() => setConflict(null), []);

  const disconnect = useCallback(async () => {
    if (tokenRef.current?.token) { try { await revokeToken(tokenRef.current.token); } catch { /* 失効失敗は無視 */ } }
    tokenRef.current = null;
    setConnected(false);
    showToast('Googleドライブとの接続を解除しました');
  }, [showToast]);

  // ---- 自動化① データ変更時の自動バックアップ ----------------------------
  useEffect(() => {
    // 初回マウント（＝読込直後）は変更ではないので無視
    if (firstDataRunRef.current) { firstDataRunRef.current = false; return; }
    // リモート適用による変更はアップロードしない（往復を防ぐ）
    if (applyingRemoteRef.current) return;

    // ローカルの更新時刻を記録
    writeNum(LOCAL_UPDATED_KEY, Date.now());

    // 自動同期ON かつ 接続済みのときだけ、少し待ってからアップロード
    if (!autoSyncRef.current || !tokenRef.current) return;
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      doUpload().catch((e) => console.warn('自動バックアップに失敗しました:', e?.message));
    }, 4000);

    return () => clearTimeout(debounceRef.current);
  }, [
    db.students,
    db.tasks,
    db.logs,
    db.config,
    db.absences,
    db.dailyCheckIns,
    db.forgottenItems,
    db.supportActions,
    db.classActions,
    db.familyContacts,
    db.aiActivity,
    db.schemaVersion,
    doUpload,
  ]);

  // ---- 自動化② 起動時の同期チェック（自動同期ON時のみ） ------------------
  useEffect(() => {
    if (!clientId || !autoSync) return;
    let cancelled = false;
    (async () => {
      try {
        await getToken({ interactive: false }); // 画面なしでトークン取得（同意済みなら成功）
        if (cancelled) return;
        await compareAndSync({ interactive: false, silentWhenSynced: true });
      } catch (e) {
        // 未同意などで静かに取得できない場合は何もしない（手動で接続してもらう）
        console.debug('起動時の自動同期をスキップ:', e?.message);
      }
    })();
    return () => { cancelled = true; };
    // 起動時に一度だけ実行する
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { connected, syncing, lastSyncedAt, conflict, connect, backupNow, restoreNow, syncNow, resolveConflict, dismissConflict, disconnect };
};
