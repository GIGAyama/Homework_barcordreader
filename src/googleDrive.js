// ==========================================
// ☁️ Google ドライブ連携ヘルパー（ブラウザ完結・OAuth2 トークンフロー）
// ------------------------------------------
// - Google Identity Services (GIS) でアクセストークンを取得
// - Drive REST API (drive.file スコープ) でバックアップ JSON を保存／読込
// - クライアントシークレットは不要（Client ID のみ）。GitHub Pages 等の静的サイトに適合。
// ==========================================

const GSI_SRC = 'https://accounts.google.com/gsi/client';

// OAuth クライアントIDは、ビルドのときに環境変数 VITE_GOOGLE_CLIENT_ID から埋めこむ。
// 先生が画面に貼りつけるのではなく、配る側が一度だけ決める（ノート見本作成ツール PRO・
// デジタル教材メイカーと同じ形）。設定のしかたは GOOGLE_DRIVE_SETUP.md にある。
//
// ⚠️ この値は秘密の鍵ではない。Web 向けの OAuth クライアントIDは、どのみち
//    ブラウザの通信に出てくる公開の識別子で、知られてもデータは読めない。
//    なりすましを防いでいるのは Google Cloud 側の「承認済みの JavaScript 生成元」で
//    あって、この値を隠すことではない。だから配信物に埋めてよい。
//    一方「クライアントシークレット」は本物の鍵なので、ここには置かないこと。
//
// import.meta.env は Vite がビルド時に差しこむ。素の Node（テスト）には無いので、
// このファイルを単体で読み込めるよう存在を確かめてから触る。
export const CLIENT_ID =
  (typeof import.meta.env !== 'undefined' && import.meta.env.VITE_GOOGLE_CLIENT_ID) || '';

// クライアントIDが埋まっているときだけ、同期の操作を出す。
export const isConfigured = () => Boolean(CLIENT_ID);

// このアプリが作成したファイルのみにアクセスできる、プライバシーに配慮したスコープ。
// ユーザーのドライブ全体は見えないため、学校での運用でも安全。
export const SCOPE = 'https://www.googleapis.com/auth/drive.file';

// クラウド上に保存するバックアップファイル名（1端末につき1ファイルを共有）
export const BACKUP_FILENAME = 'shukudai-post-sync.json';

let gsiLoadingPromise = null;

// GIS スクリプトを一度だけ読み込む
export const loadGsi = () => {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  if (gsiLoadingPromise) return gsiLoadingPromise;

  gsiLoadingPromise = new Promise((resolve, reject) => {
    const fail = () => reject(new Error('Google認証スクリプトの読み込みに失敗しました（ネットワークをご確認ください）'));
    const existing = document.querySelector(`script[src="${GSI_SRC}"]`);
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', fail);
      // すでに読み込み済みの場合に備える
      if (window.google?.accounts?.oauth2) resolve();
      return;
    }
    const s = document.createElement('script');
    s.src = GSI_SRC;
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = fail;
    document.head.appendChild(s);
  });
  return gsiLoadingPromise;
};

// トークンクライアントを生成
export const createTokenClient = (clientId, callback, errorCallback) =>
  window.google.accounts.oauth2.initTokenClient({
    client_id: clientId,
    scope: SCOPE,
    callback,
    error_callback: errorCallback,
  });

// アクセストークンを失効（接続解除）
export const revokeToken = (token) =>
  new Promise((resolve) => {
    if (!token || !window.google?.accounts?.oauth2) return resolve();
    window.google.accounts.oauth2.revoke(token, () => resolve());
  });

const authHeader = (token) => ({ Authorization: `Bearer ${token}` });

const driveError = async (res) => {
  let msg = `Driveエラー (${res.status})`;
  try {
    const e = await res.json();
    if (e.error?.message) msg = e.error.message;
  } catch { /* JSON でない場合は既定メッセージ */ }
  if (res.status === 401 || res.status === 403) {
    msg += '（アクセス権限が切れた可能性があります。もう一度接続してください）';
  }
  return new Error(msg);
};

// バックアップファイルを検索して { id, name, modifiedTime } を返す（なければ null）
export const findBackupFile = async (token) => {
  const q = encodeURIComponent(`name = '${BACKUP_FILENAME}' and trashed = false`);
  const url =
    `https://www.googleapis.com/drive/v3/files?q=${q}` +
    `&spaces=drive&fields=files(id,name,modifiedTime)&orderBy=modifiedTime desc`;
  const res = await fetch(url, { headers: authHeader(token) });
  if (!res.ok) throw await driveError(res);
  const data = await res.json();
  return data.files && data.files.length > 0 ? data.files[0] : null;
};

// データをドライブへ保存（新規作成 or 上書き）
export const uploadBackup = async (token, dataObject, existingFileId) => {
  const metadata = { name: BACKUP_FILENAME, mimeType: 'application/json' };
  const body = JSON.stringify(dataObject);
  const boundary = 'shukudaipost' + Math.random().toString(36).slice(2);

  const multipart =
    `--${boundary}\r\n` +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    JSON.stringify(metadata) + '\r\n' +
    `--${boundary}\r\n` +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    body + '\r\n' +
    `--${boundary}--`;

  const isUpdate = !!existingFileId;
  const url = isUpdate
    ? `https://www.googleapis.com/upload/drive/v3/files/${existingFileId}?uploadType=multipart&fields=id,modifiedTime`
    : `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,modifiedTime`;

  const res = await fetch(url, {
    method: isUpdate ? 'PATCH' : 'POST',
    headers: { ...authHeader(token), 'Content-Type': `multipart/related; boundary=${boundary}` },
    body: multipart,
  });
  if (!res.ok) throw await driveError(res);
  return res.json();
};

// ドライブからバックアップの中身（JSON）を読み込む
export const downloadBackup = async (token, fileId) => {
  const url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
  const res = await fetch(url, { headers: authHeader(token) });
  if (!res.ok) throw await driveError(res);
  return res.json();
};
