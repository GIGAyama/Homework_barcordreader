/* 宿題ポスト Service Worker
 * - ページ（ナビゲーション）: ネットワーク優先、オフライン時はキャッシュから表示
 * - アセット（JS/CSS/画像）: キャッシュ優先（Viteのビルドはファイル名にハッシュが付くため安全）
 */
/*
 * 【最重要】activate では自アプリ以外のキャッシュを削除しない。
 *   gigayama.github.io は数十個のアプリが同一オリジンを共有しているため、
 *   CACHE_PREFIX で始まるキャッシュだけを掃除する。
 *   以前はここで caches.keys() の結果を全部消していた。そのため
 *   このアプリを開くたびに、同じ端末に入っている他の GIGA アプリの
 *   キャッシュまで巻き添えで消え、それらがオフラインで起動しなくなっていた。
 */
const CACHE_PREFIX = 'shukudai-post-';
const APP_VERSION = 'v2';   // ← リリースごとに必ず上げる
const CACHE_NAME = CACHE_PREFIX + APP_VERSION;
const PRECACHE_URLS = [
  './',
  './manifest.webmanifest',
  './favicon.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
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

  // ページ遷移: ネットワーク優先（最新版を取得）、オフライン時はキャッシュ
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put('./', copy));
          return res;
        })
        .catch(() => caches.match('./'))
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
