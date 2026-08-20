/* 宿題ポスト Service Worker
 * - ページ（ナビゲーション）: ネットワーク優先、オフライン時はキャッシュから表示
 * - アセット（JS/CSS/画像）: キャッシュ優先（Viteのビルドはファイル名にハッシュが付くため安全）
 */
/*
 * 【最重要】activate では自アプリ以外のキャッシュを削除しない。
 *   旧配信元の gigayama.github.io は数十個のアプリが同一オリジンを共有していた。
 *   同居する配置に戻したときに他アプリを巻き込まないよう、
 *   CACHE_PREFIX で始まるキャッシュだけを掃除する。
 *   以前はここで caches.keys() の結果を全部消していた。そのため
 *   このアプリを開くたびに、同じ端末に入っている他の GIGA アプリの
 *   キャッシュまで巻き添えで消え、それらがオフラインで起動しなくなっていた。
 *
 * Service Worker は localStorage を一切操作しない。
 */
const CACHE_PREFIX = 'shukudai-post-';
const APP_VERSION = 'v3';   // ← リリースごとに必ず上げる
const CACHE_NAME = CACHE_PREFIX + APP_VERSION;
const PRECACHE_URLS = [
  './',
  './manifest.webmanifest',
  './offline.html',
  './favicon.png',
  './apple-touch-icon.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    // addAll は1本でも取れないと全部落ちる。校内 Wi-Fi が混んでいるときに
    // 「1つ取りこぼしたせいでオフライン対応が丸ごと入らない」のを避けるため、
    // 個別に入れて、取れなかったものだけ飛ばす。
    await Promise.all(PRECACHE_URLS.map((u) =>
      cache.add(new Request(u, { cache: 'reload' }))
        .catch((err) => console.warn('[sw] precache skipped', u, err))));
    // ここでは skipWaiting しない。
    // 児童がバーコードを読ませている最中に画面が突然入れ替わると、
    // 打ちかけの入力が消える。画面側で「さいしんに する」を押してもらってから
    // 切り替える（下の message を参照）。
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys
        // ← 自アプリ接頭辞のものだけを削除する。ここを外すと
        //    同一オリジンの他アプリを巻き添えにする。
        .filter((k) => k.startsWith(CACHE_PREFIX) && k !== CACHE_NAME)
        .map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Googleフォントなどクロスオリジンは stale-while-revalidate 的にキャッシュ
  if (url.origin !== self.location.origin) {
    if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
      event.respondWith(
        caches.match(request).then((cached) => {
          const fetched = fetch(request).then((res) => {
            if (res.ok || res.type === 'opaque') {
              const copy = res.clone();
              caches.open(CACHE_NAME).then((c) => c.put(request, copy));
            }
            return res;
          }).catch(() => cached);
          return cached || fetched;
        })
      );
    }
    return;
  }

  // ページ遷移: ネットワーク優先（最新版を取得）、オフライン時はキャッシュ。
  // キャッシュにも無ければ offline.html を返す。ここを Response.error() のままに
  // すると、児童には「アプリが壊れた」ようにしか見えない。
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put('./', copy));
          return res;
        })
        .catch(async () => (await caches.match('./'))
          || (await caches.match('./offline.html'))
          || Response.error())
    );
    return;
  }

  // 同一オリジンのアセット: キャッシュ優先
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(request, copy));
        }
        return res;
      });
    })
  );
});

// 画面側で「さいしんに する」が押されたときだけ切り替える
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});
