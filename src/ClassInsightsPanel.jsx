import React, { useMemo, useState } from 'react';
import {
  Activity,
  AlertCircle,
  Backpack,
  CalendarCheck,
  CheckCircle2,
  ClipboardCheck,
  HeartPulse,
  Lightbulb,
  RefreshCw,
  Sparkles,
  Target,
  Trash2,
  Users,
} from 'lucide-react';
import { buildClassInsights } from './classInsights';
import { createClassImprovementAction, recordClassImprovementOutcome } from './dataModel';
import { shiftDate } from './studentInsights';

const OUTCOME_RATINGS = ['改善', '一部改善', '変化なし', '要見直し'];
const fieldClass = 'w-full bg-white border border-slate-200 rounded-xl px-3 py-3 text-sm font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-300 focus:border-teal-300 transition-all';

const Trend = ({ value, unit = '' }) => {
  if (value === null || value === undefined) return <span className="text-[10px] font-bold text-slate-400">前期間の比較なし</span>;
  return <span className="text-[10px] font-bold text-slate-500">前の14日間から {value > 0 ? '+' : ''}{value}{unit}</span>;
};

const MetricCard = ({ label, value, note, Icon, iconClass, trend, unit }) => (
  <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs font-bold text-slate-400">{label}</span>
      <Icon size={18} className={iconClass} />
    </div>
    <p className="text-3xl font-bold text-slate-800 mt-2">{value}</p>
    <p className="text-[11px] text-slate-400 font-bold mt-1">{note}</p>
    <div className="mt-2"><Trend value={trend} unit={unit} /></div>
  </div>
);

export default function ClassInsightsPanel({
  db,
  showToast,
  today,
  currentStart,
  currentEnd,
  previousStart,
  previousEnd,
  currentReports,
  previousReports,
}) {
  const [outcomeDrafts, setOutcomeDrafts] = useState({});
  const analysis = useMemo(() => buildClassInsights({
    currentReports,
    previousReports,
    dailyCheckIns: db.dailyCheckIns,
    forgottenItems: db.forgottenItems,
    supportActions: db.supportActions,
    currentStart,
    currentEnd,
    previousStart,
    previousEnd,
  }), [currentReports, previousReports, db.dailyCheckIns, db.forgottenItems, db.supportActions, currentStart, currentEnd, previousStart, previousEnd]);

  const activeActions = useMemo(
    () => db.classActions.filter(item => item.status !== '完了')
      .sort((a, b) => String(a.reviewDate).localeCompare(String(b.reviewDate))),
    [db.classActions]
  );
  const completedActions = useMemo(
    () => db.classActions.filter(item => item.status === '完了')
      .sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0)),
    [db.classActions]
  );

  const adoptInsight = insight => {
    if (activeActions.some(item => item.sourceInsightId === insight.id)) {
      showToast('この改善候補はすでに実施中です', 'error');
      return;
    }
    const next = createClassImprovementAction({
      sourceInsightId: insight.id,
      area: insight.area,
      title: insight.title,
      evidence: insight.evidence,
      action: insight.action,
      measure: insight.measure,
      startDate: today,
      reviewDate: shiftDate(today, 14),
    });
    db.setClassActions(previous => [...previous, next]);
    showToast('学級改善プランに追加しました');
  };

  const updateDraft = (id, patch) => setOutcomeDrafts(previous => ({
    ...previous,
    [id]: { result: '', outcomeRating: '改善', status: '完了', ...(previous[id] || {}), ...patch },
  }));

  const saveOutcome = action => {
    const draft = { result: '', outcomeRating: '改善', status: '完了', ...(outcomeDrafts[action.id] || {}) };
    if (!draft.result.trim()) {
      showToast('確認した結果を入力してください', 'error');
      return;
    }
    db.setClassActions(previous => recordClassImprovementOutcome(previous, action.id, draft));
    setOutcomeDrafts(previous => {
      const next = { ...previous };
      delete next[action.id];
      return next;
    });
    showToast('学級改善の振り返りを保存しました');
  };

  const deleteAction = action => {
    if (!window.confirm(`改善プラン「${action.title}」を削除しますか？`)) return;
    db.setClassActions(previous => previous.filter(item => item.id !== action.id));
    showToast('改善プランを削除しました');
  };

  const { metrics } = analysis;
  return (
    <div className="space-y-4 animate-fade-in-up">
      <div className="bg-gradient-to-br from-teal-600 via-cyan-600 to-indigo-700 rounded-3xl p-6 text-white shadow-lg shadow-cyan-100 relative overflow-hidden">
        <Activity size={170} className="absolute -right-8 -bottom-12 opacity-10" />
        <div className="relative z-10 max-w-3xl">
          <span className="inline-flex items-center gap-1.5 text-xs font-bold bg-white/20 px-3 py-1 rounded-full mb-3"><Sparkles size={14} /> 記録を学級改善へ</span>
          <h3 className="text-2xl font-bold">学級DXインサイト</h3>
          <p className="text-sm font-bold text-cyan-50 mt-2 leading-relaxed">直近14日間を前の14日間と比較し、学級全体で試せる改善候補を示します。児童名や個人順位は表示しません。</p>
          <p className="text-xs text-cyan-100 mt-3">分析期間：{currentStart} 〜 {currentEnd}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <MetricCard label="課題提出率" value={metrics.submission.rate === null ? '—' : `${metrics.submission.rate}%`} note={`${metrics.submission.submitted}/${metrics.submission.required}回`} Icon={ClipboardCheck} iconClass="text-emerald-500" trend={metrics.submission.delta} unit="pt" />
        <MetricCard label="困り感のある選択" value={metrics.feelings.challengingRate === null ? '—' : `${metrics.feelings.challengingRate}%`} note={`${metrics.feelings.challenging}/${metrics.feelings.total}件`} Icon={HeartPulse} iconClass="text-orange-500" trend={metrics.feelings.delta} unit="pt" />
        <MetricCard label="忘れ物" value={`${metrics.forgotten.total}件`} note={metrics.forgotten.topItems[0] ? `最多：${metrics.forgotten.topItems[0].label}` : '期間内の記録'} Icon={Backpack} iconClass="text-red-500" trend={metrics.forgotten.delta} unit="件" />
        <MetricCard label="支援の確認期限" value={`${metrics.support.dueFollowUps}件`} note="予定日を迎えた実施中支援" Icon={CalendarCheck} iconClass="text-indigo-500" />
      </div>

      <section className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-slate-100 bg-slate-50 flex items-center justify-between gap-3">
          <div>
            <h4 className="font-bold text-slate-800 flex items-center gap-2"><Lightbulb size={19} className="text-amber-500" /> 今週の改善候補</h4>
            <p className="text-xs text-slate-400 mt-1">基準に該当した集計事実と、学級全体で試せる小さな一手</p>
          </div>
          <span className="text-xs font-bold bg-white border border-slate-200 px-3 py-1.5 rounded-full text-slate-500">{analysis.insights.length}件</span>
        </div>
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 p-4">
          {analysis.insights.map(insight => {
            const adopted = activeActions.some(item => item.sourceInsightId === insight.id);
            return (
              <article key={insight.id} className={`rounded-2xl border p-5 ${insight.priority >= 3 ? 'border-red-200 bg-red-50/60' : insight.priority === 2 ? 'border-amber-200 bg-amber-50/60' : 'border-emerald-200 bg-emerald-50/60'}`}>
                <div className="flex items-start justify-between gap-3">
                  <div><span className="text-[10px] font-bold bg-white border border-slate-200 text-slate-500 px-2 py-1 rounded-full">{insight.area}</span><h5 className="font-bold text-slate-800 mt-3">{insight.title}</h5></div>
                  {insight.priority >= 3 && <span className="text-[10px] font-bold bg-red-100 text-red-600 px-2 py-1 rounded-full">優先確認</span>}
                </div>
                <div className="mt-4 space-y-3 text-xs leading-relaxed">
                  <div><span className="font-bold text-slate-500">根拠</span><p className="text-slate-700 mt-1">{insight.evidence}</p></div>
                  <div><span className="font-bold text-teal-700">試すこと</span><p className="font-bold text-slate-800 mt-1">{insight.action}</p></div>
                  <div><span className="font-bold text-indigo-600">確認指標</span><p className="text-slate-700 mt-1">{insight.measure}</p></div>
                </div>
                <button type="button" onClick={() => adoptInsight(insight)} disabled={adopted} className={`w-full mt-4 py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all ${adopted ? 'bg-emerald-100 text-emerald-700 cursor-default' : 'bg-slate-900 hover:bg-slate-800 text-white active:scale-[0.99]'}`}>
                  {adopted ? <><CheckCircle2 size={17} /> 実施中のプラン</> : <><Target size={17} /> 改善プランに追加</>}
                </button>
              </article>
            );
          })}
        </div>
      </section>

      <section className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-slate-100 bg-slate-50">
          <h4 className="font-bold text-slate-800 flex items-center gap-2"><RefreshCw size={18} className="text-teal-600" /> 学級改善サイクル</h4>
          <p className="text-xs text-slate-400 mt-1">実施した工夫を14日後に振り返り、次の学級運用へつなげます。</p>
        </div>
        {activeActions.length === 0 ? (
          <div className="p-10 text-center">
            <Users size={38} className="mx-auto text-slate-300 mb-3" />
            <p className="font-bold text-slate-500">実施中の学級改善プランはありません</p>
            <p className="text-xs text-slate-400 mt-1">改善候補から、今週試すことを一つ選んでください。</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {activeActions.map(action => {
              const draft = { result: '', outcomeRating: '改善', status: '完了', ...(outcomeDrafts[action.id] || {}) };
              const overdue = action.reviewDate && action.reviewDate <= today;
              return (
                <article key={action.id} className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div><span className="text-[10px] font-bold bg-teal-50 text-teal-700 px-2 py-1 rounded-full">{action.area}</span><h5 className="font-bold text-slate-800 mt-2">{action.title}</h5></div>
                    <button type="button" onClick={() => deleteAction(action)} aria-label="改善プランを削除" className="p-2 text-slate-300 hover:text-red-500 rounded-lg"><Trash2 size={16} /></button>
                  </div>
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 mt-4 text-xs">
                    <div className="bg-slate-50 rounded-xl p-3"><span className="font-bold text-slate-400">根拠</span><p className="text-slate-700 mt-1 leading-relaxed">{action.evidence}</p></div>
                    <div className="bg-teal-50 rounded-xl p-3"><span className="font-bold text-teal-600">実施すること</span><p className="font-bold text-teal-900 mt-1 leading-relaxed">{action.action}</p></div>
                    <div className="bg-indigo-50 rounded-xl p-3"><span className="font-bold text-indigo-500">確認指標</span><p className="text-indigo-900 mt-1 leading-relaxed">{action.measure}</p></div>
                  </div>
                  <div className={`mt-3 text-xs font-bold flex items-center gap-2 ${overdue ? 'text-red-500' : 'text-slate-400'}`}><CalendarCheck size={14} /> {action.reviewDate} に振り返り{overdue ? '（確認時期です）' : ''}</div>
                  <div className="mt-4 bg-slate-50 border border-slate-100 rounded-xl p-4">
                    <div className="flex items-center gap-2 text-sm font-bold text-slate-700 mb-3"><AlertCircle size={17} className="text-teal-600" /> 実施後の変化</div>
                    <div className="grid grid-cols-1 lg:grid-cols-[1fr_150px_130px] gap-2">
                      <input value={draft.result} onChange={event => updateDraft(action.id, { result: event.target.value })} placeholder="確認指標がどう変化したかを事実で入力" className={fieldClass} />
                      <select value={draft.outcomeRating} onChange={event => updateDraft(action.id, { outcomeRating: event.target.value })} className={fieldClass}>{OUTCOME_RATINGS.map(rating => <option key={rating}>{rating}</option>)}</select>
                      <select value={draft.status} onChange={event => updateDraft(action.id, { status: event.target.value })} className={fieldClass}><option>完了</option><option>実施中</option></select>
                    </div>
                    <button type="button" onClick={() => saveOutcome(action)} className="w-full lg:w-auto bg-teal-600 hover:bg-teal-500 text-white text-sm font-bold px-5 py-2.5 rounded-xl mt-3">振り返りを保存</button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {completedActions.length > 0 && (
        <section className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="p-4 bg-slate-50 border-b border-slate-100"><h4 className="font-bold text-slate-700">完了した改善プラン</h4></div>
          <div className="divide-y divide-slate-100">{completedActions.slice(0, 8).map(action => <div key={action.id} className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-2 text-sm"><div><span className="font-bold text-slate-700">{action.title}</span><p className="text-xs text-slate-500 mt-1">{action.result}</p></div><span className="text-xs font-bold bg-emerald-50 text-emerald-700 px-3 py-1.5 rounded-full self-start">{action.outcomeRating}</span></div>)}</div>
        </section>
      )}

      <div className="text-xs text-slate-500 bg-cyan-50 border border-cyan-100 rounded-xl p-4 leading-relaxed">
        自動表示は学級全体の記録をルールで整理した確認候補です。児童の診断・能力評価・順位付けには使用せず、授業や学級運用を改善するための材料として利用してください。
      </div>
    </div>
  );
}
