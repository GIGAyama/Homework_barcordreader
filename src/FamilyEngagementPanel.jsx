import React, { useEffect, useMemo, useState } from 'react';
import {
  CalendarCheck,
  CheckCircle2,
  Clock3,
  FileText,
  Handshake,
  MessageSquare,
  Phone,
  Plus,
  ShieldAlert,
  Sparkles,
  Trash2,
  UserRoundSearch,
  Users,
} from 'lucide-react';
import { createFamilyContact, recordFamilyContactFollowUp } from './dataModel';
import { shiftDate } from './studentInsights';

const getLocalDateString = (date = new Date()) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const CHANNELS = ['電話', '面談', '連絡帳', 'メール', 'その他'];
const TOPICS = ['学習', '学習準備', '生活・体調', '友人関係', '出欠', '学校行事', 'その他'];
const fieldClass = 'w-full bg-white border border-slate-200 rounded-xl px-3 py-3 text-sm font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-blue-300 transition-all';

const formatDate = dateString => {
  if (!dateString) return '未設定';
  const [year, month, day] = dateString.split('-').map(Number);
  return new Intl.DateTimeFormat('ja-JP', { month: 'numeric', day: 'numeric', weekday: 'short' })
    .format(new Date(year, month - 1, day));
};

export default function FamilyEngagementPanel({ db, showToast }) {
  const today = useMemo(() => getLocalDateString(), []);
  const [selectedStudentId, setSelectedStudentId] = useState(db.students[0]?.id || '');
  const [outcomeDrafts, setOutcomeDrafts] = useState({});
  const [form, setForm] = useState({
    date: today,
    channel: '電話',
    topic: '学習',
    sharedFacts: '',
    familyResponse: '',
    agreement: '',
    followUpDate: shiftDate(today, 14),
    staffName: '',
  });

  useEffect(() => {
    if (!selectedStudentId && db.students[0]) setSelectedStudentId(db.students[0].id);
    if (selectedStudentId && !db.students.some(student => student.id === selectedStudentId)) {
      setSelectedStudentId(db.students[0]?.id || '');
    }
  }, [db.students, selectedStudentId]);

  const selectedStudent = db.students.find(student => student.id === selectedStudentId) || null;
  const contacts = db.familyContacts || [];
  const dueContacts = useMemo(() => contacts
    .filter(item => item.status !== '完了' && item.followUpDate && item.followUpDate <= today)
    .sort((a, b) => a.followUpDate.localeCompare(b.followUpDate)), [contacts, today]);
  const selectedContacts = useMemo(() => contacts
    .filter(item => item.studentId === selectedStudentId)
    .sort((a, b) => b.date.localeCompare(a.date) || Number(b.createdAt || 0) - Number(a.createdAt || 0)), [contacts, selectedStudentId]);
  const recentStart = useMemo(() => shiftDate(today, -89), [today]);
  const recentContacts = selectedContacts.filter(item => item.date >= recentStart && item.date <= today);
  const pendingContacts = selectedContacts.filter(item => item.status !== '完了');
  const channelCount = new Set(recentContacts.map(item => item.channel)).size;

  const updateForm = patch => setForm(previous => ({ ...previous, ...patch }));

  const saveContact = event => {
    event.preventDefault();
    if (!selectedStudent) return showToast('児童を選択してください', 'error');
    if (!form.sharedFacts.trim() || !form.agreement.trim()) {
      return showToast('共有した事実と合意した対応を入力してください', 'error');
    }
    const contact = createFamilyContact({ student: selectedStudent, ...form });
    db.setFamilyContacts(previous => [...previous, contact]);
    updateForm({
      sharedFacts: '',
      familyResponse: '',
      agreement: '',
      followUpDate: shiftDate(today, 14),
    });
    showToast(`${selectedStudent.name} さんの家庭連携を記録しました`);
  };

  const updateDraft = (id, patch) => setOutcomeDrafts(previous => ({
    ...previous,
    [id]: {
      followUpNote: '', status: '完了', followUpDate: shiftDate(today, 14),
      ...(previous[id] || {}), ...patch,
    },
  }));

  const saveFollowUp = contact => {
    const draft = {
      followUpNote: '', status: '完了', followUpDate: shiftDate(today, 14),
      ...(outcomeDrafts[contact.id] || {}),
    };
    if (!draft.followUpNote.trim()) return showToast('確認した内容を入力してください', 'error');
    if (draft.status !== '完了' && !draft.followUpDate) return showToast('次回確認日を設定してください', 'error');
    db.setFamilyContacts(previous => recordFamilyContactFollowUp(previous, contact.id, draft));
    setOutcomeDrafts(previous => {
      const next = { ...previous };
      delete next[contact.id];
      return next;
    });
    showToast('家庭連携のフォローアップを保存しました');
  };

  const deleteContact = contact => {
    if (!window.confirm(`${contact.studentName} さんの家庭連携記録を削除しますか？`)) return;
    db.setFamilyContacts(previous => previous.filter(item => item.id !== contact.id));
    showToast('家庭連携記録を削除しました');
  };

  if (db.students.length === 0) {
    return <div className="bg-white border border-dashed border-slate-300 rounded-3xl p-12 text-center"><Users size={44} className="mx-auto text-slate-300 mb-3" /><h3 className="font-bold text-slate-700">家庭連携を始める準備</h3><p className="text-sm text-slate-400 mt-2">先に名簿管理で児童を登録してください。</p></div>;
  }

  return (
    <div className="space-y-4 animate-fade-in-up">
      <div className="bg-gradient-to-br from-blue-700 via-blue-600 to-cyan-500 rounded-3xl p-6 text-white shadow-lg shadow-blue-100 relative overflow-hidden">
        <MessageSquare size={170} className="absolute -right-8 -bottom-12 opacity-10" />
        <div className="relative z-10 max-w-3xl">
          <span className="inline-flex items-center gap-1.5 text-xs font-bold bg-white/20 px-3 py-1 rounded-full mb-3"><Sparkles size={14} /> 家庭との合意を次の支援へ</span>
          <h3 className="text-2xl font-bold">家庭連携CRM</h3>
          <p className="text-sm font-bold text-blue-50 mt-2 leading-relaxed">連絡した事実、家庭から聞いた内容、合意した対応、次回確認を分けて記録し、対応漏れを防ぎます。</p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[310px_minmax(0,1fr)] gap-4 items-start">
        <aside className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden xl:sticky xl:top-2">
          <div className="p-4 bg-slate-50 border-b border-slate-100">
            <h4 className="font-bold text-slate-700 flex items-center gap-2"><CalendarCheck size={18} className="text-blue-500" /> 今日の家庭フォロー</h4>
            <p className="text-xs text-slate-400 mt-1">確認予定日を迎えた記録</p>
          </div>
          {dueContacts.length === 0 ? (
            <div className="p-8 text-center"><CheckCircle2 size={31} className="mx-auto text-emerald-400 mb-2" /><p className="text-sm font-bold text-slate-600">期限を迎えた連絡はありません</p></div>
          ) : (
            <div className="divide-y divide-slate-100 max-h-[480px] overflow-y-auto">
              {dueContacts.map(contact => (
                <button key={contact.id} type="button" onClick={() => setSelectedStudentId(contact.studentId)} className="w-full p-4 text-left hover:bg-blue-50 transition-colors">
                  <div className="flex items-center justify-between gap-2"><span className="font-bold text-sm text-slate-800">{contact.studentName}</span><span className={`text-[10px] font-bold px-2 py-1 rounded-full ${contact.followUpDate < today ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-700'}`}>{contact.followUpDate < today ? '期限超過' : '本日'}</span></div>
                  <p className="text-xs font-bold text-blue-700 mt-2">{contact.topic}・{contact.channel}</p>
                  <p className="text-[11px] text-slate-400 mt-1">確認予定 {formatDate(contact.followUpDate)}</p>
                </button>
              ))}
            </div>
          )}
          <div className="p-3 bg-amber-50 border-t border-amber-100 text-[10px] text-amber-800 leading-relaxed flex gap-2"><ShieldAlert size={14} className="shrink-0" /> 家庭から聞いた内容は校内限定です。保護者配布レポートには自動掲載されません。</div>
        </aside>

        <main className="space-y-4 min-w-0">
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div><span className="text-xs font-bold text-blue-500">SELECTED STUDENT</span><h4 className="text-xl font-bold text-slate-800 mt-1">{selectedStudent?.name} さん</h4></div>
            <select value={selectedStudentId} onChange={event => setSelectedStudentId(event.target.value)} className={`${fieldClass} md:w-64`}>{db.students.map(student => <option key={student.id} value={student.id}>{student.id}. {student.name}</option>)}</select>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="bg-white rounded-2xl border border-slate-100 p-4 shadow-sm"><span className="text-xs font-bold text-slate-400">直近90日の連携</span><p className="text-3xl font-bold text-slate-800 mt-2">{recentContacts.length}<span className="text-xs text-slate-400 ml-1">件</span></p></div>
            <div className="bg-white rounded-2xl border border-slate-100 p-4 shadow-sm"><span className="text-xs font-bold text-slate-400">連絡手段</span><p className="text-3xl font-bold text-slate-800 mt-2">{channelCount}<span className="text-xs text-slate-400 ml-1">種類</span></p></div>
            <div className="bg-white rounded-2xl border border-slate-100 p-4 shadow-sm"><span className="text-xs font-bold text-slate-400">要フォロー</span><p className={`text-3xl font-bold mt-2 ${pendingContacts.length ? 'text-amber-600' : 'text-slate-800'}`}>{pendingContacts.length}<span className="text-xs text-slate-400 ml-1">件</span></p></div>
          </div>

          <form onSubmit={saveContact} className="bg-white rounded-2xl border border-blue-100 shadow-sm p-5 space-y-5">
            <div><h5 className="font-bold text-slate-800 flex items-center gap-2"><Phone size={18} className="text-blue-500" /> 家庭とのやり取りを記録</h5><p className="text-xs text-slate-400 mt-1">評価ではなく、共有した事実と合意事項を具体的に残します。</p></div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <label className="space-y-1.5"><span className="text-xs font-bold text-slate-500">連絡日</span><input type="date" value={form.date} onChange={event => updateForm({ date: event.target.value })} className={fieldClass} /></label>
              <label className="space-y-1.5"><span className="text-xs font-bold text-slate-500">連絡手段</span><select value={form.channel} onChange={event => updateForm({ channel: event.target.value })} className={fieldClass}>{CHANNELS.map(channel => <option key={channel}>{channel}</option>)}</select></label>
              <label className="space-y-1.5"><span className="text-xs font-bold text-slate-500">話題</span><select value={form.topic} onChange={event => updateForm({ topic: event.target.value })} className={fieldClass}>{TOPICS.map(topic => <option key={topic}>{topic}</option>)}</select></label>
            </div>
            <label className="space-y-1.5 block"><span className="text-xs font-bold text-slate-500">学校から共有した事実</span><textarea rows="3" value={form.sharedFacts} onChange={event => updateForm({ sharedFacts: event.target.value })} placeholder="例：直近2週間で、算数の用具を3回忘れた記録があります" className={fieldClass} /></label>
            <label className="space-y-1.5 block"><span className="text-xs font-bold text-amber-700 flex items-center gap-1"><ShieldAlert size={13} /> 家庭から聞いたこと（校内限定）</span><textarea rows="3" value={form.familyResponse} onChange={event => updateForm({ familyResponse: event.target.value })} placeholder="家庭での様子や保護者の意向を、必要な範囲で記録" className={`${fieldClass} bg-amber-50/40`} /></label>
            <label className="space-y-1.5 block"><span className="text-xs font-bold text-slate-500">学校・家庭で合意した対応</span><textarea rows="3" value={form.agreement} onChange={event => updateForm({ agreement: event.target.value })} placeholder="例：同じ持ち物チェック表を使い、2週間後に変化を確認する" className={fieldClass} /></label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <label className="space-y-1.5"><span className="text-xs font-bold text-slate-500">次回確認日（空欄なら完了）</span><input type="date" value={form.followUpDate} onChange={event => updateForm({ followUpDate: event.target.value })} className={fieldClass} /></label>
              <label className="space-y-1.5"><span className="text-xs font-bold text-slate-500">対応者</span><input value={form.staffName} onChange={event => updateForm({ staffName: event.target.value })} placeholder="例：担任、養護教諭" className={fieldClass} /></label>
            </div>
            <button type="submit" className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3.5 rounded-xl shadow-md transition-all active:scale-[0.99] flex items-center justify-center gap-2"><Plus size={18} /> 家庭連携を記録</button>
          </form>

          <section className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="p-4 bg-slate-50 border-b border-slate-100"><h5 className="font-bold text-slate-700 flex items-center gap-2"><FileText size={18} /> 連携履歴</h5></div>
            {selectedContacts.length === 0 ? <div className="p-10 text-center text-sm font-bold text-slate-400">家庭連携の記録はまだありません</div> : (
              <div className="divide-y divide-slate-100">{selectedContacts.map(contact => {
                const draft = { followUpNote: '', status: '完了', followUpDate: shiftDate(today, 14), ...(outcomeDrafts[contact.id] || {}) };
                return (
                  <article key={contact.id} className="p-5">
                    <div className="flex items-start justify-between gap-3"><div className="flex flex-wrap gap-2"><span className="text-xs font-bold bg-blue-50 text-blue-700 px-2 py-1 rounded-full">{contact.channel}</span><span className="text-xs font-bold bg-slate-100 text-slate-600 px-2 py-1 rounded-full">{contact.topic}</span><span className={`text-xs font-bold px-2 py-1 rounded-full ${contact.status === '完了' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>{contact.status}</span></div><button type="button" onClick={() => deleteContact(contact)} aria-label="家庭連携記録を削除" className="p-2 text-slate-300 hover:text-red-500"><Trash2 size={16} /></button></div>
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 mt-4 text-xs">
                      <div className="bg-slate-50 rounded-xl p-3"><span className="font-bold text-slate-400">学校から共有</span><p className="font-bold text-slate-700 mt-1 leading-relaxed">{contact.sharedFacts}</p></div>
                      <div className="bg-amber-50 rounded-xl p-3"><span className="font-bold text-amber-700 flex items-center gap-1"><ShieldAlert size={12} /> 家庭から（校内限定）</span><p className="text-amber-900 mt-1 leading-relaxed">{contact.familyResponse || '記録なし'}</p></div>
                      <div className="bg-blue-50 rounded-xl p-3"><span className="font-bold text-blue-500">合意した対応</span><p className="font-bold text-blue-900 mt-1 leading-relaxed">{contact.agreement}</p></div>
                    </div>
                    <div className="flex flex-wrap gap-3 mt-3 text-xs text-slate-400 font-bold"><span>{formatDate(contact.date)}・{contact.staffName || '対応者未記入'}</span>{contact.followUpDate && <span className="flex items-center gap-1"><Clock3 size={13} /> {formatDate(contact.followUpDate)}確認</span>}</div>
                    {contact.followUpNote && <div className="mt-3 bg-emerald-50 border border-emerald-100 rounded-xl p-3 text-xs"><span className="font-bold text-emerald-700">フォロー結果</span><p className="text-emerald-900 mt-1">{contact.followUpNote}</p></div>}
                    {contact.status !== '完了' && (
                      <div className="mt-4 bg-slate-50 border border-slate-100 rounded-xl p-4">
                        <div className="font-bold text-sm text-slate-700 flex items-center gap-2 mb-3"><Handshake size={17} className="text-blue-500" /> 次回確認を記録</div>
                        <div className="grid grid-cols-1 lg:grid-cols-[1fr_130px_170px] gap-2"><input value={draft.followUpNote} onChange={event => updateDraft(contact.id, { followUpNote: event.target.value })} placeholder="確認した変化や追加の合意" className={fieldClass} /><select value={draft.status} onChange={event => updateDraft(contact.id, { status: event.target.value })} className={fieldClass}><option>完了</option><option>要フォロー</option></select>{draft.status !== '完了' ? <input type="date" value={draft.followUpDate} onChange={event => updateDraft(contact.id, { followUpDate: event.target.value })} className={fieldClass} /> : <div className="bg-emerald-50 text-emerald-700 rounded-xl px-3 py-3 text-xs font-bold flex items-center justify-center">対応を完了</div>}</div>
                        <button type="button" onClick={() => saveFollowUp(contact)} className="w-full lg:w-auto bg-slate-900 hover:bg-slate-800 text-white text-sm font-bold px-5 py-2.5 rounded-xl mt-3">フォロー結果を保存</button>
                      </div>
                    )}
                  </article>
                );
              })}</div>
            )}
          </section>
        </main>
      </div>
    </div>
  );
}
