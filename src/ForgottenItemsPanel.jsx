import { useMemo, useState } from 'react';
import {
  Backpack,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  ClipboardPlus,
  Lightbulb,
  Trash2,
  Users,
} from 'lucide-react';
import { createForgottenItemEvent } from './dataModel';
import { analyzeForgottenItems, buildForgottenItemInsight } from './forgottenItemAnalytics';

const getLocalDateString = (date = new Date()) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const ITEM_PRESETS = ['筆箱', '教科書', 'ノート', '宿題', 'タブレット', '充電', '体育着', '給食セット', 'その他'];
const SUBJECTS = ['国語', '算数', '理科', '社会', '英語', '音楽', '図工', '体育', '生活', '総合', '学活', 'その他'];
const IMPACTS = ['影響なし', '少し困った', '参加が難しかった'];
const RESPONSES = ['貸し出し', '友達と共有', '代用品', '家庭へ連絡', '本人と確認', 'その他'];

const fieldClass = 'w-full bg-white border border-slate-200 rounded-xl px-3 py-3 text-sm font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-red-300 focus:border-red-300 transition-all';

const startOfLookback = (endDate, days) => {
  const [year, month, day] = endDate.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() - days + 1);
  return getLocalDateString(date);
};

export default function ForgottenItemsPanel({ students, records, setRecords, showToast }) {
  const today = useMemo(() => getLocalDateString(), []);
  const [listDate, setListDate] = useState(today);
  const [form, setForm] = useState({
    date: today,
    studentId: '',
    itemPreset: '筆箱',
    customItem: '',
    subject: '国語',
    period: '1',
    impact: '影響なし',
    response: '貸し出し',
    note: '',
  });

  const updateForm = patch => setForm(previous => ({ ...previous, ...patch }));
  const analyticsStart = useMemo(() => startOfLookback(today, 28), [today]);
  const analytics = useMemo(
    () => analyzeForgottenItems(records, analyticsStart, today),
    [records, analyticsStart, today]
  );
  const insight = useMemo(() => buildForgottenItemInsight(analytics), [analytics]);
  const dailyRecords = useMemo(
    () => records.filter(record => record.date === listDate).sort((a, b) => b.timestamp - a.timestamp),
    [records, listDate]
  );

  const handleSubmit = event => {
    event.preventDefault();
    const student = students.find(item => item.id === form.studentId);
    if (!student) return showToast('児童を選択してください', 'error');
    const itemName = form.itemPreset === 'その他' ? form.customItem.trim() : form.itemPreset;
    if (!itemName) return showToast('忘れた物を入力してください', 'error');

    const nextRecord = createForgottenItemEvent({
      student,
      date: form.date,
      itemName,
      subject: form.subject,
      period: form.period,
      impact: form.impact,
      response: form.response,
      note: form.note,
    });
    setRecords(previous => [...(previous || []), nextRecord]);
    setListDate(form.date);
    updateForm({ studentId: '', customItem: '', note: '' });
    showToast(`${student.name} さんの忘れ物を記録しました`);
  };

  const handleDelete = record => {
    if (!window.confirm(`${record.studentName} さんの「${record.itemName}」の記録を削除しますか？`)) return;
    setRecords(previous => previous.filter(item => item.id !== record.id));
    showToast('忘れ物記録を削除しました');
  };

  return (
    <div className="space-y-4 animate-fade-in-up">
      <div className="bg-gradient-to-br from-red-500 to-rose-500 rounded-3xl p-6 text-white shadow-lg shadow-red-100 overflow-hidden relative">
        <div className="absolute -right-8 -bottom-10 opacity-15"><Backpack size={150} /></div>
        <div className="relative z-10 max-w-2xl">
          <span className="inline-flex items-center gap-1.5 text-xs font-bold bg-white/20 px-3 py-1 rounded-full mb-3">
            <ClipboardPlus size={14} /> 授業中に10秒で記録
          </span>
          <h3 className="text-2xl font-bold mb-2">忘れ物・学習準備</h3>
          <p className="text-sm font-bold text-red-50 leading-relaxed">
            責めるためではなく、準備で困る場面と有効だった支援を見つけるための記録です。
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
          <div className="text-xs font-bold text-slate-400 flex items-center gap-1.5"><BarChart3 size={14} /> 直近28日</div>
          <div className="text-3xl font-bold text-slate-800 mt-2">{analytics.total}<span className="text-sm text-slate-400 ml-1">件</span></div>
        </div>
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
          <div className="text-xs font-bold text-slate-400 flex items-center gap-1.5"><Users size={14} /> 困った児童</div>
          <div className="text-3xl font-bold text-slate-800 mt-2">{analytics.affectedStudents}<span className="text-sm text-slate-400 ml-1">名</span></div>
        </div>
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
          <div className="text-xs font-bold text-slate-400 flex items-center gap-1.5"><CheckCircle2 size={14} /> 授業影響なし</div>
          <div className="text-3xl font-bold text-emerald-600 mt-2">{analytics.noLessonImpactRate}<span className="text-sm text-slate-400 ml-1">%</span></div>
        </div>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3">
        <div className="p-2 bg-white text-amber-500 rounded-xl shadow-sm"><Lightbulb size={20} /></div>
        <div>
          <div className="text-xs font-bold text-amber-700 mb-1">支援につなげるヒント</div>
          <p className="text-sm text-amber-900 font-bold leading-relaxed">{insight}</p>
          <p className="text-[11px] text-amber-700/70 mt-1">自動診断ではありません。記録を確認するきっかけとしてお使いください。</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-5">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h4 className="font-bold text-slate-800 flex items-center gap-2"><ClipboardPlus size={19} className="text-red-500" /> かんたん記録</h4>
            <p className="text-xs text-slate-400 font-bold mt-1">必須項目を選んで記録してください</p>
          </div>
          <input
            aria-label="記録日"
            type="date"
            value={form.date}
            onChange={event => updateForm({ date: event.target.value })}
            className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold"
          />
        </div>

        {students.length === 0 ? (
          <div className="border border-dashed border-slate-300 rounded-2xl p-6 text-center text-slate-500 font-bold text-sm">
            先に「名簿管理」で児童を登録してください。
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <label className="space-y-1.5">
                <span className="text-xs font-bold text-slate-500">児童</span>
                <select value={form.studentId} onChange={event => updateForm({ studentId: event.target.value })} className={fieldClass}>
                  <option value="">選択してください</option>
                  {students.map(student => <option key={student.id} value={student.id}>{student.id}. {student.name}</option>)}
                </select>
              </label>
              <label className="space-y-1.5">
                <span className="text-xs font-bold text-slate-500">教科</span>
                <select value={form.subject} onChange={event => updateForm({ subject: event.target.value })} className={fieldClass}>
                  {SUBJECTS.map(subject => <option key={subject}>{subject}</option>)}
                </select>
              </label>
              <label className="space-y-1.5">
                <span className="text-xs font-bold text-slate-500">時限</span>
                <select value={form.period} onChange={event => updateForm({ period: event.target.value })} className={fieldClass}>
                  {['朝', '1', '2', '3', '4', '5', '6', '放課後'].map(period => <option key={period} value={period}>{period === '朝' || period === '放課後' ? period : `${period}時間目`}</option>)}
                </select>
              </label>
            </div>

            <div>
              <span className="text-xs font-bold text-slate-500 block mb-2">忘れた物</span>
              <div className="flex flex-wrap gap-2">
                {ITEM_PRESETS.map(item => (
                  <button key={item} type="button" onClick={() => updateForm({ itemPreset: item })}
                    className={`px-3 py-2 rounded-xl border text-sm font-bold transition-all active:scale-95 ${form.itemPreset === item ? 'bg-red-500 border-red-500 text-white shadow-sm' : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'}`}>
                    {item}
                  </button>
                ))}
              </div>
              {form.itemPreset === 'その他' && (
                <input autoFocus value={form.customItem} onChange={event => updateForm({ customItem: event.target.value })} placeholder="品物を入力" className={`${fieldClass} mt-2`} />
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <label className="space-y-1.5">
                <span className="text-xs font-bold text-slate-500">授業への影響</span>
                <select value={form.impact} onChange={event => updateForm({ impact: event.target.value })} className={fieldClass}>
                  {IMPACTS.map(impact => <option key={impact}>{impact}</option>)}
                </select>
              </label>
              <label className="space-y-1.5">
                <span className="text-xs font-bold text-slate-500">その場の対応</span>
                <select value={form.response} onChange={event => updateForm({ response: event.target.value })} className={fieldClass}>
                  {RESPONSES.map(response => <option key={response}>{response}</option>)}
                </select>
              </label>
            </div>

            <label className="space-y-1.5 block">
              <span className="text-xs font-bold text-slate-500">事実メモ（任意）</span>
              <input value={form.note} onChange={event => updateForm({ note: event.target.value })} placeholder="例：予備を渡すと授業に参加できた" className={fieldClass} />
            </label>

            <button type="submit" className="w-full bg-red-500 hover:bg-red-400 text-white font-bold py-3.5 rounded-xl shadow-md transition-all active:scale-[0.99] flex items-center justify-center gap-2">
              <ClipboardPlus size={19} /> この内容で記録
            </button>
          </>
        )}
      </form>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="p-4 bg-slate-50 border-b border-slate-100 flex items-center justify-between gap-3 flex-wrap">
          <h4 className="font-bold text-slate-700 flex items-center gap-2"><CalendarDays size={18} /> 日別記録</h4>
          <input aria-label="一覧表示日" type="date" value={listDate} onChange={event => setListDate(event.target.value)} className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold" />
        </div>
        {dailyRecords.length === 0 ? (
          <div className="p-10 text-center">
            <CheckCircle2 size={36} className="mx-auto text-emerald-400 mb-3" />
            <p className="font-bold text-slate-600">この日の忘れ物記録はありません</p>
            <p className="text-xs text-slate-400 mt-1">記録がないことも、クラスの大切な状態です。</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {dailyRecords.map(record => (
              <div key={record.id} className="p-4 flex items-start gap-3 hover:bg-slate-50 transition-colors">
                <div className="p-2.5 bg-red-50 text-red-500 rounded-xl"><Backpack size={20} /></div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-slate-800">{record.studentName}</span>
                    <span className="text-xs font-bold bg-slate-100 text-slate-600 px-2 py-1 rounded-lg">{record.itemName}</span>
                    <span className="text-xs text-slate-400 font-bold">{record.subject}・{record.period === '朝' || record.period === '放課後' ? record.period : `${record.period}時間目`}</span>
                  </div>
                  <div className="flex gap-2 flex-wrap mt-2 text-xs font-bold">
                    <span className={record.impact === '影響なし' ? 'text-emerald-600' : 'text-amber-600'}>{record.impact}</span>
                    <span className="text-slate-300">•</span>
                    <span className="text-slate-500">{record.response}</span>
                  </div>
                  {record.note && <p className="text-xs text-slate-500 mt-2 leading-relaxed">{record.note}</p>}
                </div>
                <button type="button" onClick={() => handleDelete(record)} aria-label="記録を削除" className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                  <Trash2 size={17} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
