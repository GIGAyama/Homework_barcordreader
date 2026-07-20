import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Backpack,
  CalendarCheck,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  FileClock,
  HandHeart,
  HeartPulse,
  Lightbulb,
  MessageSquare,
  Plus,
  Sparkles,
  Target,
  Trash2,
  UserRoundSearch,
  Users,
} from 'lucide-react';
import { createSupportAction, recordSupportOutcome } from './dataModel';
import { buildStudentTimeline, buildSupportSignals, shiftDate, summarizeStudent } from './studentInsights';

const getLocalDateString = (date = new Date()) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const SUPPORT_CATEGORIES = ['学習準備', '課題提出', '学習', '生活・体調', '友人関係', 'その他'];
const OUTCOME_RATINGS = ['改善', '一部改善', '変化なし', '要見直し'];
const fieldClass = 'w-full bg-white border border-slate-200 rounded-xl px-3 py-3 text-sm font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-300 transition-all';

const timelineConfig = {
  'submission': { Icon: CheckCircle2, color: 'text-emerald-600', bg: 'bg-emerald-50 border-emerald-100' },
  'check-in': { Icon: HeartPulse, color: 'text-orange-500', bg: 'bg-orange-50 border-orange-100' },
  'forgotten-item': { Icon: Backpack, color: 'text-red-500', bg: 'bg-red-50 border-red-100' },
  'attendance': { Icon: Clock3, color: 'text-amber-600', bg: 'bg-amber-50 border-amber-100' },
  'support': { Icon: HandHeart, color: 'text-indigo-600', bg: 'bg-indigo-50 border-indigo-100' },
  'family-contact': { Icon: MessageSquare, color: 'text-blue-600', bg: 'bg-blue-50 border-blue-100' },
};

const formatDate = dateString => {
  if (!dateString) return '';
  const [year, month, day] = dateString.split('-').map(Number);
  return new Intl.DateTimeFormat('ja-JP', { month: 'numeric', day: 'numeric', weekday: 'short' })
    .format(new Date(year, month - 1, day));
};

const SummaryCard = ({ label, value, suffix, Icon, tone }) => (
  <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs font-bold text-slate-400">{label}</span>
      <Icon size={16} className={tone} />
    </div>
    <div className="text-3xl font-bold text-slate-800 mt-2">{value}<span className="text-xs text-slate-400 ml-1">{suffix}</span></div>
  </div>
);

export default function StudentSupportPanel({ db, showToast }) {
  const today = useMemo(() => getLocalDateString(), []);
  const [selectedStudentId, setSelectedStudentId] = useState(db.students[0]?.id || '');
  const [viewMode, setViewMode] = useState('overview');
  const [outcomeDrafts, setOutcomeDrafts] = useState({});
  const [form, setForm] = useState({
    date: today,
    category: '学習準備',
    observation: '',
    action: '',
    goal: '',
    followUpDate: shiftDate(today, 7),
  });

  useEffect(() => {
    if (!selectedStudentId && db.students[0]) setSelectedStudentId(db.students[0].id);
    if (selectedStudentId && !db.students.some(student => student.id === selectedStudentId)) {
      setSelectedStudentId(db.students[0]?.id || '');
    }
  }, [db.students, selectedStudentId]);

  const selectedStudent = db.students.find(student => student.id === selectedStudentId) || null;
  const periodStart = useMemo(() => shiftDate(today, -27), [today]);
  const summary = useMemo(() => selectedStudent ? summarizeStudent({
    studentId: selectedStudent.id,
    startDate: periodStart,
    endDate: today,
    logs: db.logs,
    dailyCheckIns: db.dailyCheckIns,
    forgottenItems: db.forgottenItems,
    absences: db.absences,
    supportActions: db.supportActions,
  }) : null, [selectedStudent, periodStart, today, db.logs, db.dailyCheckIns, db.forgottenItems, db.absences, db.supportActions]);

  const supportSignals = useMemo(() => buildSupportSignals({
    students: db.students,
    today,
    dailyCheckIns: db.dailyCheckIns,
    forgottenItems: db.forgottenItems,
    supportActions: db.supportActions,
  }), [db.students, today, db.dailyCheckIns, db.forgottenItems, db.supportActions]);

  const selectedSignals = useMemo(
    () => supportSignals.filter(signal => signal.studentId === selectedStudentId),
    [supportSignals, selectedStudentId]
  );
  const selectedSupports = useMemo(
    () => db.supportActions.filter(item => item.studentId === selectedStudentId)
      .sort((a, b) => (a.status === '完了') - (b.status === '完了') || b.date.localeCompare(a.date)),
    [db.supportActions, selectedStudentId]
  );
  const timeline = useMemo(() => selectedStudent ? buildStudentTimeline({
    studentId: selectedStudent.id,
    logs: db.logs,
    tasks: db.tasks,
    dailyCheckIns: db.dailyCheckIns,
    forgottenItems: db.forgottenItems,
    absences: db.absences,
    supportActions: db.supportActions,
    familyContacts: db.familyContacts,
  }) : [], [selectedStudent, db.logs, db.tasks, db.dailyCheckIns, db.forgottenItems, db.absences, db.supportActions, db.familyContacts]);

  const updateForm = patch => setForm(previous => ({ ...previous, ...patch }));

  const handleCreateSupport = event => {
    event.preventDefault();
    if (!selectedStudent) return showToast('児童を選択してください', 'error');
    if (!form.observation.trim() || !form.action.trim() || !form.goal.trim()) {
      return showToast('事実・支援・目標を入力してください', 'error');
    }
    const next = createSupportAction({ student: selectedStudent, ...form });
    db.setSupportActions(previous => [...previous, next]);
    updateForm({ observation: '', action: '', goal: '', followUpDate: shiftDate(today, 7) });
    showToast(`${selectedStudent.name} さんの支援計画を記録しました`);
  };

  const updateOutcomeDraft = (id, patch) => setOutcomeDrafts(previous => ({
    ...previous,
    [id]: { outcome: '', outcomeRating: '改善', status: '完了', ...(previous[id] || {}), ...patch },
  }));

  const handleRecordOutcome = support => {
    const draft = { outcome: '', outcomeRating: '改善', status: '完了', ...(outcomeDrafts[support.id] || {}) };
    if (!draft.outcome.trim()) return showToast('確認した変化を入力してください', 'error');
    db.setSupportActions(previous => recordSupportOutcome(previous, support.id, draft));
    setOutcomeDrafts(previous => {
      const next = { ...previous };
      delete next[support.id];
      return next;
    });
    showToast('支援の結果を記録しました');
  };

  const handleDeleteSupport = support => {
    if (!window.confirm(`${support.studentName} さんの支援記録を削除しますか？`)) return;
    db.setSupportActions(previous => previous.filter(item => item.id !== support.id));
    showToast('支援記録を削除しました');
  };

  if (db.students.length === 0) {
    return (
      <div className="bg-white border border-dashed border-slate-300 rounded-3xl p-12 text-center animate-fade-in-up">
        <Users size={44} className="mx-auto text-slate-300 mb-3" />
        <h3 className="font-bold text-slate-700">児童タイムラインを始める準備</h3>
        <p className="text-sm text-slate-400 mt-2">先に「名簿管理」で児童を登録してください。</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-fade-in-up">
      <div className="bg-gradient-to-br from-indigo-600 via-indigo-500 to-violet-500 rounded-3xl p-6 text-white shadow-lg shadow-indigo-100 overflow-hidden relative">
        <HandHeart size={160} className="absolute -right-8 -bottom-12 opacity-10" />
        <div className="relative z-10 max-w-3xl">
          <span className="inline-flex items-center gap-1.5 text-xs font-bold bg-white/20 px-3 py-1 rounded-full mb-3"><Sparkles size={14} /> 支援をチームの知識に</span>
          <h3 className="text-2xl font-bold mb-2">児童タイムライン・支援ボード</h3>
          <p className="text-sm font-bold text-indigo-50 leading-relaxed">事実、試した支援、変化を一続きで残します。自動表示は診断ではなく、先生が確認する候補です。</p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[300px_minmax(0,1fr)] gap-4 items-start">
        <aside className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden xl:sticky xl:top-2">
          <div className="p-4 bg-slate-50 border-b border-slate-100">
            <h4 className="font-bold text-slate-700 flex items-center gap-2"><UserRoundSearch size={18} className="text-indigo-500" /> 今日の確認候補</h4>
            <p className="text-xs text-slate-400 mt-1">期限と最近の記録から表示</p>
          </div>
          {supportSignals.length === 0 ? (
            <div className="p-7 text-center">
              <CheckCircle2 size={30} className="mx-auto text-emerald-400 mb-2" />
              <p className="text-sm font-bold text-slate-600">現在の確認候補はありません</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 max-h-[440px] overflow-y-auto">
              {supportSignals.map(signal => (
                <button key={signal.id} type="button" onClick={() => { setSelectedStudentId(signal.studentId); setViewMode('overview'); }}
                  className={`w-full p-4 text-left hover:bg-indigo-50 transition-colors ${selectedStudentId === signal.studentId ? 'bg-indigo-50/70' : ''}`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-sm text-slate-800">{signal.studentName}</span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${signal.priority >= 3 ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-700'}`}>{signal.type}</span>
                  </div>
                  <p className="text-xs font-bold text-slate-600 mt-2">{signal.title}</p>
                  <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">{signal.detail}</p>
                </button>
              ))}
            </div>
          )}
          <div className="p-3 border-t border-slate-100 bg-slate-50 text-[10px] text-slate-400 leading-relaxed">件数だけで判断せず、本人の様子や背景と合わせて確認してください。</div>
        </aside>

        <main className="space-y-4 min-w-0">
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <span className="text-xs font-bold text-indigo-500">SELECTED STUDENT</span>
              <h4 className="text-xl font-bold text-slate-800 mt-1">{selectedStudent?.name} さん</h4>
            </div>
            <select value={selectedStudentId} onChange={event => setSelectedStudentId(event.target.value)} className={`${fieldClass} md:w-64`}>
              {db.students.map(student => <option key={student.id} value={student.id}>{student.id}. {student.name}</option>)}
            </select>
          </div>

          {summary && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <SummaryCard label="直近28日の提出" value={summary.submissions} suffix="件" Icon={ClipboardCheck} tone="text-emerald-500" />
              <SummaryCard label="チェックイン" value={summary.checkIns} suffix="日" Icon={HeartPulse} tone="text-orange-500" />
              <SummaryCard label="忘れ物" value={summary.forgottenItems} suffix="件" Icon={Backpack} tone="text-red-500" />
              <SummaryCard label="実施中の支援" value={summary.activeSupports} suffix="件" Icon={HandHeart} tone="text-indigo-500" />
            </div>
          )}

          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-2 flex gap-2 overflow-x-auto">
            {[
              { id: 'overview', label: '概要', Icon: Lightbulb },
              { id: 'plan', label: '支援を記録', Icon: HandHeart },
              { id: 'timeline', label: 'タイムライン', Icon: FileClock },
            ].map(item => (
              <button key={item.id} type="button" onClick={() => setViewMode(item.id)} className={`flex-1 min-w-32 px-4 py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all ${viewMode === item.id ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-100'}`}>
                <item.Icon size={16} /> {item.label}
              </button>
            ))}
          </div>

          {viewMode === 'overview' && (
            <div className="space-y-4">
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
                <h5 className="font-bold text-slate-700 flex items-center gap-2"><AlertCircle size={18} className="text-amber-500" /> この児童の確認候補</h5>
                {selectedSignals.length === 0 ? (
                  <div className="mt-4 bg-emerald-50 border border-emerald-100 rounded-xl p-4 text-sm font-bold text-emerald-700">現在、ルールに該当する確認候補はありません。</div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
                    {selectedSignals.map(signal => (
                      <div key={signal.id} className="border border-amber-200 bg-amber-50 rounded-xl p-4">
                        <span className="text-[10px] font-bold text-amber-700 bg-white px-2 py-1 rounded-full">{signal.type}</span>
                        <p className="font-bold text-sm text-amber-900 mt-3">{signal.title}</p>
                        <p className="text-xs text-amber-700 mt-1">{signal.detail}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                <div className="p-4 bg-slate-50 border-b border-slate-100 flex items-center justify-between gap-3">
                  <h5 className="font-bold text-slate-700 flex items-center gap-2"><HandHeart size={18} className="text-indigo-500" /> 実施中の支援</h5>
                  <button type="button" onClick={() => setViewMode('plan')} className="text-xs font-bold text-indigo-600 hover:text-indigo-500 flex items-center gap-1"><Plus size={14} /> 支援を追加</button>
                </div>
                {selectedSupports.filter(item => item.status !== '完了').length === 0 ? (
                  <div className="p-8 text-center text-sm font-bold text-slate-400">実施中の支援はありません</div>
                ) : selectedSupports.filter(item => item.status !== '完了').map(item => (
                  <div key={item.id} className="p-4 border-b last:border-b-0 border-slate-100">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <span className="text-[10px] font-bold bg-indigo-50 text-indigo-600 px-2 py-1 rounded-full">{item.category}</span>
                        <p className="font-bold text-sm text-slate-800 mt-2">{item.action}</p>
                        <p className="text-xs text-slate-500 mt-1">目標：{item.goal}</p>
                      </div>
                      <span className={`text-xs font-bold whitespace-nowrap ${item.followUpDate <= today ? 'text-red-500' : 'text-slate-400'}`}>確認 {formatDate(item.followUpDate)}</span>
                    </div>
                  </div>
                ))}
              </div>

              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                <div className="p-4 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
                  <h5 className="font-bold text-slate-700 flex items-center gap-2"><FileClock size={18} /> 最近の記録</h5>
                  <button type="button" onClick={() => setViewMode('timeline')} className="text-xs font-bold text-indigo-600">すべて表示 →</button>
                </div>
                <TimelineList events={timeline.slice(0, 6)} />
              </div>
            </div>
          )}

          {viewMode === 'plan' && (
            <div className="space-y-4">
              <form onSubmit={handleCreateSupport} className="bg-white rounded-2xl border border-indigo-100 shadow-sm p-5 space-y-5">
                <div>
                  <h5 className="font-bold text-slate-800 flex items-center gap-2"><HandHeart size={19} className="text-indigo-500" /> 支援計画を記録</h5>
                  <p className="text-xs text-slate-400 mt-1">評価語ではなく、見聞きした事実と具体的な支援を分けて記録します。</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {SUPPORT_CATEGORIES.map(category => (
                    <button key={category} type="button" onClick={() => updateForm({ category })} className={`px-3 py-2 rounded-xl border text-sm font-bold transition-all ${form.category === category ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'}`}>{category}</button>
                  ))}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <label className="space-y-1.5"><span className="text-xs font-bold text-slate-500">記録日</span><input type="date" value={form.date} onChange={event => updateForm({ date: event.target.value })} className={fieldClass} /></label>
                  <label className="space-y-1.5"><span className="text-xs font-bold text-slate-500">振り返り予定日</span><input type="date" value={form.followUpDate} onChange={event => updateForm({ followUpDate: event.target.value })} className={fieldClass} /></label>
                </div>
                <label className="space-y-1.5 block"><span className="text-xs font-bold text-slate-500">確認した事実</span><textarea rows="3" value={form.observation} onChange={event => updateForm({ observation: event.target.value })} placeholder="例：直近2週間で、算数の用具を3回忘れた" className={fieldClass} /></label>
                <label className="space-y-1.5 block"><span className="text-xs font-bold text-slate-500">学校で試す支援</span><textarea rows="3" value={form.action} onChange={event => updateForm({ action: event.target.value })} placeholder="例：帰りの会で持ち物カードを使い、本人が確認する" className={fieldClass} /></label>
                <label className="space-y-1.5 block"><span className="text-xs font-bold text-slate-500">目指す状態</span><input value={form.goal} onChange={event => updateForm({ goal: event.target.value })} placeholder="例：自分で翌日の用具を確認できる" className={fieldClass} /></label>
                <button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3.5 rounded-xl shadow-md transition-all active:scale-[0.99] flex items-center justify-center gap-2"><Target size={19} /> 支援計画を開始</button>
              </form>

              <div className="space-y-3">
                {selectedSupports.length === 0 ? (
                  <div className="bg-white border border-dashed border-slate-300 rounded-2xl p-10 text-center text-slate-400 font-bold">支援記録はまだありません</div>
                ) : selectedSupports.map(support => {
                  const draft = { outcome: '', outcomeRating: '改善', status: '完了', ...(outcomeDrafts[support.id] || {}) };
                  return (
                    <div key={support.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                      <div className="p-5">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-2 flex-wrap"><span className="text-xs font-bold bg-indigo-50 text-indigo-600 px-2 py-1 rounded-full">{support.category}</span><span className={`text-xs font-bold px-2 py-1 rounded-full ${support.status === '完了' ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-700'}`}>{support.status}</span></div>
                          <button type="button" onClick={() => handleDeleteSupport(support)} aria-label="支援記録を削除" className="p-2 text-slate-300 hover:text-red-500 rounded-lg"><Trash2 size={16} /></button>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-4 text-sm">
                          <div className="bg-slate-50 rounded-xl p-3"><span className="text-[10px] font-bold text-slate-400">事実</span><p className="font-bold text-slate-700 mt-1 leading-relaxed">{support.observation}</p></div>
                          <div className="bg-indigo-50/70 rounded-xl p-3"><span className="text-[10px] font-bold text-indigo-400">支援</span><p className="font-bold text-indigo-800 mt-1 leading-relaxed">{support.action}</p></div>
                          <div className="bg-emerald-50/70 rounded-xl p-3"><span className="text-[10px] font-bold text-emerald-500">目標</span><p className="font-bold text-emerald-800 mt-1 leading-relaxed">{support.goal}</p></div>
                        </div>
                        <div className="flex items-center gap-2 mt-3 text-xs text-slate-400 font-bold"><CalendarCheck size={14} /> {formatDate(support.date)}開始・{formatDate(support.followUpDate)}確認予定</div>
                        {support.outcome && <div className="mt-4 border-t border-slate-100 pt-4"><span className="text-xs font-bold text-emerald-600">結果：{support.outcomeRating}</span><p className="text-sm text-slate-700 font-bold mt-1">{support.outcome}</p></div>}
                      </div>
                      {support.status !== '完了' && (
                        <div className="bg-slate-50 border-t border-slate-100 p-4 space-y-3">
                          <div className="flex items-center gap-2 text-sm font-bold text-slate-700"><ClipboardCheck size={17} className="text-indigo-500" /> 支援後の変化を記録</div>
                          <div className="grid grid-cols-1 md:grid-cols-[1fr_150px_130px] gap-2">
                            <input value={draft.outcome} onChange={event => updateOutcomeDraft(support.id, { outcome: event.target.value })} placeholder="確認した変化を事実で入力" className={fieldClass} />
                            <select value={draft.outcomeRating} onChange={event => updateOutcomeDraft(support.id, { outcomeRating: event.target.value })} className={fieldClass}>{OUTCOME_RATINGS.map(rating => <option key={rating}>{rating}</option>)}</select>
                            <select value={draft.status} onChange={event => updateOutcomeDraft(support.id, { status: event.target.value })} className={fieldClass}><option>完了</option><option>実施中</option></select>
                          </div>
                          <button type="button" onClick={() => handleRecordOutcome(support)} className="w-full md:w-auto bg-slate-800 hover:bg-slate-700 text-white text-sm font-bold px-5 py-2.5 rounded-xl">結果を保存</button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {viewMode === 'timeline' && (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              <div className="p-4 bg-slate-50 border-b border-slate-100">
                <h5 className="font-bold text-slate-700 flex items-center gap-2"><FileClock size={18} /> 児童タイムライン</h5>
                <p className="text-xs text-slate-400 mt-1">提出・きもち・忘れ物・出欠・支援・家庭連携を日付順に表示</p>
              </div>
              <TimelineList events={timeline} />
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

const TimelineList = ({ events }) => {
  if (events.length === 0) return <div className="p-10 text-center text-sm font-bold text-slate-400">表示できる記録はまだありません</div>;
  return (
    <div className="divide-y divide-slate-100">
      {events.map(event => {
        const config = timelineConfig[event.kind] || timelineConfig.support;
        const Icon = config.Icon;
        return (
          <div key={`${event.kind}-${event.id}`} className="p-4 flex items-start gap-3 hover:bg-slate-50 transition-colors">
            <div className={`p-2.5 rounded-xl border ${config.bg} ${config.color}`}><Icon size={19} /></div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap"><span className="font-bold text-sm text-slate-800">{event.title}</span>{event.status && <span className="text-[10px] font-bold bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-full">{event.status}</span>}</div>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">{event.detail}</p>
            </div>
            <span className="text-xs text-slate-400 font-bold whitespace-nowrap">{formatDate(event.date)}</span>
          </div>
        );
      })}
    </div>
  );
};
