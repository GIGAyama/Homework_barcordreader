import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  Backpack,
  CheckCircle2,
  ClipboardCheck,
  ClipboardCopy,
  Clock3,
  HeartPulse,
  MessageSquare,
  ShieldAlert,
  Sparkles,
  Users,
} from 'lucide-react';
import { buildDailyOperations, buildHandoverBrief } from './dailyOperations';

const GROUPS = [
  { id: '朝の確認', label: '朝の確認', Icon: HeartPulse, color: 'text-orange-500', bg: 'bg-orange-50 border-orange-100' },
  { id: '提出・授業', label: '提出・授業', Icon: Backpack, color: 'text-red-500', bg: 'bg-red-50 border-red-100' },
  { id: '連携・振り返り', label: '連携・振り返り', Icon: MessageSquare, color: 'text-blue-500', bg: 'bg-blue-50 border-blue-100' },
  { id: '今日の状態', label: '今日の状態', Icon: CheckCircle2, color: 'text-emerald-500', bg: 'bg-emerald-50 border-emerald-100' },
];

const MetricCard = ({ label, value, note, Icon, color }) => (
  <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
    <div className="flex items-center justify-between gap-2"><span className="text-xs font-bold text-slate-400">{label}</span><Icon size={18} className={color} /></div>
    <p className="text-3xl font-bold text-slate-800 mt-2">{value}</p>
    <p className="text-[11px] text-slate-400 font-bold mt-1">{note}</p>
  </div>
);

export default function OperationsCenterPanel({ db, today, onNavigate, showToast }) {
  const [showBrief, setShowBrief] = useState(false);
  const operations = useMemo(() => buildDailyOperations({
    today,
    students: db.students,
    tasks: db.tasks,
    logs: db.logs,
    dailyCheckIns: db.dailyCheckIns,
    absences: db.absences,
    forgottenItems: db.forgottenItems,
    supportActions: db.supportActions,
    familyContacts: db.familyContacts,
    classActions: db.classActions,
  }), [today, db.students, db.tasks, db.logs, db.dailyCheckIns, db.absences, db.forgottenItems, db.supportActions, db.familyContacts, db.classActions]);
  const brief = useMemo(() => buildHandoverBrief({ today, operations }), [today, operations]);

  const copyBrief = async () => {
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(brief);
      else {
        const textarea = document.createElement('textarea');
        textarea.value = brief;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        textarea.remove();
      }
      showToast('引き継ぎブリーフをコピーしました');
    } catch {
      showToast('コピーできませんでした。表示した文章を選択してください', 'error');
      setShowBrief(true);
    }
  };

  const { summary } = operations;
  return (
    <div className="space-y-4 animate-fade-in-up">
      <div className="bg-gradient-to-br from-slate-950 via-slate-900 to-blue-900 rounded-3xl p-6 text-white shadow-lg relative overflow-hidden">
        <Clock3 size={175} className="absolute -right-8 -bottom-12 opacity-10" />
        <div className="relative z-10 max-w-3xl">
          <span className="inline-flex items-center gap-1.5 text-xs font-bold bg-white/15 px-3 py-1 rounded-full mb-3"><Sparkles size={14} /> 今日やることを一か所に</span>
          <h3 className="text-2xl font-bold">今日の校務オペレーション</h3>
          <p className="text-sm font-bold text-slate-300 mt-2 leading-relaxed">朝の確認から提出、授業中の記録、家庭・支援のフォローまで、今日の行動を優先順に整理します。</p>
          <p className="text-xs text-slate-400 mt-3">対象日：{today}</p>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
        <div className="flex items-center justify-between gap-3 mb-3"><div><h4 className="font-bold text-slate-800">朝の確認進捗</h4><p className="text-xs text-slate-400 mt-1">提出・きもち・出欠のいずれかが記録された児童</p></div><span className="text-3xl font-bold text-slate-900">{summary.morningRate}%</span></div>
        <div className="h-3 bg-slate-100 rounded-full overflow-hidden"><div className={`h-full rounded-full transition-all ${summary.morningRate === 100 ? 'bg-emerald-500' : summary.morningRate >= 70 ? 'bg-amber-400' : 'bg-red-400'}`} style={{ width: `${summary.morningRate}%` }} /></div>
        <p className="text-xs font-bold text-slate-500 mt-2">{summary.students}名中 {summary.morningConfirmed}名確認済み</p>
      </div>

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <MetricCard label="きもちの個別確認" value={`${summary.challenging}名`} note="今日の最新チェックイン" Icon={HeartPulse} color="text-orange-500" />
        <MetricCard label="提出の残り" value={`${summary.submissionGaps}回`} note="欠席児童を除く" Icon={ClipboardCheck} color="text-emerald-500" />
        <MetricCard label="今日の忘れ物" value={`${summary.forgotten}件`} note="授業中の記録" Icon={Backpack} color="text-red-500" />
        <MetricCard label="期限付きフォロー" value={`${summary.dueFollowUps}件`} note="支援・家庭・学級改善" Icon={Clock3} color="text-blue-500" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 items-start">
        {GROUPS.map(group => {
          const groupActions = operations.actions.filter(action => action.group === group.id);
          if (groupActions.length === 0) return null;
          const Icon = group.Icon;
          return (
            <section key={group.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              <div className={`p-4 border-b flex items-center justify-between gap-3 ${group.bg}`}><h4 className={`font-bold flex items-center gap-2 ${group.color}`}><Icon size={18} /> {group.label}</h4><span className="text-xs font-bold bg-white/80 text-slate-500 px-2 py-1 rounded-full">{groupActions.length}件</span></div>
              <div className="divide-y divide-slate-100">
                {groupActions.map(action => (
                  <article key={action.id} className="p-4">
                    <div className="flex items-start justify-between gap-3"><h5 className="font-bold text-sm text-slate-800">{action.title}</h5>{action.priority >= 3 && <span className="text-[10px] font-bold bg-red-100 text-red-600 px-2 py-1 rounded-full whitespace-nowrap">優先</span>}</div>
                    <p className="text-xs text-slate-500 mt-2 leading-relaxed">{action.detail}</p>
                    <button type="button" onClick={() => onNavigate(action.route)} className="text-xs font-bold text-blue-600 hover:text-blue-500 mt-3 flex items-center gap-1">該当画面を開く <ArrowRight size={13} /></button>
                  </article>
                ))}
              </div>
            </section>
          );
        })}
      </div>

      <section className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div><h4 className="font-bold text-slate-800 flex items-center gap-2"><Users size={18} className="text-blue-500" /> 校内引き継ぎブリーフ</h4><p className="text-xs text-slate-400 mt-1">専科、支援員、代理の先生へ、今日の確認事項を短い文章で共有できます。</p></div>
          <div className="flex gap-2"><button type="button" onClick={() => setShowBrief(value => !value)} className="px-4 py-2.5 bg-slate-100 text-slate-700 rounded-xl text-sm font-bold hover:bg-slate-200">{showBrief ? '閉じる' : '内容を確認'}</button><button type="button" onClick={copyBrief} className="px-4 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-500 flex items-center gap-2"><ClipboardCopy size={16} /> コピー</button></div>
        </div>
        {showBrief && <div className="border-t border-slate-100 p-4 bg-slate-50"><pre className="whitespace-pre-wrap text-xs leading-relaxed text-slate-700 font-sans bg-white border border-slate-200 rounded-xl p-4 select-text">{brief}</pre></div>}
      </section>

      <div className="bg-amber-50 border border-amber-100 text-amber-800 rounded-xl p-4 text-xs leading-relaxed flex gap-2"><ShieldAlert size={16} className="shrink-0" /><p><b>校内限定：</b>引き継ぎブリーフには児童名を含む場合があります。家庭から聞いた限定情報、診断、児童の順位は含めません。必要な相手にだけ共有してください。</p></div>

      {operations.actions.some(action => action.id === 'all-clear') && <div className="bg-emerald-50 border border-emerald-100 text-emerald-800 rounded-xl p-4 text-sm font-bold flex items-center gap-2"><CheckCircle2 size={18} /> 現在の記録上、追加の優先確認はありません。</div>}
      {summary.morningRate < 100 && <div className="bg-slate-50 border border-slate-200 text-slate-600 rounded-xl p-4 text-xs flex gap-2"><AlertCircle size={16} className="shrink-0" /> 未確認は「未提出」を意味しません。端末操作前、出欠未入力などの可能性を確認してください。</div>}
    </div>
  );
}
