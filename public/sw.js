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
// APP_VERSION は手で上げない。tools/build-sw.mjs がビルド後に dist/sw.js の
// この行を、先読み対象の内容ハッシュで書き換える（原本のここは 'dev' のまま）。
const APP_VERSION = 'dev'; /* __APP_VERSION__ */
const CACHE_NAME = CACHE_PREFIX + APP_VERSION;
/* 先読み一覧。tools/build-sw.mjs がビルド後に dist/ の実体から埋める
 * （どれを入れるかは sw-build.config.json）。ビルド成果物（assets/）も
 * 入れる。初回訪問の <script>/<link> は Service Worker より先に読み込まれて
 * runtime キャッシュに入らないため、先読みしないと初回のあと圏外で
 * 白い画面になる。埋め忘れは build-sw.mjs が検知してビルドを落とす。 */
const PRECACHE_URLS = []; /* __PRECACHE_URLS__ */

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
  //
  // 保存先は「アプリ本体か、それ以外のページか」で分ける。
  // 以前はどのページも './' に上書きしていた。同じオリジンに privacy.html と
  // terms.html が並んだ今、それでは法務ページを一度開いただけで
  // アプリ本体のキャッシュがそのページに置き換わり、次に圏外でアプリを開いた
  // 児童にプライバシーポリシーが出る。
  if (request.mode === 'navigate') {
    const isAppShell = url.pathname === new URL('./', self.location).pathname;
    const cacheKey = isAppShell ? './' : request;
    event.respondWith(
      fetch(request)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put(cacheKey, copy));
          }
          return res;
        })
        // 圏外では「開こうとしたページ自身」を返す。アプリ本体で代用すると、
        // 利用規約を開いたつもりの人にアプリの画面が出ることになる。
        .catch(async () => (await caches.match(cacheKey))
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
