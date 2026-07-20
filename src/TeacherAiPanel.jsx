import { useMemo, useState } from 'react';
import { Bot, CheckCircle2, Clipboard, Eye, KeyRound, Loader2, LockKeyhole, Send, ServerCog, ShieldCheck, Sparkles, TriangleAlert } from 'lucide-react';
import { createAiActivity } from './dataModel.js';
import { requestTeacherAssistance, validateProxyUrl } from './geminiClient.js';
import {
  AI_TASKS,
  buildClassWeeklyPayload,
  buildFamilyMeetingPayload,
  buildHandoverPayload,
  buildSupportNotePayload,
  findDirectIdentifiers,
  getPayloadByteLength,
  rehydrateAliases,
} from './teacherAiPrivacy.js';
import { getLocalDateString, parseLocalDate } from './taskSchedule.js';

const TASK_OPTIONS = [
  { id: AI_TASKS.CLASS_WEEKLY_SUMMARY, label: '週次サマリー', description: '学級全体の集計から、良い変化と次の一手を整理' },
  { id: AI_TASKS.FAMILY_MEETING_DRAFT, label: '保護者面談', description: '家庭共有用に、事実と支援を責めない言葉で下書き' },
  { id: AI_TASKS.HANDOVER_REWRITE, label: '校内引き継ぎ', description: '今日の校務ブリーフを優先順位順に整文' },
  { id: AI_TASKS.SUPPORT_NOTE_STRUCTURE, label: '支援記録', description: '観察・支援・目標へ分け、評価語を事実へ変換' },
];

const TASK_LABELS = Object.fromEntries(TASK_OPTIONS.map(item => [item.id, item.label]));

const shiftDate = (dateString, days) => {
  const date = parseLocalDate(dateString);
  date.setDate(date.getDate() + days);
  return getLocalDateString(date);
};

const resultAsText = result => {
  if (!result) return '';
  if (result.draft != null) {
    return [result.title, '', result.draft, '', '【根拠】', ...(result.evidence_used || []).map(item => `・${item}`), '', '【確認事項】', ...(result.cautions || []).map(item => `・${item}`), '', '【次の行動案】', ...(result.suggested_next_steps || []).map(item => `・${item}`)].join('\n').trim();
  }
  return [`分類：${result.category}`, `観察：${result.observation}`, `支援：${result.action}`, `目標：${result.goal}`, '', '【不足している情報】', ...(result.missing_information || []).map(item => `・${item}`), '', '【確認事項】', ...(result.cautions || []).map(item => `・${item}`)].join('\n').trim();
};

const AuditList = ({ items }) => (
  <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
    <h3 className="font-bold text-slate-800 flex items-center gap-2"><ShieldCheck size={18} className="text-emerald-600" /> AI利用履歴（内容は保存しません）</h3>
    <p className="text-xs text-slate-500 mt-1">日時・機能・成否・モデル・参照件数だけをバックアップ対象として記録します。</p>
    <div className="mt-3 divide-y divide-slate-100">
      {(items || []).slice().sort((a, b) => b.createdAt - a.createdAt).slice(0, 10).map(item => (
        <div key={item.id} className="py-2.5 flex items-center justify-between gap-3 text-xs">
          <div><span className="font-bold text-slate-700">{TASK_LABELS[item.task] || item.task}</span><span className="text-slate-400 ml-2">{new Date(item.createdAt).toLocaleString('ja-JP')}</span></div>
          <span className={`font-bold px-2 py-1 rounded-full ${item.status === 'failed' ? 'bg-red-50 text-red-600' : item.status === 'copied' ? 'bg-blue-50 text-blue-600' : 'bg-emerald-50 text-emerald-700'}`}>{item.status === 'generated' ? '生成' : item.status === 'copied' ? 'コピー' : '失敗'}</span>
        </div>
      ))}
      {(items || []).length === 0 && <p className="py-4 text-sm text-slate-400">まだ利用履歴はありません。</p>}
    </div>
  </div>
);

export default function TeacherAiPanel({ db, ai, showToast, today }) {
  const [task, setTask] = useState(AI_TASKS.CLASS_WEEKLY_SUMMARY);
  const [studentId, setStudentId] = useState(db.students[0]?.id || '');
  const [startDate, setStartDate] = useState(shiftDate(today, -29));
  const [endDate, setEndDate] = useState(today);
  const [supportNote, setSupportNote] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [proxyInput, setProxyInput] = useState(ai.proxyUrl || '');
  const [tokenInput, setTokenInput] = useState(ai.gatewayToken || '');

  const payloadInfo = useMemo(() => {
    try {
      if (startDate > endDate) throw new Error('開始日は終了日以前にしてください');
      if (task === AI_TASKS.CLASS_WEEKLY_SUMMARY) return { ...buildClassWeeklyPayload({ today, db }), error: '' };
      if (task === AI_TASKS.FAMILY_MEETING_DRAFT) return { ...buildFamilyMeetingPayload({ studentId, startDate, endDate, db }), error: '' };
      if (task === AI_TASKS.HANDOVER_REWRITE) return { ...buildHandoverPayload({ today, db }), error: '' };
      return { ...buildSupportNotePayload({ note: supportNote, students: db.students }), error: '' };
    } catch (error) {
      return { payload: null, reverseAliases: {}, sourceRecordCount: 0, error: error.message };
    }
  }, [task, today, db, studentId, startDate, endDate, supportNote]);

  const identifiers = payloadInfo.payload ? findDirectIdentifiers(payloadInfo.payload, db.students) : [];
  const payloadBytes = payloadInfo.payload ? getPayloadByteLength(payloadInfo.payload) : 0;
  const configured = validateProxyUrl(ai.proxyUrl) && Boolean(ai.gatewayToken);

  const changeTask = next => {
    setTask(next);
    setConfirmed(false);
    setResult(null);
  };

  const saveSettings = () => {
    if (!validateProxyUrl(proxyInput)) return showToast('AIプロキシURLはHTTPSで入力してください（localhostのみHTTP可）', 'error');
    if (tokenInput.trim().length < 24) return showToast('ゲートウェイトークンは24文字以上にしてください', 'error');
    ai.setProxyUrl(proxyInput.trim().replace(/\/$/, ''));
    ai.setGatewayToken(tokenInput.trim());
    showToast('AI接続設定をこの端末に保存しました');
  };

  const addAudit = (status, model = '') => db.setAiActivity(previous => [...(previous || []), createAiActivity({
    task,
    status,
    model,
    sourceRecordCount: payloadInfo.sourceRecordCount,
  })].slice(-200));

  const generate = async () => {
    if (!configured) return showToast('先にAIプロキシを設定してください', 'error');
    if (!payloadInfo.payload || payloadInfo.error) return showToast(payloadInfo.error || '送信内容を作成できません', 'error');
    if (identifiers.length) return showToast('送信内容に直接識別情報が残っています。生成を中止しました', 'error');
    if (!confirmed) return showToast('送信内容を確認し、確認欄にチェックしてください', 'error');
    setLoading(true);
    setResult(null);
    try {
      const response = await requestTeacherAssistance({
        proxyUrl: ai.proxyUrl,
        gatewayToken: ai.gatewayToken,
        task,
        payload: payloadInfo.payload,
      });
      setResult(rehydrateAliases(response.result, payloadInfo.reverseAliases));
      addAudit('generated', response.model);
      showToast('AI下書きを作成しました。内容と根拠を確認してください');
    } catch (error) {
      addAudit('failed');
      showToast(error?.message || 'AI下書きを作成できませんでした', 'error');
    } finally {
      setLoading(false);
    }
  };

  const copyResult = async () => {
    try {
      await navigator.clipboard.writeText(resultAsText(result));
      addAudit('copied', '');
      showToast('確認用の下書きをコピーしました');
    } catch {
      showToast('クリップボードへコピーできませんでした', 'error');
    }
  };

  return (
    <div className="space-y-4 animate-fade-in-up max-w-6xl mx-auto">
      <div className="bg-gradient-to-br from-violet-700 via-indigo-700 to-blue-700 text-white rounded-3xl p-6 shadow-lg overflow-hidden relative">
        <Sparkles className="absolute -right-5 -top-5 text-white/10" size={150} />
        <div className="relative">
          <div className="inline-flex items-center gap-2 bg-white/15 px-3 py-1.5 rounded-full text-xs font-bold mb-3"><Bot size={15} /> Gemini 教師支援</div>
          <h2 className="text-2xl font-bold">判断は先生に。整理と下書きはAIに。</h2>
          <p className="text-sm text-indigo-100 mt-2 max-w-3xl leading-relaxed">送信前に情報を最小化・匿名化し、送るJSONをその場で確認できます。AIは診断や自動決定を行わず、生成物は保存・送信されない編集前提の下書きです。</p>
        </div>
      </div>

      {!configured && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex gap-3 text-amber-900">
          <TriangleAlert size={21} className="shrink-0 mt-0.5" />
          <div><p className="font-bold">安全なバックエンド接続が必要です</p><p className="text-xs mt-1 leading-relaxed">Gemini APIキーをこの画面へ入力しないでください。`server/gemini-proxy` をCloud Run等へ配置し、そのURLとゲートウェイトークンを設定します。</p></div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_0.8fr] gap-4">
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {TASK_OPTIONS.map(option => (
                <button key={option.id} type="button" onClick={() => changeTask(option.id)} className={`p-3 rounded-xl text-left border transition-all ${task === option.id ? 'bg-indigo-600 border-indigo-600 text-white shadow-md' : 'bg-slate-50 border-slate-200 text-slate-700 hover:border-indigo-300'}`}>
                  <span className="block font-bold text-sm">{option.label}</span><span className={`block text-[11px] leading-relaxed mt-1 ${task === option.id ? 'text-indigo-100' : 'text-slate-500'}`}>{option.description}</span>
                </button>
              ))}
            </div>

            {task === AI_TASKS.FAMILY_MEETING_DRAFT && (
              <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
                <label className="text-xs font-bold text-slate-600">対象児童<select value={studentId} onChange={event => { setStudentId(event.target.value); setConfirmed(false); }} className="mt-1 w-full border border-slate-200 rounded-xl p-2.5 bg-white text-sm">{db.students.map(student => <option key={student.id} value={student.id}>{student.name}</option>)}</select></label>
                <label className="text-xs font-bold text-slate-600">開始日<input type="date" value={startDate} onChange={event => { setStartDate(event.target.value); setConfirmed(false); }} className="mt-1 w-full border border-slate-200 rounded-xl p-2.5 bg-white text-sm" /></label>
                <label className="text-xs font-bold text-slate-600">終了日<input type="date" value={endDate} onChange={event => { setEndDate(event.target.value); setConfirmed(false); }} className="mt-1 w-full border border-slate-200 rounded-xl p-2.5 bg-white text-sm" /></label>
              </div>
            )}
            {task === AI_TASKS.SUPPORT_NOTE_STRUCTURE && (
              <label className="block mt-4 text-xs font-bold text-slate-600">教師の観察メモ<textarea value={supportNote} onChange={event => { setSupportNote(event.target.value); setConfirmed(false); }} rows={5} placeholder="例：算数の個別練習で、最初の2問は手が止まっていた。見本を一緒に確認した後は…" className="mt-1 w-full border border-slate-200 rounded-xl p-3 bg-white text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-indigo-300" /></label>
            )}
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-bold text-slate-800 flex items-center gap-2"><Eye size={18} className="text-indigo-600" /> Geminiへ送る内容</h3>
              <div className="flex gap-2 text-[11px] font-bold"><span className={`px-2 py-1 rounded-full ${identifiers.length ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'}`}>{identifiers.length ? '識別情報を検出・送信停止' : '実名なし'}</span><span className="bg-slate-100 text-slate-600 px-2 py-1 rounded-full">{(payloadBytes / 1024).toFixed(1)} KB</span><span className="bg-blue-50 text-blue-700 px-2 py-1 rounded-full">参照 {payloadInfo.sourceRecordCount}件</span></div>
            </div>
            {payloadInfo.error ? <p className="p-5 text-sm font-bold text-amber-700 bg-amber-50">{payloadInfo.error}</p> : (
              <pre className="p-4 bg-slate-950 text-slate-200 text-xs leading-relaxed overflow-auto max-h-80 whitespace-pre-wrap break-all">{JSON.stringify(payloadInfo.payload, null, 2)}</pre>
            )}
            <div className="p-4 bg-slate-50 border-t border-slate-100 space-y-3">
              <label className="flex items-start gap-3 cursor-pointer"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} className="mt-1 accent-indigo-600" /><span className="text-sm font-bold text-slate-700">上記の送信内容に、不要な個人情報がないことを確認しました<span className="block text-xs font-normal text-slate-500 mt-1">生成結果は必ず根拠と照合し、教師が編集してから利用します。</span></span></label>
              <button type="button" onClick={generate} disabled={loading || !payloadInfo.payload || identifiers.length > 0} className="w-full bg-indigo-600 disabled:bg-slate-300 text-white font-bold py-3.5 rounded-xl shadow-sm hover:bg-indigo-700 transition-all flex items-center justify-center gap-2">{loading ? <><Loader2 size={18} className="animate-spin" /> Geminiが整理しています</> : <><Send size={18} /> 確認した内容で下書きを作成</>}</button>
            </div>
          </div>

          {result && (
            <div className="bg-white rounded-2xl border-2 border-indigo-200 shadow-sm overflow-hidden">
              <div className="p-4 bg-indigo-50 flex items-center justify-between gap-3"><h3 className="font-bold text-indigo-900 flex items-center gap-2"><CheckCircle2 size={19} /> AI下書き（未承認）</h3><button type="button" onClick={copyResult} className="bg-white border border-indigo-200 text-indigo-700 rounded-xl px-3 py-2 text-xs font-bold flex items-center gap-2 hover:bg-indigo-100"><Clipboard size={15} /> コピー</button></div>
              <div className="p-4 space-y-4">
                {result.draft != null ? (
                  <>
                    <label className="block text-xs font-bold text-slate-600">見出し<input value={result.title} onChange={event => setResult(previous => ({ ...previous, title: event.target.value }))} className="mt-1 w-full border border-slate-200 rounded-xl p-3 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-indigo-300" /></label>
                    <label className="block text-xs font-bold text-slate-600">本文<textarea value={result.draft} onChange={event => setResult(previous => ({ ...previous, draft: event.target.value }))} rows={10} className="mt-1 w-full border border-slate-200 rounded-xl p-4 text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-indigo-300" /></label>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                      {[['根拠', result.evidence_used], ['確認事項', result.cautions], ['次の行動案', result.suggested_next_steps]].map(([label, items]) => (
                        <div key={label} className="bg-slate-50 border border-slate-100 rounded-xl p-3"><p className="font-bold text-slate-700 mb-2">{label}</p>{items.length ? <ul className="space-y-1 text-slate-600">{items.map((item, index) => <li key={`${label}-${index}`}>・{item}</li>)}</ul> : <p className="text-slate-400">なし</p>}</div>
                      ))}
                    </div>
                  </>
                ) : (
                  <>
                    <label className="block text-xs font-bold text-slate-600">分類<select value={result.category} onChange={event => setResult(previous => ({ ...previous, category: event.target.value }))} className="mt-1 w-full border border-slate-200 rounded-xl p-3 text-sm bg-white">{['学習準備', '学習', '生活・体調', '友人関係', 'その他'].map(item => <option key={item}>{item}</option>)}</select></label>
                    {[['observation', '観察した事実'], ['action', '支援'], ['goal', '確認できる目標']].map(([key, label]) => <label key={key} className="block text-xs font-bold text-slate-600">{label}<textarea value={result[key]} onChange={event => setResult(previous => ({ ...previous, [key]: event.target.value }))} rows={3} className="mt-1 w-full border border-slate-200 rounded-xl p-3 text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-indigo-300" /></label>)}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">{[['不足している情報', result.missing_information], ['確認事項', result.cautions]].map(([label, items]) => <div key={label} className="bg-slate-50 border border-slate-100 rounded-xl p-3"><p className="font-bold text-slate-700 mb-2">{label}</p>{items.length ? <ul className="space-y-1 text-slate-600">{items.map((item, index) => <li key={`${label}-${index}`}>・{item}</li>)}</ul> : <p className="text-slate-400">なし</p>}</div>)}</div>
                  </>
                )}
              </div>
              <p className="px-4 pb-4 text-xs text-amber-700 font-bold">AIは誤る可能性があります。原記録との照合、表現の妥当性、共有範囲を先生が確認してください。医学的・心理的な診断には使用できません。</p>
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
            <h3 className="font-bold text-slate-800 flex items-center gap-2"><ServerCog size={18} className="text-indigo-600" /> 安全な接続設定</h3>
            <p className="text-xs text-slate-500 mt-1 leading-relaxed">この設定は端末だけに保存され、データバックアップ・Google Drive同期には含まれません。</p>
            <label className="block mt-4 text-xs font-bold text-slate-600">プロキシURL<div className="relative mt-1"><ServerCog size={16} className="absolute left-3 top-3 text-slate-400" /><input type="url" value={proxyInput} onChange={event => setProxyInput(event.target.value)} placeholder="https://...run.app" className="w-full border border-slate-200 rounded-xl py-2.5 pl-9 pr-3 text-sm" /></div></label>
            <label className="block mt-3 text-xs font-bold text-slate-600">ゲートウェイトークン<div className="relative mt-1"><KeyRound size={16} className="absolute left-3 top-3 text-slate-400" /><input type="password" value={tokenInput} onChange={event => setTokenInput(event.target.value)} autoComplete="off" placeholder="24文字以上" className="w-full border border-slate-200 rounded-xl py-2.5 pl-9 pr-3 text-sm font-mono" /></div></label>
            <button type="button" onClick={saveSettings} className="mt-4 w-full bg-slate-800 text-white font-bold py-3 rounded-xl hover:bg-slate-700 flex items-center justify-center gap-2"><LockKeyhole size={17} /> この端末に保存</button>
            <div className={`mt-3 rounded-xl p-3 text-xs font-bold flex gap-2 ${configured ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-50 text-slate-500'}`}><ShieldCheck size={16} /> {configured ? 'プロキシ設定済み（Gemini APIキーは端末にありません）' : '未設定'}</div>
            {configured && <button type="button" onClick={() => { ai.setProxyUrl(''); ai.setGatewayToken(''); setProxyInput(''); setTokenInput(''); setResult(null); showToast('AI接続設定をこの端末から削除しました'); }} className="mt-3 w-full text-xs font-bold text-slate-400 hover:text-red-600 underline">この端末のAI接続設定を削除</button>}
          </div>
          <AuditList items={db.aiActivity} />
        </div>
      </div>
    </div>
  );
}
