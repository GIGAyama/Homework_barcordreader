/**
 * PWA まわり（Service Worker の更新と「ホーム画面に追加」）の裏方。
 *
 * 画面側はここが出すイベントを見るだけでよい。ここに集めているのは、
 * どちらも「タイミングを外すと二度と取り返せない」種類の処理だから。
 */

/**
 * Service Worker を登録し、新しい版が待機状態になったら知らせる。
 *
 * 更新をその場で当てない（skipWaiting を SW 側の install でやらない）のは、
 * 児童がバーコードを読ませている最中に画面が入れ替わると、
 * 打ちかけの入力が消えてしまうため。「さいしんに する」を押してもらってから
 * 切り替える。
 *
 * @param {(apply: () => void) => void} onUpdateReady 新しい版が用意できたときに呼ばれる。
 *        引数の apply() を呼ぶと、その場で切り替えて再読み込みする。
 */
export function registerServiceWorker(onUpdateReady) {
  if (!('serviceWorker' in navigator)) return;

  // controllerchange は「切り替えが済んだ」合図。ここで1回だけ再読み込みする。
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading) return;
    reloading = true;
    window.location.reload();
  });

  // 登録は load のあとに回す（起動直後の通信を最初の描画と取り合わないため）。
  // ただし「もう load が済んでいる」場合は待っても二度と来ないので、その場で走らせる。
  // React の描画が終わってから effect が動く作りだと、たいてい load は済んでいる。
  // ここを addEventListener('load', ...) だけにしていたときは、
  // Service Worker が一度も登録されず、オフラインで開けなかった。
  const start = () => {
    navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`)
      .then((registration) => {
        const notify = (worker) => {
          if (!worker) return;
          onUpdateReady(() => worker.postMessage({ type: 'SKIP_WAITING' }));
        };

        // すでに新しい版が待っている（前回のうちに入っていた）場合
        if (registration.waiting && navigator.serviceWorker.controller) {
          notify(registration.waiting);
        }

        registration.addEventListener('updatefound', () => {
          const installing = registration.installing;
          if (!installing) return;
          installing.addEventListener('statechange', () => {
            // controller が居るということは、初回インストールではなく更新。
            // 初回で通知を出すと「入れた直後に更新があります」と出て混乱する。
            if (installing.state === 'installed' && navigator.serviceWorker.controller) {
              notify(installing);
            }
          });
        });
      })
      .catch((error) => console.error('Service Worker の登録に失敗しました:', error));
  };

  if (document.readyState === 'complete') start();
  else window.addEventListener('load', start, { once: true });
}

/**
 * 「ホーム画面に追加」が案内できる状態かどうかを見張る。
 *
 * 実際のイベント（beforeinstallprompt）は index.html の install-hook.js が
 * React より前に受け取って window に置いている。ここはそれを拾うだけ。
 *
 * @param {(available: boolean) => void} onChange
 * @returns {() => void} 見張りをやめる関数
 */
export function watchInstallAvailability(onChange) {
  const update = () => onChange(Boolean(window.__pwaInstallPrompt));
  update();
  window.addEventListener('pwa-install-available', update);
  window.addEventListener('pwa-installed', update);
  return () => {
    window.removeEventListener('pwa-install-available', update);
    window.removeEventListener('pwa-installed', update);
  };
}

/**
 * ホーム画面への追加を実際に案内する。
 * prompt() は1つのイベントにつき1回しか使えないので、使ったら捨てる。
 */
export async function showInstallPrompt() {
  const deferred = window.__pwaInstallPrompt;
  if (!deferred) return false;
  window.__pwaInstallPrompt = null;
  window.dispatchEvent(new Event('pwa-install-available'));
  deferred.prompt();
  const choice = await deferred.userChoice.catch(() => null);
  return choice?.outcome === 'accepted';
}
