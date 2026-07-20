import { useCallback, useEffect, useState } from 'react';
import { ArchiveRestore, CheckCircle2, Clock3, History, RotateCcw, ShieldCheck, Trash2 } from 'lucide-react';
import { applyBackupToDb, buildRestorePreview, formatRestoreConfirmation } from './dataSafety';
import {
  SNAPSHOT_CHANGED_EVENT,
  deleteSafetySnapshot,
  getSafetySnapshot,
  listSafetySnapshots,
  saveSafetySnapshot,
} from './safetySnapshots';

const formatDateTime = value => new Date(value).toLocaleString('ja-JP', {
  month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit',
});

export default function SafetySnapshotPanel({ db, showToast }) {
  const [snapshots, setSnapshots] = useState(() => listSafetySnapshots());
  const refresh = useCallback(() => setSnapshots(listSafetySnapshots()), []);

  useEffect(() => {
    window.addEventListener(SNAPSHOT_CHANGED_EVENT, refresh);
    return () => window.removeEventListener(SNAPSHOT_CHANGED_EVENT, refresh);
  }, [refresh]);

  const createSnapshot = () => {
    try {
      saveSafetySnapshot(db, { reason: '手動の復元ポイント' });
      refresh();
      showToast('現在の状態を復元ポイントに保存しました');
    } catch (error) {
      showToast(error?.message || '復元ポイントを保存できませんでした', 'error');
    }
  };

  const restoreSnapshot = snapshotId => {
    const snapshot = getSafetySnapshot(snapshotId);
    if (!snapshot) return showToast('復元ポイントを読み込めませんでした', 'error');
    const preview = buildRestorePreview(db, snapshot.backup);
    if (!window.confirm(formatRestoreConfirmation(preview, '選択した復元ポイント'))) return;
    try {
      saveSafetySnapshot(db, { reason: '復元ポイント適用前' });
      applyBackupToDb(db, snapshot.backup);
      showToast('選択した復元ポイントへ戻しました');
    } catch (error) {
      showToast(error?.message || '復元に失敗しました', 'error');
    }
  };

  const removeSnapshot = snapshotId => {
    if (!window.confirm('この復元ポイントを削除しますか？現在の学級データは変わりません。')) return;
    deleteSafetySnapshot(snapshotId);
    refresh();
    showToast('復元ポイントを削除しました');
  };

  return (
    <section className="bg-white p-5 rounded-2xl shadow-sm border border-emerald-200 flex flex-col gap-4">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-emerald-700 flex items-center gap-2"><ShieldCheck size={18} /> 自動復元ポイント</h3>
          <p className="text-xs text-slate-500 font-bold leading-relaxed mt-2">変更中は30分ごと、データを上書きする操作の直前には必ず端末内へ退避します。整合性を検証した最新5世代を保持します。</p>
        </div>
        <button type="button" onClick={createSnapshot} className="shrink-0 bg-emerald-50 text-emerald-700 font-bold px-4 py-2.5 rounded-xl border border-emerald-200 hover:bg-emerald-100 flex items-center justify-center gap-2 text-sm">
          <History size={16} /> 今すぐ保存
        </button>
      </div>

      {snapshots.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-xs text-slate-500">最初の変更後に復元ポイントが自動作成されます。</div>
      ) : (
        <div className="space-y-2">
          {snapshots.map((snapshot, index) => (
            <article key={snapshot.id} className="rounded-xl border border-slate-200 p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  {index === 0 ? <CheckCircle2 size={15} className="text-emerald-500" /> : <Clock3 size={15} className="text-slate-400" />}
                  <p className="text-sm font-bold text-slate-700 truncate">{snapshot.reason}</p>
                  {snapshot.automatic && <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">自動</span>}
                </div>
                <p className="text-[11px] text-slate-400 mt-1 ml-6">{formatDateTime(snapshot.createdAt)}・{snapshot.totalRecords}件</p>
              </div>
              <div className="flex gap-2 shrink-0">
                <button type="button" onClick={() => restoreSnapshot(snapshot.id)} className="px-3 py-2 rounded-lg bg-slate-900 text-white text-xs font-bold hover:bg-slate-700 flex items-center gap-1"><RotateCcw size={13} /> 戻す</button>
                <button type="button" onClick={() => removeSnapshot(snapshot.id)} aria-label="復元ポイントを削除" className="p-2 rounded-lg bg-slate-100 text-slate-400 hover:bg-red-50 hover:text-red-500"><Trash2 size={15} /></button>
              </div>
            </article>
          ))}
        </div>
      )}

      <p className="text-[11px] text-slate-400 flex items-center gap-1.5"><ArchiveRestore size={13} /> 復元ポイントはこの端末内に保存されます。端末故障に備え、ファイルまたはGoogleドライブのバックアップも併用してください。</p>
    </section>
  );
}
