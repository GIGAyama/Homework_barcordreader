import React from 'react';
import { AlertTriangle, RefreshCw, ShieldCheck } from 'lucide-react';

export default class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('宿題ポストの画面でエラーが発生しました', error, info);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <main className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-6">
        <section className="w-full max-w-lg rounded-3xl border border-white/10 bg-white/5 p-7 shadow-2xl">
          <div className="w-12 h-12 rounded-2xl bg-amber-400/15 text-amber-300 flex items-center justify-center"><AlertTriangle size={26} /></div>
          <h1 className="text-2xl font-bold mt-5">画面の処理を安全に停止しました</h1>
          <p className="text-sm text-slate-300 mt-3 leading-relaxed">端末内の学級データは削除していません。再読み込み後も問題が続く場合は、設定の「自動復元ポイント」から直前の状態へ戻せます。</p>
          <div className="mt-4 rounded-xl border border-emerald-400/20 bg-emerald-400/10 p-3 text-xs text-emerald-200 flex gap-2"><ShieldCheck size={16} className="shrink-0" /> エラー発生時にデータ初期化を自動実行することはありません。</div>
          <button type="button" onClick={() => window.location.reload()} className="mt-6 w-full rounded-xl bg-white text-slate-900 py-3 font-bold flex items-center justify-center gap-2 hover:bg-slate-100"><RefreshCw size={18} /> 安全に再読み込み</button>
        </section>
      </main>
    );
  }
}
