import { useState, useRef, useCallback, useEffect } from 'react';
import { loadGsi, createTokenClient, revokeToken, findBackupFile, uploadBackup, downloadBackup } from './googleDrive';
import { buildBackupData, isValidBackupData, migrateData } from './dataModel';

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

const readNum = (key) => {
  const v = Number(window.localStorage.getItem(key) || 0);
  return Number.isFinite(v) ? v : 0;
};
const writeNum = (key, val) => {
  try { window.localStorage.setItem(key, String(val)); } catch { /* 保存不可でも致命的でない */ }
};

export const useGoogleDriveSync = ({ db, clientId, autoSync, showToast }) => {
  const [connected, setConnected] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState(() => readNum(REMOTE_SEEN_KEY) || null);

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
  const applyRemote = useCallback((data) => {
    if (!isValidBackupData(data)) throw new Error('クラウドのデータ形式が正しくありません');
    const migrated = migrateData(data);
    applyingRemoteRef.current = true;
    const d = dbRef.current;
    d.setStudents(migrated.students);
    d.setTasks(migrated.tasks);
    d.setLogs(migrated.logs);
    d.setConfig(migrated.config);
    d.setAbsences(migrated.absences);
    d.setDailyCheckIns(migrated.dailyCheckIns);
    d.setForgottenItems(migrated.forgottenItems);
    d.setSupportActions(migrated.supportActions);
    d.setClassActions(migrated.classActions);
    d.setFamilyContacts(migrated.familyContacts);
    d.setSchemaVersion(migrated.schemaVersion);

    const at = data.syncMeta?.updatedAt || Date.now();
    writeNum(LOCAL_UPDATED_KEY, at);
    writeNum(REMOTE_SEEN_KEY, at);
    setLastSyncedAt(at);
    // 状態更新に伴う自動アップロードを一巡ぶん抑止
    setTimeout(() => { applyingRemoteRef.current = false; }, 300);
  }, []);

  // ---- 保存／復元の中核 -----------------------------------------------------
  const doUpload = useCallback(async ({ interactive } = {}) => {
    const token = await getToken({ interactive: !!interactive });
    const existing = await findBackupFile(token);
    const at = Date.now();
    const payload = buildBackupData(dbRef.current, at);
    await uploadBackup(token, payload, existing?.id);
    writeNum(LOCAL_UPDATED_KEY, at);
    writeNum(REMOTE_SEEN_KEY, at);
    setLastSyncedAt(at);
    return at;
  }, [getToken]);

  const doDownload = useCallback(async ({ interactive } = {}) => {
    const token = await getToken({ interactive: !!interactive });
    const file = await findBackupFile(token);
    if (!file) return null;
    const data = await downloadBackup(token, file.id);
    return { data, modifiedTime: file.modifiedTime };
  }, [getToken]);

  // クラウドと端末を比較し、新しい方へ寄せる
  const compareAndSync = useCallback(async ({ interactive, silentWhenSynced } = {}) => {
    const remote = await doDownload({ interactive });
    const localUpdated = readNum(LOCAL_UPDATED_KEY);

    if (!remote) {
      // クラウドにまだバックアップが無い → 現在のデータで初回作成
      await doUpload();
      showToast('クラウドに初回バックアップを作成しました');
      return;
    }
    const remoteUpdated = remote.data.syncMeta?.updatedAt || new Date(remote.modifiedTime).getTime();

    if (remoteUpdated > localUpdated) {
      const proceed = window.confirm(
        '☁️ クラウドに、より新しいデータが見つかりました。\nこの端末に復元しますか？\n\n（現在この端末にあるデータは上書きされます）'
      );
      if (proceed) {
        applyRemote(remote.data);
        showToast('クラウドから最新データを復元しました');
      } else {
        showToast('復元をキャンセルしました', 'error');
      }
    } else if (localUpdated > remoteUpdated) {
      await doUpload();
      showToast('クラウドを最新の状態に更新しました');
    } else {
      writeNum(REMOTE_SEEN_KEY, remoteUpdated);
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
    if (!window.confirm('☁️ クラウドのデータでこの端末を上書きします。よろしいですか？')) return;
    applyRemote(remote.data);
    showToast('クラウドから復元しました');
  }), [withSyncing, doDownload, connected, applyRemote, showToast]);

  const syncNow = useCallback(() => withSyncing(async () => {
    await compareAndSync({ interactive: !connected, silentWhenSynced: false });
  }), [withSyncing, compareAndSync, connected]);

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

  return { connected, syncing, lastSyncedAt, connect, backupNow, restoreNow, syncNow, disconnect };
};
