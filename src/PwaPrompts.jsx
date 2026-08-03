import { useEffect, useState } from 'react';
import { Download, RefreshCw } from 'lucide-react';
import { registerServiceWorker, watchInstallAvailability, showInstallPrompt } from './pwa';

/**
 * ヘッダーに出す「ホーム画面に入れる」ボタン。
 *
 * 案内できる状態のときだけ現れる。すでに入れてある端末や、
 * 案内に対応していないブラウザ（iPad の Safari など）では何も出さない。
 * 出せないボタンを置いておくと「押しても何も起きない」と言われるため。
 */
export const InstallButton = () => {
  const [available, setAvailable] = useState(false);
  useEffect(() => watchInstallAvailability(setAvailable), []);
  if (!available) return null;

  return (
    <button
      type="button"
      onClick={showInstallPrompt}
      className="no-print flex items-center gap-1.5 rounded-full border-2 border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-700 transition-all hover:bg-red-100 active:scale-95 focus:outline-none focus:ring-2 focus:ring-red-300"
    >
      <Download size={18} aria-hidden="true" />
      <span className="hidden sm:inline">ホームに いれる</span>
    </button>
  );
};

// StrictMode は effect を2回走らせる。Service Worker の登録は1回でよいので、
// モジュール側で見張る。
let registered = false;

/**
 * Service Worker を登録し、新しい版が用意できたら下から帯を出す。
 *
 * 勝手に切り替えず、押してもらってから切り替える。
 * 朝の受付中に画面が入れ替わると、読み取りかけの操作が消えるため。
 */
export const UpdateBanner = () => {
  const [apply, setApply] = useState(null);

  useEffect(() => {
    if (registered || !import.meta.env.PROD) return;
    registered = true;
    // setState に関数をそのまま渡すと「更新関数」と解釈されるので包む
    registerServiceWorker((run) => setApply(() => run));
  }, []);

  if (!apply) return null;
  return (
    <div
      role="status"
      className="no-print fixed inset-x-0 bottom-0 z-[110] flex flex-wrap items-center justify-center gap-3 bg-slate-800 px-4 py-3 text-white shadow-lg"
      style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}
    >
      <span className="text-sm font-bold">あたらしい ばんが あります</span>
      <button
        type="button"
        onClick={apply}
        className="flex min-h-[44px] items-center gap-2 rounded-full bg-white px-5 py-2 text-sm font-bold text-slate-800 transition-all hover:bg-slate-100 active:scale-95 focus:outline-none focus:ring-2 focus:ring-white"
      >
        <RefreshCw size={16} aria-hidden="true" />
        さいしんに する
      </button>
    </div>
  );
};
