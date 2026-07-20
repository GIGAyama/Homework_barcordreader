import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Mailbox, Settings, Trash2, CheckCircle2, Circle, X, Users, Activity, Plus, Check, HeartPulse, ShieldAlert, Printer, FileText, Smile, Moon, Zap, CloudRain, PartyPopper, Sparkles, GraduationCap, ClipboardList, CalendarRange, Database, Download, Upload, AlertTriangle, RefreshCw, Pencil, Save, UserCheck, UserX, Clock, PlusCircle, MinusCircle, CalendarOff, Archive, ArchiveRestore, Cloud, CloudUpload, CloudDownload, Link2, Unlink, Loader2, KeyRound, ExternalLink, Backpack, HandHeart, MessageSquare } from 'lucide-react';
import { useGoogleDriveSync } from './useGoogleDriveSync';
import ForgottenItemsPanel from './ForgottenItemsPanel';
import StudentSupportPanel from './StudentSupportPanel';
import ClassInsightsPanel from './ClassInsightsPanel';
import FamilyEngagementPanel from './FamilyEngagementPanel';
import { buildStudentReportInsights } from './reportInsights';
import { shiftDate } from './studentInsights';
import {
  DATA_SCHEMA_VERSION,
  buildBackupData,
  createDailyCheckIn,
  createSubmissionEvent,
  isValidBackupData,
  migrateData,
  submissionMatchesTask,
  upsertDailyCheckIn,
} from './dataModel';

// ==========================================
// 🎨 グローバルスタイル設定 (CSS)
// ==========================================
const GlobalStyles = () => (
  <style>{`
    body {
      font-family: 'Zen Maru Gothic', sans-serif;
      -webkit-tap-highlight-color: transparent; 
      background-color: #fef2f2; /* tailwind red-50 */
    }
    .bg-premium-pattern {
      background-image: radial-gradient(#fecaca 1px, transparent 1px);
      background-size: 20px 20px;
    }
    /* 商用レベルの滑らかなアニメーション */
    @keyframes fadeInUp {
      from { opacity: 0; transform: translateY(10px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .animate-fade-in-up {
      animation: fadeInUp 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards;
    }
    @keyframes float {
      0%, 100% { transform: translateY(0); }
      50% { transform: translateY(-10px); }
    }
    .animate-float { animation: float 3s ease-in-out infinite; }
    
    /* スクロールバーの美化 */
    ::-webkit-scrollbar { width: 8px; height: 8px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 9999px; border: 2px solid transparent; background-clip: content-box; }
    ::-webkit-scrollbar-thumb:hover { background-color: #94a3b8; }

    /* 🖨️ 印刷用の特別スタイル */
    @media print {
      @page { size: A4 portrait; margin: 0; }
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; background-color: white !important; }
      .no-print { display: none !important; }
      .only-print { display: block !important; }
      .print-page { 
        width: 210mm; 
        min-height: 297mm; 
        padding: 20mm; 
        box-sizing: border-box; 
        page-break-after: always; 
        background: white;
        margin: 0;
      }
    }
  `}</style>
);

// ==========================================
// 🌟 統一設定 & ヘルパー関数
// ==========================================
const FEELING_CONFIG = {
  'げんき': { icon: Smile, colorClass: 'text-orange-500', bgClass: 'bg-orange-50 border-orange-200', hoverClass: 'hover:bg-orange-100' },
  'ねむい': { icon: Moon, colorClass: 'text-cyan-500', bgClass: 'bg-cyan-50 border-cyan-200', hoverClass: 'hover:bg-cyan-100' },
  'イライラ': { icon: Zap, colorClass: 'text-rose-500', bgClass: 'bg-rose-50 border-rose-200', hoverClass: 'hover:bg-rose-100' },
  'かなしい': { icon: CloudRain, colorClass: 'text-indigo-500', bgClass: 'bg-indigo-50 border-indigo-200', hoverClass: 'hover:bg-indigo-100' }
};

// ⚠️ 【重要】UTC依存のバグを防ぐ、確実なローカル日付(YYYY-MM-DD)取得関数
const getLocalDateString = (d = new Date()) => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const DAY_NAMES = ['日', '月', '火', '水', '木', '金', '土'];

// ⚠️ new Date('YYYY-MM-DD') はUTC深夜として解釈され日付がずれる環境があるため、必ずローカル時刻で組み立てる
const parseLocalDate = (str) => {
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
};

// 指定日を含む週の月曜〜日曜を YYYY-MM-DD で返す
const getWeekRangeStrs = (dateStr) => {
  const d = parseLocalDate(dateStr);
  const day = d.getDay();
  const mon = new Date(d);
  mon.setDate(d.getDate() - day + (day === 0 ? -6 : 1));
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);
  return [getLocalDateString(mon), getLocalDateString(sun)];
};

// 📌 課題ルールが指定日に「提出対象」かどうかの一元判定
//   - おやすみ日（excludeDates）に登録された日は対象外
//   - 削除（アーカイブ）された課題は、削除日以降は対象外（過去の記録・集計は保持）
const isTaskDueOn = (task, dateStr) => {
  if ((task.excludeDates || []).includes(dateStr)) return false;
  if (task.archived && (!task.archivedAt || dateStr >= task.archivedAt)) return false;
  const day = parseLocalDate(dateStr).getDay();
  if (task.type === '毎日（平日）') return day >= 1 && day <= 5;
  if (task.type === '曜日固定') return task.value === DAY_NAMES[day];
  if (task.type === '日付指定') return task.value === dateStr;
  if (task.type === '週回数') return true;
  return false;
};

// ==========================================
// 🛠 カスタムフック: セキュアなローカルストレージ
// ==========================================
const useLocalStorage = (key, initialValue) => {
  const [storedValue, setStoredValue] = useState(() => {
    try {
      const item = window.localStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch (error) {
      console.error(`Error reading localStorage key "${key}":`, error);
      return initialValue;
    }
  });

  // 関数型更新で常に最新値を参照する（同一レンダー内の連続更新でもデータが失われない）
  const setValue = useCallback((value) => {
    setStoredValue(prev => {
      const valueToStore = value instanceof Function ? value(prev) : value;
      try {
        window.localStorage.setItem(key, JSON.stringify(valueToStore));
      } catch (error) {
        console.error(`Error setting localStorage key "${key}":`, error);
      }
      return valueToStore;
    });
  }, [key]);

  return [storedValue, setValue];
};

// ==========================================
// 📊 コアビジネスロジック (レポート計算エンジン)
// ==========================================
// 削除（アーカイブ）済みの課題も含めて集計する。削除後の日付は必要回数に数えないため、
// 「その課題が有効だった期間の必要回数」に対する提出率が正しく計算される。
const generateReportData = (
  startDate,
  endDate,
  students,
  tasks,
  logs,
  dailyCheckIns = [],
  forgottenItems = [],
  absences = [],
  supportActions = []
) => {
  const taskRequirements = {};
  // 課題ごとの「対象週」（週回数タイプ用）: その週に1日でも有効日があればカウント
  const taskActiveWeeks = {};
  tasks.forEach(t => { taskRequirements[t.id] = 0; taskActiveWeeks[t.id] = new Set(); });

  const currentDate = parseLocalDate(startDate);
  const end = parseLocalDate(endDate);

  while (currentDate <= end) {
    const dateStr = getLocalDateString(currentDate);
    const [monStr] = getWeekRangeStrs(dateStr);

    tasks.forEach(t => {
      if (!isTaskDueOn(t, dateStr)) return;
      if (t.type === '週回数') {
        taskActiveWeeks[t.id].add(monStr);
      } else {
        taskRequirements[t.id]++;
      }
    });

    currentDate.setDate(currentDate.getDate() + 1);
  }

  tasks.forEach(t => {
    if (t.type === '週回数') {
      taskRequirements[t.id] += taskActiveWeeks[t.id].size * parseInt(t.value || 1, 10);
    }
  });

  return students.map(student => {
    const studentLogs = logs.filter(l => l.studentId === student.id && l.date >= startDate && l.date <= endDate);

    const taskStats = tasks.map(t => {
      const required = taskRequirements[t.id] || 0;
      const submitted = studentLogs.filter(log => submissionMatchesTask(log, t)).length;
      const unsubmitted = Math.max(0, required - submitted);
      const rate = required > 0 ? Math.round((submitted / required) * 100) : 0;
      return { name: t.name, required, submitted, unsubmitted, rate, archived: !!t.archived };
    }).filter(t => !t.archived || t.required > 0 || t.submitted > 0);
    
    const feelings = { 'げんき':0, 'ねむい':0, 'イライラ':0, 'かなしい':0 };
    dailyCheckIns
      .filter(checkIn => checkIn.studentId === student.id && checkIn.date >= startDate && checkIn.date <= endDate)
      .forEach(checkIn => {
      if (checkIn.feeling && feelings[checkIn.feeling] !== undefined) feelings[checkIn.feeling]++;
    });

    const insights = buildStudentReportInsights({
      studentId: student.id,
      startDate,
      endDate,
      taskStats,
      dailyCheckIns,
      forgottenItems,
      absences,
      supportActions,
    });

    return { student, taskStats, feelings, insights };
  });
};

// ==========================================
// 🧩 汎用UIコンポーネント
// ==========================================
// 📅 入力欄のどこをタップしてもカレンダーが開く日付入力
const DateInput = ({ className, ...props }) => (
  <input
    type="date"
    onClick={(e) => { try { e.currentTarget.showPicker?.(); } catch { /* フォーカス外などで開けない場合は標準動作に任せる */ } }}
    className={`cursor-pointer ${className || ''}`}
    {...props}
  />
);

const RubyText = ({ text, kana }) => (
  <ruby className="ruby-position-over">
    {text}<rt className="text-[0.6em] text-slate-500 font-bold tracking-tight">{kana}</rt>
  </ruby>
);

const Toast = ({ message, type, onClose }) => {
  const [isFadingOut, setIsFadingOut] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setIsFadingOut(true), 2700);
    const removeTimer = setTimeout(onClose, 3000);
    return () => { clearTimeout(timer); clearTimeout(removeTimer); };
  }, [onClose]);

  return (
    <div className={`fixed bottom-10 left-1/2 transform -translate-x-1/2 flex items-center gap-3 px-6 py-3 rounded-2xl shadow-lg z-[100] transition-all duration-300 ${isFadingOut ? 'opacity-0 translate-y-4' : 'opacity-100 translate-y-0'} ${type === 'error' ? 'bg-red-500 text-white' : 'bg-slate-800 text-white'}`}>
      {type === 'error' ? <X size={20} /> : <CheckCircle2 size={20} />}
      <span className="font-bold text-sm tracking-wide">{message}</span>
    </div>
  );
};

const Header = ({ onAdminClick, view }) => (
  <nav className="bg-white border-b-4 border-red-500 px-6 py-3 flex justify-between items-center shadow-sm z-10 sticky top-0">
    <div className="flex items-center text-red-600 gap-2">
      <Mailbox size={26} className="stroke-[2.5]" />
      <h1 className="font-bold text-2xl tracking-tight">宿題ポスト</h1>
    </div>
    {view !== 'admin' && (
      <button onClick={onAdminClick} className="p-2.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-full transition-all active:scale-95 focus:outline-none focus:ring-2 focus:ring-red-200">
        <Settings size={24} />
      </button>
    )}
  </nav>
);

const Footer = () => (
  <footer className="w-full bg-white border-t border-slate-200 pt-3 pb-2 text-center text-sm text-slate-400 font-bold shadow-sm z-10">
    © {new Date().getFullYear()} 宿題ポスト{' '}
    <a href="https://note.com/cute_borage86" target="_blank" rel="noopener noreferrer" className="text-inherit no-underline hover:text-slate-600 transition-colors">
      GIGA山
    </a>
  </footer>
);

// 🖨️ 印刷用レイアウトコンポーネント
const PrintReport = ({ data, period, template = 'term' }) => {
  if (!data || data.length === 0) return null;

  if (template === 'family' || template === 'internal') {
    return <SupportSummaryPrintReport data={data} period={period} audience={template} />;
  }

  return (
    <div className="only-print w-full bg-white text-black" style={{ display: 'none' }}>
      {data.map((report) => (
        <div key={report.student.id} className="print-page flex flex-col">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold mb-2 tracking-widest">学期末 宿題・生活レポート</h1>
            <p className="text-slate-500 font-bold">対象期間: {period.start} 〜 {period.end}</p>
          </div>
          
          <div className="mb-8 flex justify-between items-end border-b-2 border-slate-800 pb-2">
            <h2 className="text-2xl font-bold">{report.student.name} さん</h2>
            <p className="text-lg font-bold">確認印: 　　　　　　　　　</p>
          </div>

          <div className="mb-10">
            <h3 className="text-xl font-bold mb-4 border-l-4 border-slate-800 pl-3 flex items-center gap-2">
              <CheckCircle2 size={24} /> 課題の提出状況
            </h3>
            <table className="w-full border-collapse border-2 border-slate-800 text-left">
              <thead>
                <tr className="bg-slate-100">
                  <th className="border border-slate-400 p-3">課題名</th>
                  <th className="border border-slate-400 p-3 text-center w-24">必要回数</th>
                  <th className="border border-slate-400 p-3 text-center w-24">提出回数</th>
                  <th className="border border-slate-400 p-3 text-center w-24">未提出</th>
                  <th className="border border-slate-400 p-3 text-center w-24">達成率</th>
                </tr>
              </thead>
              <tbody>
                {report.taskStats.map(t => (
                  <tr key={t.name}>
                    <td className="border border-slate-400 p-3 font-bold">
                      {t.name}
                      {t.archived && <span className="ml-2 text-xs font-normal text-slate-500">（終了した課題）</span>}
                    </td>
                    <td className="border border-slate-400 p-3 text-center">{t.required}</td>
                    <td className="border border-slate-400 p-3 text-center">{t.submitted}</td>
                    <td className={`border border-slate-400 p-3 text-center font-bold text-lg ${t.unsubmitted > 0 ? 'text-red-600' : ''}`}>
                      {t.unsubmitted > 0 ? t.unsubmitted : 0}
                    </td>
                    <td className="border border-slate-400 p-3 text-center font-bold">{t.rate}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-xs text-slate-500 mt-2 font-bold">※必要回数は現在のルールに基づくシミュレーション値です。</p>
          </div>

          <div className="mb-10">
            <h3 className="text-xl font-bold mb-4 border-l-4 border-slate-800 pl-3 flex items-center gap-2">
              <HeartPulse size={24} /> 朝の「きもち」記録
            </h3>
            <div className="flex justify-around bg-slate-50 p-6 rounded-2xl border-2 border-slate-200">
              {Object.entries(FEELING_CONFIG).map(([label, config]) => {
                const Icon = config.icon;
                return (
                  <div key={label} className="text-center flex flex-col items-center">
                    <Icon size={40} className={`mb-2 ${config.colorClass}`} />
                    <div className="font-bold text-slate-700">{label}</div>
                    <div className={`text-2xl font-bold mt-1 ${config.colorClass}`}>{report.feelings[label]}回</div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="mt-auto pt-6 border-t border-slate-200">
            <h3 className="text-xl font-bold mb-4 border-l-4 border-slate-800 pl-3 flex items-center gap-2">
              <FileText size={24} /> 先生からのメッセージ
            </h3>
            <div className="border-2 border-slate-300 rounded-2xl h-40 p-4 bg-slate-50 relative">
               <p className="text-slate-300 text-sm absolute top-4 left-4 font-bold">（ここに手書きでコメントを記入できます）</p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

const SupportSummaryPrintReport = ({ data, period, audience }) => {
  const isInternal = audience === 'internal';
  const title = isInternal ? '児童支援ケースサマリー' : '学校生活・学習サマリー';

  return (
    <div className="only-print w-full bg-white text-black" style={{ display: 'none' }}>
      {data.map(report => {
        const { insights } = report;
        const supports = isInternal ? insights.internalSupports : insights.familySupports;
        const reportableTasks = report.taskStats.filter(task => task.required > 0 || task.submitted > 0);
        const visibleTasks = reportableTasks.slice(0, 6);
        const visibleSupports = supports.slice(0, 3);
        return (
          <div key={report.student.id} className="print-page flex flex-col text-slate-900">
            <div className="flex items-start justify-between gap-6 border-b-2 border-indigo-700 pb-4 mb-5">
              <div>
                <div className="text-xs font-bold tracking-[0.22em] text-indigo-600 mb-1">SHUKUDAI POST REPORT</div>
                <h1 className="text-2xl font-bold tracking-wider">{title}</h1>
                <p className="text-sm text-slate-500 font-bold mt-1">対象期間：{period.start} 〜 {period.end}</p>
              </div>
              <div className={`px-3 py-2 rounded-lg border text-xs font-bold ${isInternal ? 'bg-amber-50 border-amber-300 text-amber-800' : 'bg-indigo-50 border-indigo-200 text-indigo-700'}`}>
                {isInternal ? '校内限定・取扱注意' : '保護者共有用'}
              </div>
            </div>

            <div className="flex items-end justify-between gap-4 mb-5">
              <h2 className="text-2xl font-bold">{report.student.name} さん</h2>
              <span className="text-sm font-bold text-slate-500">作成日：{getLocalDateString()}</span>
            </div>

            <div className="grid grid-cols-4 gap-3 mb-5">
              {[
                ['課題提出率', insights.overallRate === null ? '—' : `${insights.overallRate}%`, `${insights.totalSubmitted}/${insights.totalRequired}回`],
                ['朝の記録', `${insights.checkInDays}日`, 'チェックイン'],
                ['忘れ物', `${insights.forgotten.total}件`, '期間内の記録'],
                ['欠席・遅刻', `${insights.attendance.total}件`, '期間内の記録'],
              ].map(([label, value, note]) => (
                <div key={label} className="border border-slate-200 bg-slate-50 rounded-xl p-3">
                  <p className="text-[10px] font-bold text-slate-500">{label}</p>
                  <p className="text-2xl font-bold text-slate-900 mt-1">{value}</p>
                  <p className="text-[10px] text-slate-500 mt-1">{note}</p>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-4 mb-4">
              <section className="border border-slate-200 rounded-xl overflow-hidden">
                <h3 className="bg-slate-100 px-4 py-2.5 font-bold text-sm flex items-center gap-2"><CheckCircle2 size={16} /> 学習の取り組み</h3>
                <div className="divide-y divide-slate-100">
                  {visibleTasks.length === 0 ? (
                    <p className="p-4 text-xs text-slate-500">対象となる課題記録はありません。</p>
                  ) : visibleTasks.map(task => (
                    <div key={task.name} className="px-4 py-2 flex items-center justify-between gap-3 text-xs">
                      <span className="font-bold truncate">{task.name}</span>
                      <span className="whitespace-nowrap font-bold">{task.submitted}/{task.required}回・{task.rate}%</span>
                    </div>
                  ))}
                </div>
                {reportableTasks.length > visibleTasks.length && <p className="px-4 py-2 text-[10px] text-slate-500 bg-slate-50">ほか{reportableTasks.length - visibleTasks.length}課題</p>}
              </section>

              <section className="border border-slate-200 rounded-xl overflow-hidden">
                <h3 className="bg-slate-100 px-4 py-2.5 font-bold text-sm flex items-center gap-2"><HeartPulse size={16} /> 朝のきもち</h3>
                <div className="grid grid-cols-2 gap-px bg-slate-100">
                  {Object.entries(report.feelings).map(([label, count]) => (
                    <div key={label} className="bg-white p-3 flex items-center justify-between text-xs">
                      <span className="font-bold">{label}</span><span className="font-bold text-base">{count}回</span>
                    </div>
                  ))}
                </div>
                <p className="px-4 py-2 text-[10px] text-slate-500 bg-slate-50">本人が朝に選んだ記録を、そのまま集計しています。</p>
              </section>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-4">
              <section className="border border-slate-200 rounded-xl p-4">
                <h3 className="font-bold text-sm flex items-center gap-2 mb-3"><Backpack size={16} /> 学習準備</h3>
                {insights.forgotten.topItems.length === 0 ? (
                  <p className="text-xs text-slate-500">期間内の忘れ物記録はありません。</p>
                ) : (
                  <div className="space-y-2 text-xs">
                    <p><span className="text-slate-500 font-bold">多かったもの：</span>{insights.forgotten.topItems.slice(0, 3).map(item => `${item.label} ${item.count}件`).join('、')}</p>
                    <p><span className="text-slate-500 font-bold">教科：</span>{insights.forgotten.topSubjects.slice(0, 3).map(item => `${item.label} ${item.count}件`).join('、') || '記録なし'}</p>
                  </div>
                )}
              </section>
              <section className="border border-slate-200 rounded-xl p-4">
                <h3 className="font-bold text-sm flex items-center gap-2 mb-3"><UserCheck size={16} /> 出欠の記録</h3>
                {insights.attendance.byStatus.length === 0 ? (
                  <p className="text-xs text-slate-500">期間内の欠席・遅刻記録はありません。</p>
                ) : (
                  <div className="flex flex-wrap gap-2">{insights.attendance.byStatus.map(item => <span key={item.label} className="bg-slate-100 rounded-lg px-3 py-2 text-xs font-bold">{item.label} {item.count}件</span>)}</div>
                )}
              </section>
            </div>

            <section className="border-2 border-indigo-200 rounded-xl overflow-hidden mb-4">
              <h3 className="bg-indigo-50 px-4 py-2.5 font-bold text-sm text-indigo-900 flex items-center gap-2"><HandHeart size={16} /> {isInternal ? '支援の経過と次回確認' : '学校で取り組んでいること'}</h3>
              {visibleSupports.length === 0 ? (
                <p className="p-4 text-xs text-slate-500">対象となる支援記録はありません。</p>
              ) : (
                <div className="divide-y divide-indigo-100">
                  {visibleSupports.map(support => (
                    <div key={support.id} className="p-3 text-xs">
                      <div className="flex items-center justify-between gap-3 mb-1.5"><span className="font-bold text-indigo-800">{support.category}</span><span className="font-bold text-slate-500">{support.status}</span></div>
                      {isInternal && <p><span className="font-bold text-slate-500">確認した事実：</span>{support.observation || '記録なし'}</p>}
                      <p><span className="font-bold text-slate-500">学校での支援：</span>{support.action || '記録なし'}</p>
                      <p><span className="font-bold text-slate-500">目指す状態：</span>{support.goal || '記録なし'}</p>
                      {support.outcome && <p><span className="font-bold text-slate-500">確認した変化：</span>{support.outcome}</p>}
                      {isInternal && support.followUpDate && <p><span className="font-bold text-slate-500">次回確認：</span>{support.followUpDate}</p>}
                    </div>
                  ))}
                </div>
              )}
              {supports.length > visibleSupports.length && <p className="px-4 py-2 text-[10px] text-slate-500 bg-indigo-50">ほか{supports.length - visibleSupports.length}件の支援記録</p>}
            </section>

            <section className="mt-auto">
              <h3 className="font-bold text-sm mb-2 flex items-center gap-2"><FileText size={16} /> {isInternal ? '協議事項・次の一手' : 'ご家庭と共有したいこと'}</h3>
              <div className="border-2 border-dashed border-slate-300 rounded-xl h-24 p-3 text-xs text-slate-300 font-bold">印刷後に追記できます</div>
            </section>

            <p className="text-[9px] text-slate-400 mt-3 leading-relaxed">
              {isInternal
                ? '本資料は校内支援の検討用です。事実記録をもとに作成し、児童の診断や評価順位を示すものではありません。取扱いに注意してください。'
                : '本資料は学校で記録した事実をまとめたものです。自動的な診断や評価は行っていません。内容について気になる点があれば学校へお知らせください。'}
            </p>
          </div>
        );
      })}
    </div>
  );
};

// ==========================================
// 📱 アプリ画面ビュー
// ==========================================
const StandbyView = ({ onScan }) => {
  const [keypadVal, setKeypadVal] = useState('');

  return (
    <div className="flex flex-col items-center justify-center min-h-full w-full px-4 py-8 animate-fade-in-up">
      <div className="w-full max-w-md mx-auto">
        <div className="bg-white rounded-3xl p-8 shadow-sm border border-slate-100 text-center">
          <h2 className="text-xl font-bold text-slate-500 tracking-wider mb-6">ID NUMBER</h2>
          
          <div className="bg-slate-50 border-2 border-slate-100 h-24 rounded-2xl flex items-center justify-center text-5xl font-bold tracking-[0.2em] text-red-500 mb-8 shadow-inner overflow-hidden">
            {keypadVal || <span className="text-slate-200">-</span>}
          </div>
          
          <div className="grid grid-cols-3 gap-4 mb-4">
            {['7','8','9','4','5','6','1','2','3'].map(n => (
              <button key={n} onClick={() => setKeypadVal(v => (v.length < 10 ? v + n : v))} className="bg-white text-3xl font-bold py-6 rounded-2xl shadow-sm border border-slate-100 transition-transform duration-100 active:scale-95 active:bg-slate-100 hover:bg-slate-50 text-slate-700">
                {n}
              </button>
            ))}
            <button onClick={() => setKeypadVal('')} className="bg-slate-50 text-slate-500 text-lg font-bold py-6 rounded-2xl transition-transform duration-100 active:scale-95 border border-slate-200 hover:bg-slate-100">クリア</button>
            <button onClick={() => setKeypadVal(v => (v.length < 10 ? v + '0' : v))} className="bg-white text-3xl font-bold py-6 rounded-2xl shadow-sm border border-slate-100 transition-transform duration-100 active:scale-95 active:bg-slate-100 hover:bg-slate-50 text-slate-700">0</button>
            <button onClick={() => { if(keypadVal){onScan(keypadVal); setKeypadVal('');} }} className="bg-red-500 hover:bg-red-400 text-white text-2xl font-bold py-6 rounded-2xl shadow-sm transition-transform duration-100 active:scale-95 flex justify-center items-center">
              OK
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

const StudentTasksView = ({ student, tasks, onNext, onCancel }) => {
  const [selected, setSelected] = useState([]);
  const toggleTask = (tName) => setSelected(p => p.includes(tName) ? p.filter(t => t !== tName) : [...p, tName]);

  return (
    <div className="flex flex-col min-h-full max-w-lg mx-auto w-full px-4 py-6 animate-fade-in-up">
      <div className="bg-white rounded-2xl shadow-sm p-6 text-center mb-6 border border-slate-100">
        <span className="text-red-500 font-bold tracking-widest text-xs mb-1 block">HELLO</span>
        <h2 className="text-3xl font-bold text-slate-800 tracking-tight">{student.name} <span className="text-lg text-slate-500 font-normal">さん</span></h2>
      </div>

      <h3 className="font-bold text-xl text-slate-800 mb-4 px-2 flex items-center gap-2">
        <CheckCircle2 className="text-red-400" /> <RubyText text="今日" kana="きょう" />だすもの
      </h3>
      
      <div className="grid grid-cols-2 gap-4 mb-8">
        {tasks.length === 0 ? (
           <div className="col-span-2 text-center text-slate-400 py-10 font-bold bg-white/50 rounded-2xl border border-dashed border-slate-200 flex flex-col items-center gap-2">
             <Sparkles size={32} className="text-amber-400" />
             <span><RubyText text="今日" kana="きょう" />はありません</span>
           </div>
        ) : (
          tasks.map(task => {
            const isSel = selected.includes(task.name);
            const isDone = task.done;
            return (
              <button key={task.name} disabled={isDone} onClick={() => toggleTask(task.name)} 
                className={`relative p-5 rounded-2xl flex flex-col items-center justify-center transition-all duration-200 active:scale-95 border-2 ${isDone ? 'bg-slate-50 border-slate-100 text-slate-300 cursor-not-allowed' : isSel ? 'bg-red-50 border-red-400 text-red-600 shadow-md transform scale-[1.02]' : 'bg-white border-transparent shadow-sm text-slate-700 hover:border-red-200'}`}>
                {task.type === '週回数' && <span className="absolute top-3 left-3 text-[10px] font-bold bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full"><RubyText text="週" kana="しゅう" /> {task.weeklyCount}/{task.value}<RubyText text="回" kana="かい" /></span>}
                <div className="mt-2 mb-3 transition-transform duration-200">
                  {isDone || isSel ? <CheckCircle2 size={32} /> : <Circle size={32} />}
                </div>
                <span className="font-bold text-center text-md leading-tight">{task.name}</span>
                {isDone && <span className="text-[10px] mt-2 font-bold bg-green-100 text-green-700 px-2 py-1 rounded-md"><RubyText text="提出済" kana="ていしゅつずみ" /></span>}
              </button>
            );
          })
        )}
      </div>
      
      <div className="mt-auto flex flex-col gap-4 pb-4">
        <button onClick={() => onNext(tasks.filter(t => selected.includes(t.name)))}
          className="py-4 rounded-xl font-bold text-lg transition-all duration-200 active:scale-95 bg-red-500 text-white shadow-md hover:bg-red-400">
          {selected.length > 0 ? 'つぎへ' : '提出なしで つぎへ'}
        </button>
        <button onClick={onCancel} className="py-3 text-slate-400 font-bold hover:text-slate-600 transition-colors">やめる</button>
      </div>
    </div>
  );
};

const FeelingView = ({ onFeelingSelect }) => {
  return (
    <div className="flex flex-col min-h-full max-w-lg mx-auto w-full px-4 py-8 items-center justify-center pb-12 animate-fade-in-up">
      <h2 className="text-2xl font-bold text-slate-800 mb-8 text-center leading-relaxed">いまの「きもち」を<br/>おしえてね！</h2>
      <div className="grid grid-cols-2 gap-4 w-full">
        {Object.entries(FEELING_CONFIG).map(([label, config]) => {
          const Icon = config.icon;
          return (
            <button key={label} onClick={() => onFeelingSelect(label)} className={`flex flex-col items-center justify-center p-8 rounded-2xl border shadow-sm transition-all duration-200 active:scale-95 ${config.bgClass} ${config.colorClass} ${config.hoverClass}`}>
              <Icon size={48} className="mb-4" />
              <span className="font-bold text-lg">{label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

const CompleteView = ({ onFinish }) => {
  useEffect(() => {
    const timer = setTimeout(onFinish, 3000);
    return () => clearTimeout(timer);
  }, [onFinish]);

  return (
    <div className="flex flex-col min-h-full max-w-lg mx-auto w-full px-4 py-10 items-center justify-center text-center animate-fade-in-up">
      <div className="mb-6 animate-float">
        <PartyPopper size={80} className="text-amber-500 drop-shadow-md" />
      </div>
      <h2 className="text-4xl font-bold text-slate-800 mb-4 flex items-center justify-center gap-2 tracking-tight">
        <RubyText text="提出" kana="ていしゅつ" /><RubyText text="完了" kana="かんりょう" />
        <Sparkles size={32} className="text-amber-400" />
      </h2>
      <p className="font-bold text-red-600 text-lg">よくがんばりました</p>
    </div>
  );
};

// ==========================================
// 👩‍🏫 先生用：管理画面 (パフォーマンス最適化済)
// ==========================================
const AdminView = ({ onClose, showToast, db, drive, onGenerateReport, isPrinting }) => {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [newStudent, setNewStudent] = useState({ id: '', name: '' });
  const [bulkStudents, setBulkStudents] = useState('');
  // デフォルトは「日付指定」＋今日の日付（そのまま単発課題をすぐ登録できる）
  const [newTask, setNewTask] = useState(() => ({ type: '日付指定', value: getLocalDateString(), name: '' }));
  const [newPin, setNewPin] = useState('');
  const fileInputRef = useRef(null);

  // ☁️ Googleドライブ同期：クライアントID入力欄
  const [clientIdInput, setClientIdInput] = useState(drive?.clientId || '');

  // 🌟 編集用ステート
  const [editingStudentId, setEditingStudentId] = useState(null);
  const [editStudentData, setEditStudentData] = useState({ id: '', name: '' });
  
  const [editingTaskId, setEditingTaskId] = useState(null);
  const [editTaskData, setEditTaskData] = useState({ name: '' });

  // 🌟 おやすみ日（提出不要日）編集用ステート
  const [excludeEditTaskId, setExcludeEditTaskId] = useState(null);
  const [excludeDateInput, setExcludeDateInput] = useState(() => getLocalDateString());
  const [showArchivedTasks, setShowArchivedTasks] = useState(false);

  // 日付の初期化
  const todayForDash = useMemo(() => new Date(), []);
  const todayStrForDash = useMemo(() => getLocalDateString(todayForDash), [todayForDash]);
  
  const [reportStartDate, setReportStartDate] = useState(() => getLocalDateString(new Date(todayForDash.getFullYear(), todayForDash.getMonth(), 1)));
  const [reportEndDate, setReportEndDate] = useState(() => getLocalDateString(new Date(todayForDash.getFullYear(), todayForDash.getMonth() + 1, 0)));
  const [reportTemplate, setReportTemplate] = useState('term');
  const [reportStudentId, setReportStudentId] = useState('all');

  const [dashboardPreset, setDashboardPreset] = useState('today');
  const [dashboardStart, setDashboardStart] = useState(todayStrForDash);
  const [dashboardEnd, setDashboardEnd] = useState(todayStrForDash);

  const isSingleDay = dashboardStart === dashboardEnd;
  const classInsightCurrentEnd = todayStrForDash;
  const classInsightCurrentStart = shiftDate(classInsightCurrentEnd, -13);
  const classInsightPreviousEnd = shiftDate(classInsightCurrentStart, -1);
  const classInsightPreviousStart = shiftDate(classInsightPreviousEnd, -13);
  const classInsightCurrentReports = useMemo(
    () => generateReportData(classInsightCurrentStart, classInsightCurrentEnd, db.students, db.tasks, db.logs, db.dailyCheckIns),
    [classInsightCurrentStart, classInsightCurrentEnd, db.students, db.tasks, db.logs, db.dailyCheckIns]
  );
  const classInsightPreviousReports = useMemo(
    () => generateReportData(classInsightPreviousStart, classInsightPreviousEnd, db.students, db.tasks, db.logs, db.dailyCheckIns),
    [classInsightPreviousStart, classInsightPreviousEnd, db.students, db.tasks, db.logs, db.dailyCheckIns]
  );
  const dashboardForgottenItems = useMemo(
    () => (db.forgottenItems || []).filter(item => item.date >= dashboardStart && item.date <= dashboardEnd),
    [db.forgottenItems, dashboardStart, dashboardEnd]
  );
  const dashboardForgottenStudents = useMemo(
    () => new Set(dashboardForgottenItems.map(item => item.studentId)).size,
    [dashboardForgottenItems]
  );
  const activeSupportActions = useMemo(
    () => (db.supportActions || []).filter(item => item.status !== '完了'),
    [db.supportActions]
  );
  const dueSupportActions = useMemo(
    () => activeSupportActions.filter(item => item.followUpDate && item.followUpDate <= todayStrForDash),
    [activeSupportActions, todayStrForDash]
  );
  const activeClassActions = useMemo(
    () => (db.classActions || []).filter(item => item.status !== '完了'),
    [db.classActions]
  );
  const dueClassActions = useMemo(
    () => activeClassActions.filter(item => item.reviewDate && item.reviewDate <= todayStrForDash),
    [activeClassActions, todayStrForDash]
  );
  const dueFamilyContacts = useMemo(
    () => (db.familyContacts || []).filter(item => item.status !== '完了' && item.followUpDate && item.followUpDate <= todayStrForDash),
    [db.familyContacts, todayStrForDash]
  );

  // 🚀 【最適化】1日表示用のデータをメモ化
  const { singleDayData, singleDaySubmitRate, singleDayFeelingCounts, actedStudentsCount, singleDayAttendance } = useMemo(() => {
    if (!isSingleDay) return { singleDayData: [], singleDaySubmitRate: 0, singleDayFeelingCounts: {}, actedStudentsCount: 0, singleDayAttendance: {} };
    
    // 手動記録は timestamp が記録操作時刻になるため、週回数の集計は date（対象日）で行う
    const [monStr, sunStr] = getWeekRangeStrs(dashboardStart);

    const data = db.students.map(student => {
      const studentTargetLogs = db.logs.filter(l => l.date === dashboardStart && l.studentId === student.id);
      const studentWeeklyLogs = db.logs.filter(l => l.studentId === student.id && l.date >= monStr && l.date <= sunStr);

      const activeTasks = db.tasks.filter(t => isTaskDueOn(t, dashboardStart)).map(t => {
        const isDone = studentTargetLogs.some(log => submissionMatchesTask(log, t));
        let weeklyCount = 0;
        let quotaReached = false;
        if (t.type === '週回数') {
           weeklyCount = studentWeeklyLogs.filter(log => submissionMatchesTask(log, t)).length;
           quotaReached = weeklyCount >= parseInt(t.value || 1, 10);
        }
        return { ...t, done: isDone, weeklyCount, quotaReached };
      }).filter(t => {
        if (t.type === '週回数' && !t.done && t.quotaReached) return false;
        return true;
      });

      const latestFeeling = (db.dailyCheckIns || [])
        .filter(checkIn => checkIn.date === dashboardStart && checkIn.studentId === student.id)
        .sort((a, b) => b.timestamp - a.timestamp)[0]?.feeling || null;
      let feelingData = null;
      if (latestFeeling && FEELING_CONFIG[latestFeeling]) {
        const config = FEELING_CONFIG[latestFeeling];
        feelingData = { label: latestFeeling, icon: config.icon, color: config.colorClass, bg: config.bgClass };
      }

      const completedTasksCount = activeTasks.filter(t => t.done).length;
      const totalTasksCount = activeTasks.length;
      const isAllDone = totalTasksCount > 0 && completedTasksCount === totalTasksCount;
      const isPartial = completedTasksCount > 0 && completedTasksCount < totalTasksCount;

      // 🗓️ 出欠ステータスの自動判定
      const hasLog = db.logs.some(l => l.date === dashboardStart && l.studentId === student.id)
        || (db.dailyCheckIns || []).some(checkIn => checkIn.date === dashboardStart && checkIn.studentId === student.id);
      let attendanceStatus = '未確認';
      if (hasLog) {
        attendanceStatus = '出席';
      } else {
        const absRec = (db.absences || []).find(a => a.date === dashboardStart && a.studentId === student.id);
        if (absRec) attendanceStatus = absRec.status;
      }

      return { student, tasks: activeTasks, feelingData, isAllDone, isPartial, attendanceStatus };
    });

    const actedCount = data.filter(d => d.tasks.some(t => t.done) || d.feelingData).length;
    const rate = db.students.length > 0 ? Math.round((actedCount / db.students.length) * 100) : 0;

    const counts = { 'げんき': 0, 'ねむい': 0, 'イライラ': 0, 'かなしい': 0 };
    data.forEach(d => { if (d.feelingData) counts[d.feelingData.label]++; });

    const attCounts = { '出席': 0, '遅刻': 0, '欠席': 0, '未確認': 0 };
    data.forEach(d => { attCounts[d.attendanceStatus] = (attCounts[d.attendanceStatus] || 0) + 1; });

    return { singleDayData: data, singleDaySubmitRate: rate, singleDayFeelingCounts: counts, actedStudentsCount: actedCount, singleDayAttendance: attCounts };
  }, [dashboardStart, db.students, db.tasks, db.logs, db.absences, db.dailyCheckIns, isSingleDay]);

  // 🚀 【最適化】複数日表示用のデータをメモ化
  const { multiDayData, multiSubmitRate, multiTotalRequired, multiTotalSubmitted, multiFeelingCounts } = useMemo(() => {
    if (isSingleDay) return { multiDayData: [], multiSubmitRate: 0, multiTotalRequired: 0, multiTotalSubmitted: 0, multiFeelingCounts: {} };
    
    const data = generateReportData(dashboardStart, dashboardEnd, db.students, db.tasks, db.logs, db.dailyCheckIns);
    let rate = 0, req = 0, sub = 0;
    const counts = { 'げんき': 0, 'ねむい': 0, 'イライラ': 0, 'かなしい': 0 };
    
    data.forEach(d => {
      d.taskStats.forEach(t => { req += t.required; sub += t.submitted; });
      Object.keys(counts).forEach(k => { counts[k] += d.feelings[k]; });
    });
    rate = req > 0 ? Math.round((sub / req) * 100) : 0;

    return { multiDayData: data, multiSubmitRate: rate, multiTotalRequired: req, multiTotalSubmitted: sub, multiFeelingCounts: counts };
  }, [dashboardStart, dashboardEnd, db.students, db.tasks, db.logs, db.dailyCheckIns, isSingleDay]);


  // ==========================================
  // 📋 出欠管理ハンドラ
  // ==========================================
  const handleMarkAbsence = useCallback((studentId, studentName, status) => {
    // すでにログ（チェックイン済み）があれば上書きしない
    const hasLog = db.logs.some(l => l.date === dashboardStart && l.studentId === studentId)
      || (db.dailyCheckIns || []).some(checkIn => checkIn.date === dashboardStart && checkIn.studentId === studentId);
    if (hasLog) {
      showToast(`${studentName} さんはチェックイン済みのため変更できません`, 'error');
      return;
    }
    db.setAbsences(prev => {
      const list = prev || [];
      const existing = list.find(a => a.date === dashboardStart && a.studentId === studentId);
      if (existing) {
        return list.map(a => (a.date === dashboardStart && a.studentId === studentId) ? { ...a, status, timestamp: Date.now() } : a);
      }
      return [...list, { id: Date.now().toString(), date: dashboardStart, studentId, studentName, status, timestamp: Date.now() }];
    });
    showToast(`${studentName} さんを「${status}」に記録しました`);
  }, [db, dashboardStart, showToast]);

  const handleClearAbsence = useCallback((studentId, studentName) => {
    db.setAbsences(prev => (prev || []).filter(a => !(a.date === dashboardStart && a.studentId === studentId)));
    showToast(`${studentName} さんの出欠記録を取り消しました`);
  }, [db, dashboardStart, showToast]);

  // ==========================================
  // 📝 提出記録の管理ハンドラ
  // ==========================================
  const handleAddManualSubmission = useCallback((studentId, studentName, taskName, dateStr) => {
    const task = db.tasks.find(item => item.name === taskName);
    const student = db.students.find(item => item.id === studentId);
    if (!task || !student) { showToast('児童または課題が見つかりません', 'error'); return; }
    const alreadyDone = db.logs.some(log => log.date === dateStr && log.studentId === studentId && submissionMatchesTask(log, task));
    if (alreadyDone) { showToast('すでに提出記録があります', 'error'); return; }
    const newLog = createSubmissionEvent({ student: { ...student, name: studentName }, task, date: dateStr, isManual: true });
    db.setLogs(prev => [...prev, newLog]);
    showToast(`「${taskName}」を提出済みに記録しました`);
  }, [db, showToast]);

  const handleRemoveSubmission = useCallback((studentId, taskName, dateStr) => {
    if (!window.confirm(`「${taskName}」の提出記録を取り消しますか？`)) return;
    const task = db.tasks.find(item => item.name === taskName);
    db.setLogs(prev => prev.filter(log => !(log.date === dateStr && log.studentId === studentId && (!task || submissionMatchesTask(log, task)))));
    showToast(`「${taskName}」の提出記録を取り消しました`);
  }, [db, showToast]);

  const handleDashboardPresetChange = useCallback((e) => {
    const preset = e.target.value;
    setDashboardPreset(preset);
    const today = new Date();
    const tStr = getLocalDateString(today);
    
    if (preset === 'today') {
      setDashboardStart(tStr); setDashboardEnd(tStr);
    } else if (preset === 'this_week') {
      const diffToMon = today.getDate() - today.getDay() + (today.getDay() === 0 ? -6 : 1);
      const mon = new Date(today); mon.setDate(diffToMon);
      const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
      setDashboardStart(getLocalDateString(mon)); setDashboardEnd(getLocalDateString(sun));
    } else if (preset === 'this_month') {
      const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
      const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      setDashboardStart(getLocalDateString(firstDay)); setDashboardEnd(getLocalDateString(lastDay));
    } else if (preset === 'last_month') {
      const firstDay = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const lastDay = new Date(today.getFullYear(), today.getMonth(), 0);
      setDashboardStart(getLocalDateString(firstDay)); setDashboardEnd(getLocalDateString(lastDay));
    }
  }, []);

  const handleAddStudent = (e) => {
    e.preventDefault();
    if (!newStudent.id || !newStudent.name) return showToast('IDと名前を入力してください', 'error');
    if (db.students.find(s => s.id === newStudent.id)) return showToast('そのIDは既に登録されています', 'error');
    db.setStudents([...db.students, { ...newStudent }]);
    setNewStudent({ id: '', name: '' });
    showToast('名簿に追加しました');
  };

  const handleAddBulkStudents = (e) => {
    e.preventDefault();
    if (!bulkStudents.trim()) return showToast('名前を入力してください', 'error');
    
    const names = bulkStudents.split('\n').map(n => n.trim()).filter(n => n);
    if (names.length === 0) return;

    // 🌟 重複しない安全な連番ロジック
    const existingIds = new Set(db.students.map(s => parseInt(s.id, 10)).filter(n => !isNaN(n)));
    let nextId = 1;
    
    const newStudents = names.map(name => {
      while (existingIds.has(nextId)) { nextId++; }
      existingIds.add(nextId);
      return { id: String(nextId), name: name };
    });

    db.setStudents([...db.students, ...newStudents]);
    setBulkStudents('');
    showToast(`${newStudents.length}名の児童を追加しました`);
  };

  const startEditStudent = (student) => {
    setEditingStudentId(student.id);
    setEditStudentData({ id: student.id, name: student.name });
  };

  const handleUpdateStudent = (oldId) => {
    const newId = editStudentData.id.trim();
    const newName = editStudentData.name.trim();

    if (!newId || !newName) return showToast('IDと名前を入力してください', 'error');
    if (newId !== oldId && db.students.find(s => s.id === newId)) {
      return showToast('そのIDは既に他の児童に使われています', 'error');
    }

    const updatedStudents = db.students.map(s => s.id === oldId ? { ...s, id: newId, name: newName } : s);
    db.setStudents(updatedStudents);

    // ログも更新
    const updatedLogs = db.logs.map(l => l.studentId === oldId ? { ...l, studentId: newId, studentName: newName } : l);
    db.setLogs(updatedLogs);
    db.setDailyCheckIns(prev => prev.map(item => item.studentId === oldId ? { ...item, studentId: newId, studentName: newName } : item));
    db.setForgottenItems(prev => prev.map(item => item.studentId === oldId ? { ...item, studentId: newId, studentName: newName } : item));
    db.setSupportActions(prev => prev.map(item => item.studentId === oldId ? { ...item, studentId: newId, studentName: newName } : item));

    setEditingStudentId(null);
    showToast('児童情報を更新しました');
  };

  const handleDeleteStudentSecure = (id) => {
    const inputPin = window.prompt('【誤操作防止】\n本当に削除する場合は、先生用PINコードを入力してください。');
    if (inputPin === null) return;
    if (inputPin === db.config.pin) {
      db.setStudents(db.students.filter(x => x.id !== id));
      showToast('児童を削除しました');
    } else {
      showToast('PINコードが違うため削除をキャンセルしました', 'error');
    }
  };

  const handleAddTask = (e) => {
    e.preventDefault();
    const name = newTask.name.trim();
    if (!name) return showToast('課題名を入力してください', 'error');

    // 提出記録は課題名で紐づくため、同名課題の重複は集計が壊れる原因になる
    const existing = db.tasks.find(t => t.name === name);
    if (existing) {
      return showToast(existing.archived ? '同名の削除済み課題があります。復元してご利用ください' : 'その課題名は既に登録されています', 'error');
    }

    let value = newTask.value;
    if (newTask.type === '曜日固定' && !value) value = '月';
    if (newTask.type === '週回数' && !value) value = '1';
    if (newTask.type === '日付指定' && !value) return showToast('日付を選択してください', 'error');

    db.setTasks(prev => [...prev, { id: Date.now().toString(), type: newTask.type, value, name, excludeDates: [] }]);
    setNewTask({ type: '日付指定', value: getLocalDateString(), name: '' });
    showToast('課題ルールを追加しました');
  };

  // 🌟 課題ルールの編集機能
  const startEditTask = (task) => {
    setEditingTaskId(task.id);
    setEditTaskData({ name: task.name });
  };

  const handleUpdateTask = (taskId, oldName) => {
    const newName = editTaskData.name.trim();
    if (!newName) return showToast('課題名を入力してください', 'error');
    if (newName !== oldName && db.tasks.some(t => t.id !== taskId && t.name === newName)) {
      return showToast('その課題名は既に使われています', 'error');
    }

    // 課題名の更新
    const updatedTasks = db.tasks.map(t => t.id === taskId ? { ...t, name: newName } : t);
    db.setTasks(updatedTasks);

    // 過去のログ（提出記録）も新しい課題名に一括更新
    const updatedLogs = db.logs.map(l => l.taskName === oldName ? { ...l, taskName: newName } : l);
    db.setLogs(updatedLogs);

    setEditingTaskId(null);
    showToast('課題ルールを更新しました');
  };

  // 🗄️ 削除＝アーカイブ（提出記録と集計を保持したままルールを終了する）
  const handleDeleteTaskSecure = (id) => {
    const inputPin = window.prompt('【誤操作防止】\nこの課題ルールを終了（削除）します。これまでの提出記録と集計はレポートに残ります。\n実行するには、先生用PINコードを入力してください。');
    if (inputPin === null) return;
    if (inputPin === db.config.pin) {
      const today = getLocalDateString();
      db.setTasks(prev => prev.map(t => t.id === id ? { ...t, archived: true, archivedAt: today } : t));
      showToast('課題を終了しました（これまでの記録はレポートに残ります）');
    } else {
      showToast('PINコードが違うため削除をキャンセルしました', 'error');
    }
  };

  const handleRestoreTask = (id) => {
    const target = db.tasks.find(t => t.id === id);
    if (!target) return;
    if (db.tasks.some(t => !t.archived && t.name === target.name)) {
      return showToast('同名の課題が有効になっているため復元できません', 'error');
    }
    db.setTasks(prev => prev.map(t => t.id === id ? { ...t, archived: false, archivedAt: null } : t));
    showToast('課題ルールを復元しました');
  };

  const handlePermanentDeleteTask = (id) => {
    const inputPin = window.prompt('【⚠️完全削除】\nこの課題をレポートの集計対象からも完全に取り除きます。（児童の提出記録データ自体は残ります）\n実行するには、先生用PINコードを入力してください。');
    if (inputPin === null) return;
    if (inputPin === db.config.pin) {
      db.setTasks(prev => prev.filter(t => t.id !== id));
      showToast('課題を完全に削除しました');
    } else {
      showToast('PINコードが違うため削除をキャンセルしました', 'error');
    }
  };

  // 🌟 おやすみ日（この日は提出不要）の追加・削除
  const handleAddExcludeDate = (taskId) => {
    if (!excludeDateInput) return showToast('日付を選択してください', 'error');
    const target = db.tasks.find(t => t.id === taskId);
    if (!target) return;
    if ((target.excludeDates || []).includes(excludeDateInput)) {
      return showToast('その日はすでにおやすみ日に設定されています', 'error');
    }
    db.setTasks(prev => prev.map(t => t.id === taskId ? { ...t, excludeDates: [...(t.excludeDates || []), excludeDateInput].sort() } : t));
    showToast(`${excludeDateInput} をおやすみ日にしました`);
  };

  const handleRemoveExcludeDate = (taskId, date) => {
    db.setTasks(prev => prev.map(t => t.id === taskId ? { ...t, excludeDates: (t.excludeDates || []).filter(d => d !== date) } : t));
    showToast(`${date} のおやすみ設定を取り消しました`);
  };

  const handleChangePin = (e) => {
    e.preventDefault();
    if (newPin.length < 4) return showToast('PINは4文字以上で設定してください', 'error');
    db.setConfig({ ...db.config, pin: newPin });
    setNewPin('');
    showToast('PINコードを変更しました');
  };

  const handleExportData = () => {
    const backupData = buildBackupData(db);
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(backupData));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", `shukudai-post-backup-${getLocalDateString()}.json`);
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
    showToast('バックアップファイルをダウンロードしました');
  };

  const handleImportData = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const importedData = JSON.parse(event.target.result);
        if (!isValidBackupData(importedData)) throw new Error('不正なファイル形式です');
        if (window.confirm('⚠️現在のデータはすべて上書きされます。復元を実行しますか？')) {
          const migrated = migrateData(importedData);
          db.setStudents(migrated.students); db.setTasks(migrated.tasks);
          db.setLogs(migrated.logs); db.setConfig(migrated.config);
          db.setAbsences(migrated.absences);
          db.setDailyCheckIns(migrated.dailyCheckIns);
          db.setForgottenItems(migrated.forgottenItems);
          db.setSupportActions(migrated.supportActions);
          db.setClassActions(migrated.classActions);
          db.setFamilyContacts(migrated.familyContacts);
          db.setSchemaVersion(migrated.schemaVersion);
          showToast('データを復元しました');
        }
      } catch (error) { showToast('ファイルの読み込みに失敗しました', 'error'); }
      e.target.value = null;
    };
    reader.readAsText(file);
  };

  const handleYearlyReset = () => {
    const inputPin = window.prompt('【⚠️警告：データの初期化】\n新年度に向けて、名簿・課題・提出・きもち・出欠・忘れ物・児童支援・学級改善・家庭連携の記録をすべて完全に削除します。\n（※実行前に必ず「バックアップを保存」してください）\n\n本当に初期化する場合は、先生用PINコードを入力してください。');
    if (inputPin === null) return;
    if (inputPin === db.config.pin) {
      db.setStudents([]); db.setTasks([]); db.setLogs([]); db.setAbsences([]);
      db.setDailyCheckIns([]); db.setForgottenItems([]); db.setSupportActions([]); db.setClassActions([]); db.setFamilyContacts([]);
      showToast('データを初期化し、新年度の準備が完了しました');
    } else {
      showToast('PINコードが違うため初期化をキャンセルしました', 'error');
    }
  };

  const handlePrintReport = () => {
    if (!reportStartDate || !reportEndDate || reportStartDate > reportEndDate) {
      showToast('レポートの期間を正しく設定してください', 'error');
      return;
    }
    const targetStudents = reportStudentId === 'all'
      ? db.students
      : db.students.filter(student => student.id === reportStudentId);
    if (targetStudents.length === 0) {
      showToast('レポートを作成する児童を選択してください', 'error');
      return;
    }
    const data = generateReportData(
      reportStartDate,
      reportEndDate,
      targetStudents,
      db.tasks,
      db.logs,
      db.dailyCheckIns,
      db.forgottenItems,
      db.absences,
      db.supportActions
    );
    onGenerateReport(data, { start: reportStartDate, end: reportEndDate }, reportTemplate);
    setTimeout(() => window.print(), 500);
  };

  return (
    <div className={`flex flex-col h-full bg-slate-50 animate-fade-in-up ${isPrinting ? 'hidden' : ''}`}>
      <div className="flex justify-between items-center p-5 bg-white shadow-sm z-20">
        <h2 className="font-bold text-lg text-slate-800 flex items-center gap-2">
          <GraduationCap className="text-red-500" size={24} /> 先生用メニュー
        </h2>
        <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 bg-slate-100 rounded-full transition-all active:scale-95"><X size={20} /></button>
      </div>
      
      <div className="flex overflow-x-auto p-4 gap-2 bg-white border-b border-slate-200 flex-shrink-0 hide-scrollbar">
        {[
          { id: 'dashboard', icon: <Activity size={16}/>, label: 'ダッシュボード' },
          { id: 'class-insights', icon: <Sparkles size={16}/>, label: '学級改善' },
          { id: 'forgotten', icon: <Backpack size={16}/>, label: '忘れ物・準備' },
          { id: 'support', icon: <HandHeart size={16}/>, label: '児童支援' },
          { id: 'family', icon: <MessageSquare size={16}/>, label: '家庭連携' },
          { id: 'students', icon: <Users size={16}/>, label: '名簿管理' },
          { id: 'tasks', icon: <CheckCircle2 size={16}/>, label: '課題ルール' },
          { id: 'report', icon: <Printer size={16}/>, label: 'レポート印刷' },
          { id: 'settings', icon: <ShieldAlert size={16}/>, label: '設定' }
        ].map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-sm whitespace-nowrap transition-all ${activeTab === tab.id ? 'bg-red-500 text-white shadow-md' : 'bg-slate-100 text-slate-500 hover:bg-slate-200 hover:shadow-sm'}`}>
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-4 relative">
        {activeTab === 'dashboard' && (
          <div className="space-y-4 animate-fade-in-up">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 bg-white p-4 rounded-2xl shadow-sm border border-slate-100">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-red-50 text-red-500 rounded-lg"><CalendarRange size={20} /></div>
                <span className="font-bold text-slate-700">表示期間</span>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <select value={dashboardPreset} onChange={handleDashboardPresetChange} className="bg-slate-50 border border-slate-200 text-slate-700 rounded-xl p-2 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-red-400 focus:border-transparent transition-all">
                  <option value="today">今日</option>
                  <option value="this_week">今週</option>
                  <option value="this_month">今月</option>
                  <option value="last_month">先月</option>
                  <option value="custom">期間指定</option>
                </select>
                <div className="flex items-center gap-2">
                  <DateInput value={dashboardStart} onChange={e => {setDashboardStart(e.target.value); setDashboardPreset('custom');}} className="bg-slate-50 border border-slate-200 rounded-xl p-2 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-red-400 transition-all" />
                  <span className="text-slate-400 font-bold">〜</span>
                  <DateInput value={dashboardEnd} onChange={e => {setDashboardEnd(e.target.value); setDashboardPreset('custom');}} className="bg-slate-50 border border-slate-200 rounded-xl p-2 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-red-400 transition-all" />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
              <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100 flex flex-col justify-center">
                <h3 className="text-sm font-bold text-slate-400 mb-2">{isSingleDay ? '対象日のアクション率' : '指定期間の課題提出率'}</h3>
                <div className="flex items-end gap-2 mb-2">
                  <span className="text-4xl font-bold text-slate-800">{isSingleDay ? singleDaySubmitRate : multiSubmitRate}</span><span className="text-lg text-slate-500 font-bold mb-1">%</span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-3 mb-2 overflow-hidden">
                  <div className={`h-full rounded-full transition-all duration-1000 ease-out ${ (isSingleDay ? singleDaySubmitRate : multiSubmitRate) >= 80 ? 'bg-green-500' : (isSingleDay ? singleDaySubmitRate : multiSubmitRate) >= 50 ? 'bg-amber-400' : 'bg-red-400'}`} style={{width: `${isSingleDay ? singleDaySubmitRate : multiSubmitRate}%`}}></div>
                </div>
                <p className="text-xs text-slate-500 font-bold">{isSingleDay ? `${db.students.length}名中 ${actedStudentsCount}名 が操作済み` : `全課題 ${multiTotalRequired}件中 ${multiTotalSubmitted}件 提出`}</p>
              </div>
              <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100">
                 <h3 className="text-sm font-bold text-slate-400 mb-3">{isSingleDay ? '対象日の「きもち」' : '期間内の「きもち」分布'}</h3>
                 <div className="grid grid-cols-4 gap-2">
                   {Object.entries(FEELING_CONFIG).map(([label, config]) => {
                     const Icon = config.icon;
                     return (
                       <div key={label} className={`${config.bgClass} rounded-xl p-2 flex flex-col items-center text-center transition-transform hover:scale-105`}>
                         <Icon size={24} className={`mb-1 ${config.colorClass}`} />
                         <span className={`text-lg font-bold ${config.colorClass}`}>{isSingleDay ? singleDayFeelingCounts[label] : multiFeelingCounts[label] || 0}</span>
                       </div>
                     );
                   })}
                 </div>
              </div>
              <button type="button" onClick={() => setActiveTab('forgotten')} className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100 text-left hover:border-red-200 hover:shadow-md transition-all group">
                <h3 className="text-sm font-bold text-slate-400 mb-3 flex items-center gap-2"><Backpack size={16} className="text-red-400" /> 忘れ物・学習準備</h3>
                <div className="flex items-end gap-2">
                  <span className="text-4xl font-bold text-slate-800">{dashboardForgottenItems.length}</span>
                  <span className="text-sm text-slate-400 font-bold mb-1">件 / {dashboardForgottenStudents}名</span>
                </div>
                <p className="text-xs text-slate-500 font-bold mt-3 group-hover:text-red-500 transition-colors">クリックして記録・分析を開く →</p>
              </button>
              <button type="button" onClick={() => setActiveTab('support')} className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100 text-left hover:border-indigo-200 hover:shadow-md transition-all group">
                <h3 className="text-sm font-bold text-slate-400 mb-3 flex items-center gap-2"><HandHeart size={16} className="text-indigo-500" /> 実施中の支援</h3>
                <div className="flex items-end gap-2">
                  <span className="text-4xl font-bold text-slate-800">{activeSupportActions.length}</span>
                  <span className="text-sm text-slate-400 font-bold mb-1">件</span>
                </div>
                <p className={`text-xs font-bold mt-3 ${dueSupportActions.length > 0 ? 'text-red-500' : 'text-slate-500 group-hover:text-indigo-500'}`}>{dueSupportActions.length > 0 ? `振り返り期限 ${dueSupportActions.length}件` : '支援ボードを開く →'}</p>
              </button>
              <button type="button" onClick={() => setActiveTab('class-insights')} className="bg-gradient-to-br from-teal-600 to-cyan-600 rounded-2xl p-5 shadow-sm text-left text-white hover:shadow-md transition-all group">
                <h3 className="text-sm font-bold text-cyan-100 mb-3 flex items-center gap-2"><Sparkles size={16} /> 学級改善プラン</h3>
                <div className="flex items-end gap-2">
                  <span className="text-4xl font-bold">{activeClassActions.length}</span>
                  <span className="text-sm text-cyan-100 font-bold mb-1">件実施中</span>
                </div>
                <p className={`text-xs font-bold mt-3 ${dueClassActions.length > 0 ? 'text-amber-200' : 'text-cyan-100'}`}>{dueClassActions.length > 0 ? `振り返り時期 ${dueClassActions.length}件` : 'インサイトを確認 →'}</p>
              </button>
            </div>

            {dueFamilyContacts.length > 0 && (
              <button type="button" onClick={() => setActiveTab('family')} className="w-full bg-blue-50 border border-blue-200 rounded-2xl p-4 flex items-center justify-between gap-4 text-left hover:bg-blue-100 transition-colors">
                <div className="flex items-center gap-3"><div className="p-2 bg-blue-600 text-white rounded-xl"><MessageSquare size={19} /></div><div><p className="font-bold text-blue-900">家庭連携の確認時期です</p><p className="text-xs text-blue-700 mt-1">確認予定日を迎えた記録が{dueFamilyContacts.length}件あります。</p></div></div>
                <span className="text-sm font-bold text-blue-700 whitespace-nowrap">確認する →</span>
              </button>
            )}

            {/* 🗓️ 出欠サマリー（1日表示のみ） */}
            {isSingleDay && db.students.length > 0 && (
              <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100">
                <h3 className="text-xs font-bold text-slate-400 mb-3 flex items-center gap-1.5">
                  <UserCheck size={14} className="text-green-500" /> 出欠サマリー
                  <span className="ml-1 text-slate-300 font-normal">（クリックして状態を変更できます）</span>
                </h3>
                <div className="flex gap-2 flex-wrap">
                  {[
                    { key: '出席', bgClass: 'bg-green-50 border-green-200 text-green-700', Icon: UserCheck },
                    { key: '遅刻', bgClass: 'bg-amber-50 border-amber-200 text-amber-700', Icon: Clock },
                    { key: '欠席', bgClass: 'bg-red-50 border-red-200 text-red-700', Icon: UserX },
                    { key: '未確認', bgClass: 'bg-slate-50 border-slate-200 text-slate-500', Icon: Circle },
                  ].map(({ key, bgClass, Icon }) => (
                    <div key={key} className={`flex items-center gap-2 px-4 py-2 rounded-xl border font-bold text-sm ${bgClass}`}>
                      <Icon size={16} />
                      <span>{key}</span>
                      <span className="text-lg ml-1">{singleDayAttendance[key] || 0}<span className="text-xs ml-0.5 font-normal">名</span></span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden flex flex-col">
              <div className="p-4 bg-slate-50 border-b border-slate-100 font-bold text-slate-700 text-sm flex justify-between items-center z-10">
                <span className="flex items-center gap-2"><ClipboardList size={18} className="text-slate-500" /> {isSingleDay ? '対象日の提出状況一覧' : '指定期間の提出・きもち集計一覧'}</span>
                {isSingleDay
                  ? <span className="text-xs font-normal text-slate-500 bg-white px-2 py-1 rounded shadow-sm">📌 課題バッジをクリックで提出記録を編集</span>
                  : <span className="text-xs font-normal text-slate-500 bg-white px-2 py-1 rounded shadow-sm">※未提出が目立ちます</span>
                }
              </div>
              <div className="overflow-x-auto overflow-y-auto max-h-[500px]">
                <table className="w-full text-left border-collapse min-w-[600px]">
                  <thead className="sticky top-0 z-10 bg-slate-50 shadow-sm border-b border-slate-200">
                    <tr className="text-xs text-slate-500 font-bold uppercase tracking-wider">
                      <th className="p-4 w-1/4">児童名</th>
                      {isSingleDay && <th className="p-4 w-28">出欠</th>}
                      <th className="p-4 w-1/4">きもち</th>
                      <th className="p-4 w-1/2">{isSingleDay ? '課題（クリックで提出記録を編集）' : '期間内の課題（提出回数 / 必要回数）'}</th>
                      <th className="p-4 text-center w-24">{isSingleDay ? '完了状態' : '達成率'}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {isSingleDay && singleDayData.map((data) => (
                      <tr key={data.student.id} className="hover:bg-slate-50 transition-colors">
                        <td className="p-4 font-bold text-slate-800 whitespace-nowrap">{data.student.name}</td>

                        {/* 🗓️ 出欠列 */}
                        <td className="p-4 whitespace-nowrap align-top">
                          {data.attendanceStatus === '出席' ? (
                            <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-50 border border-green-200 text-green-700 rounded-lg text-xs font-bold">
                              <UserCheck size={13} /> 出席
                            </span>
                          ) : data.attendanceStatus === '欠席' ? (
                            <div className="flex flex-col gap-1.5">
                              <span className="inline-flex items-center gap-1 px-2 py-1 bg-red-50 border border-red-200 text-red-700 rounded-lg text-xs font-bold">
                                <UserX size={13} /> 欠席
                              </span>
                              <button onClick={() => handleClearAbsence(data.student.id, data.student.name)} className="text-xs text-slate-400 hover:text-slate-600 font-bold underline text-left">取り消し</button>
                            </div>
                          ) : data.attendanceStatus === '遅刻' ? (
                            <div className="flex flex-col gap-1.5">
                              <span className="inline-flex items-center gap-1 px-2 py-1 bg-amber-50 border border-amber-200 text-amber-700 rounded-lg text-xs font-bold">
                                <Clock size={13} /> 遅刻
                              </span>
                              <button onClick={() => handleClearAbsence(data.student.id, data.student.name)} className="text-xs text-slate-400 hover:text-slate-600 font-bold underline text-left">取り消し</button>
                            </div>
                          ) : (
                            <div className="flex flex-col gap-1.5">
                              <span className="text-xs text-slate-300 font-bold">未確認</span>
                              <div className="flex gap-1">
                                <button onClick={() => handleMarkAbsence(data.student.id, data.student.name, '欠席')} className="px-2 py-1 bg-red-50 border border-red-200 text-red-600 rounded-lg text-xs font-bold hover:bg-red-100 active:scale-95 transition-all">欠席</button>
                                <button onClick={() => handleMarkAbsence(data.student.id, data.student.name, '遅刻')} className="px-2 py-1 bg-amber-50 border border-amber-200 text-amber-600 rounded-lg text-xs font-bold hover:bg-amber-100 active:scale-95 transition-all">遅刻</button>
                              </div>
                            </div>
                          )}
                        </td>

                        <td className="p-4 whitespace-nowrap">
                          {data.feelingData ? (
                            <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full border ${data.feelingData.bg} ${data.feelingData.color} text-sm font-bold shadow-sm`}>
                              {(() => {
                                const Icon = data.feelingData.icon;
                                return <Icon size={16} />;
                              })()} {data.feelingData.label}
                            </div>
                          ) : (
                            <span className="text-slate-300 text-sm font-bold">-</span>
                          )}
                        </td>

                        {/* 📝 インタラクティブな課題バッジ（クリックで提出記録を編集） */}
                        <td className="p-4">
                          {data.tasks.length === 0 ? (
                            <span className="text-slate-400 text-sm font-bold bg-slate-100 px-3 py-1 rounded-lg">対象課題なし</span>
                          ) : (
                            <div className="flex flex-wrap gap-2">
                              {data.tasks.map(t => (
                                <button
                                  key={t.name}
                                  onClick={() => t.done
                                    ? handleRemoveSubmission(data.student.id, t.name, dashboardStart)
                                    : handleAddManualSubmission(data.student.id, data.student.name, t.name, dashboardStart)
                                  }
                                  title={t.done ? 'クリックで提出記録を取り消す' : 'クリックで提出を記録する'}
                                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-bold border shadow-sm transition-all active:scale-95 hover:scale-105 cursor-pointer ${t.done ? 'bg-green-50 border-green-200 text-green-700 hover:bg-red-50 hover:border-red-200 hover:text-red-600' : 'bg-red-50 border-red-200 text-red-600 hover:bg-green-50 hover:border-green-200 hover:text-green-700'}`}
                                >
                                  {t.done ? <CheckCircle2 size={16} className="text-green-500" /> : <Circle size={16} className="text-red-400" />}
                                  {t.name}
                                  {t.done
                                    ? <MinusCircle size={12} className="opacity-30 ml-0.5" />
                                    : <PlusCircle size={12} className="opacity-30 ml-0.5" />
                                  }
                                </button>
                              ))}
                            </div>
                          )}
                        </td>

                        <td className="p-4 text-center whitespace-nowrap">
                           {data.tasks.length === 0 ? (
                              <span className="text-slate-300 font-bold text-sm">-</span>
                           ) : data.isAllDone ? (
                              <span className="inline-flex items-center justify-center bg-green-500 text-white p-1.5 rounded-full shadow-sm"><Check size={18}/></span>
                           ) : data.isPartial ? (
                              <span className="inline-flex px-3 py-1.5 bg-amber-100 text-amber-700 rounded-lg text-xs font-bold shadow-sm border border-amber-200">一部提出</span>
                           ) : (
                              <span className="inline-flex px-3 py-1.5 bg-slate-100 text-slate-500 rounded-lg text-xs font-bold shadow-sm border border-slate-200">未着手</span>
                           )}
                        </td>
                      </tr>
                    ))}

                    {!isSingleDay && multiDayData.map((data) => (
                      <tr key={data.student.id} className="hover:bg-slate-50 transition-colors">
                        <td className="p-4 font-bold text-slate-800 whitespace-nowrap">{data.student.name}</td>
                        <td className="p-4 whitespace-nowrap">
                          <div className="flex gap-2">
                            {Object.entries(FEELING_CONFIG).map(([label, config]) => {
                              const count = data.feelings[label];
                              if (count === 0) return null;
                              const Icon = config.icon;
                              return (
                                <div key={label} className={`flex items-center gap-1.5 px-2 py-1 rounded-lg border ${config.bgClass} ${config.colorClass} text-xs font-bold shadow-sm`}>
                                   <Icon size={14} /> {count}回
                                </div>
                              );
                            })}
                            {Object.values(data.feelings).every(v => v === 0) && <span className="text-slate-300 text-sm font-bold">-</span>}
                          </div>
                        </td>
                        <td className="p-4">
                          <div className="flex flex-wrap gap-2">
                            {data.taskStats.filter(t => t.required > 0 || t.submitted > 0).map(t => (
                              <div key={t.name} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-bold border shadow-sm ${t.unsubmitted === 0 && t.required > 0 ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-600'}`}>
                                {t.unsubmitted === 0 && t.required > 0 ? <CheckCircle2 size={16} className="text-green-500" /> : <Circle size={16} className="text-red-400" />}
                                {t.name} {t.submitted}/{t.required}
                              </div>
                            ))}
                            {data.taskStats.filter(t => t.required > 0 || t.submitted > 0).length === 0 && <span className="text-slate-400 text-sm font-bold bg-slate-100 px-3 py-1 rounded-lg">対象課題なし</span>}
                          </div>
                        </td>
                        <td className="p-4 text-center whitespace-nowrap">
                          {(() => {
                            const req = data.taskStats.reduce((acc, t) => acc + t.required, 0);
                            const sub = data.taskStats.reduce((acc, t) => acc + t.submitted, 0);
                            const rate = req > 0 ? Math.round((sub / req) * 100) : 0;
                            return <span className={`font-bold text-lg ${rate === 100 && req > 0 ? 'text-green-500' : 'text-slate-700'}`}>{rate}%</span>;
                          })()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'class-insights' && (
          <ClassInsightsPanel
            db={db}
            showToast={showToast}
            today={todayStrForDash}
            currentStart={classInsightCurrentStart}
            currentEnd={classInsightCurrentEnd}
            previousStart={classInsightPreviousStart}
            previousEnd={classInsightPreviousEnd}
            currentReports={classInsightCurrentReports}
            previousReports={classInsightPreviousReports}
          />
        )}

        {activeTab === 'forgotten' && (
          <ForgottenItemsPanel
            students={db.students}
            records={db.forgottenItems || []}
            setRecords={db.setForgottenItems}
            showToast={showToast}
          />
        )}

        {activeTab === 'support' && (
          <StudentSupportPanel db={db} showToast={showToast} />
        )}

        {activeTab === 'family' && (
          <FamilyEngagementPanel db={db} showToast={showToast} />
        )}

        {activeTab === 'students' && (
          <div className="space-y-4 animate-fade-in-up">
            <form onSubmit={handleAddStudent} className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 flex flex-col gap-3">
              <h3 className="text-sm font-bold text-slate-600">個別に児童を追加</h3>
              <div className="flex gap-2">
                <input type="text" placeholder="出席番号 (例: 1)" value={newStudent.id} onChange={e=>setNewStudent({...newStudent, id: e.target.value})} className="w-1/3 bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-red-400 transition-all" />
                <input type="text" placeholder="名前 (例: 山田 太郎)" value={newStudent.name} onChange={e=>setNewStudent({...newStudent, name: e.target.value})} className="flex-1 bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-red-400 transition-all" />
              </div>
              <button type="submit" className="bg-slate-800 text-white font-bold py-3 rounded-xl transition-all active:scale-95 flex items-center justify-center gap-2 hover:bg-slate-700 shadow-sm"><Plus size={18} /> 追加する</button>
            </form>

            <form onSubmit={handleAddBulkStudents} className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 flex flex-col gap-3">
              <h3 className="text-sm font-bold text-slate-600">児童の一括追加</h3>
              <p className="text-xs text-slate-500">名前を改行して入力してください。出席番号は現在の最大番号から連番で割り振られます。</p>
              <textarea 
                placeholder="山田 太郎&#13;&#10;佐藤 花子" 
                value={bulkStudents} 
                onChange={e=>setBulkStudents(e.target.value)} 
                className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-red-400 transition-all h-24 resize-none" 
              />
              <button type="submit" className="bg-slate-800 text-white font-bold py-3 rounded-xl transition-all active:scale-95 flex items-center justify-center gap-2 hover:bg-slate-700 shadow-sm">
                <Plus size={18} /> 児童を一括追加する
              </button>
            </form>

            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 divide-y divide-slate-100">
              <div className="p-4 bg-slate-50 border-b border-slate-100 font-bold text-slate-700 text-sm">現在の名簿</div>
              {db.students.map(s => (
                <div key={s.id} className="flex justify-between items-center p-4 hover:bg-slate-50 transition-colors">
                  {editingStudentId === s.id ? (
                    <div className="flex-1 flex items-center gap-2 mr-2 animate-fade-in-up">
                      <input 
                        type="text" 
                        value={editStudentData.id} 
                        onChange={e => setEditStudentData({...editStudentData, id: e.target.value})} 
                        className="w-16 bg-white border border-slate-300 rounded-lg p-2 text-sm font-bold focus:outline-none focus:border-red-400 shadow-sm" 
                        placeholder="番号"
                      />
                      <input 
                        type="text" 
                        value={editStudentData.name} 
                        onChange={e => setEditStudentData({...editStudentData, name: e.target.value})} 
                        className="flex-1 bg-white border border-slate-300 rounded-lg p-2 text-sm font-bold focus:outline-none focus:border-red-400 shadow-sm" 
                        placeholder="名前"
                      />
                      <button onClick={() => handleUpdateStudent(s.id)} className="p-2.5 bg-green-50 text-green-600 rounded-lg hover:bg-green-100 transition-colors shadow-sm">
                        <Save size={18} />
                      </button>
                      <button onClick={() => setEditingStudentId(null)} className="p-2.5 bg-slate-100 text-slate-500 rounded-lg hover:bg-slate-200 transition-colors shadow-sm">
                        <X size={18} />
                      </button>
                    </div>
                  ) : (
                    <>
                      <div>
                        <span className="text-xs font-bold text-red-500 bg-red-50 px-2.5 py-1.5 rounded-lg mr-3 border border-red-100">{s.id}</span>
                        <span className="font-bold text-slate-700">{s.name}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <button onClick={() => startEditStudent(s)} className="text-slate-400 hover:text-indigo-500 transition-all active:scale-90 p-2 rounded-full hover:bg-indigo-50">
                          <Pencil size={18} />
                        </button>
                        <button onClick={() => handleDeleteStudentSecure(s.id)} className="text-slate-400 hover:text-red-500 transition-all active:scale-90 p-2 rounded-full hover:bg-red-50">
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ))}
              {db.students.length === 0 && <div className="p-6 text-center text-slate-400 font-bold">児童が登録されていません</div>}
            </div>
          </div>
        )}

        {activeTab === 'tasks' && (
          <div className="space-y-4 animate-fade-in-up">
            <form onSubmit={handleAddTask} className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 flex flex-col gap-3">
              <h3 className="text-sm font-bold text-slate-600">課題ルールの追加</h3>
              <select
                value={newTask.type}
                onChange={e => {
                  const type = e.target.value;
                  // タイプ切り替え時に適切な初期値をセット（日付指定なら今日の日付）
                  const value = type === '日付指定' ? getLocalDateString() : type === '曜日固定' ? '月' : type === '週回数' ? '1' : '';
                  setNewTask({ ...newTask, type, value });
                }}
                className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-red-400 transition-all">
                <option value="日付指定">日付指定</option>
                <option value="毎日（平日）">毎日（平日）</option>
                <option value="曜日固定">曜日固定</option>
                <option value="週回数">週の回数指定</option>
              </select>
              
              {newTask.type === '曜日固定' && (
                <select value={newTask.value} onChange={e=>setNewTask({...newTask, value: e.target.value})} className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm focus:outline-none focus:ring-2 focus:ring-red-400 transition-all animate-fade-in-up">
                  {['月','火','水','木','金'].map(d=><option key={d} value={d}>{d}曜日</option>)}
                </select>
              )}
              {newTask.type === '日付指定' && (
                <DateInput value={newTask.value} onChange={e=>setNewTask({...newTask, value: e.target.value})} className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm focus:outline-none focus:ring-2 focus:ring-red-400 transition-all animate-fade-in-up" />
              )}
              {newTask.type === '週回数' && (
                <div className="flex items-center gap-3 animate-fade-in-up">
                  <span className="text-sm font-bold text-slate-600">週に</span>
                  <input type="number" min="1" max="7" value={newTask.value || '1'} onChange={e=>setNewTask({...newTask, value: e.target.value})} className="w-20 bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm text-center font-bold focus:outline-none focus:ring-2 focus:ring-red-400 transition-all" />
                  <span className="text-sm font-bold text-slate-600">回やる</span>
                </div>
              )}

              <input type="text" placeholder="課題名 (例: 音読)" value={newTask.name} onChange={e=>setNewTask({...newTask, name: e.target.value})} className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-red-400 transition-all" />
              <button type="submit" className="bg-slate-800 text-white font-bold py-3 rounded-xl transition-all active:scale-95 flex items-center justify-center gap-2 hover:bg-slate-700 shadow-sm"><Plus size={18} /> 追加する</button>
            </form>
            
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 divide-y divide-slate-100">
              <div className="p-4 bg-slate-50 border-b border-slate-100 font-bold text-slate-700 text-sm">現在のルール</div>
              {db.tasks.filter(t => !t.archived).map(t => (
                <div key={t.id} className="p-4 hover:bg-slate-50 transition-colors">
                  <div className="flex justify-between items-center">
                    {editingTaskId === t.id ? (
                      <div className="flex-1 flex items-center gap-2 mr-2 animate-fade-in-up">
                        <span className="text-xs font-bold text-indigo-500 bg-indigo-50 px-2 py-1 rounded-md border border-indigo-100 flex-shrink-0">
                          {t.type} {t.value && `(${t.value})`}
                        </span>
                        <input
                          type="text"
                          value={editTaskData.name}
                          onChange={e => setEditTaskData({...editTaskData, name: e.target.value})}
                          className="flex-1 bg-white border border-slate-300 rounded-lg p-2 text-sm font-bold focus:outline-none focus:border-red-400 shadow-sm"
                          placeholder="課題名"
                        />
                        <button onClick={() => handleUpdateTask(t.id, t.name)} className="p-2.5 bg-green-50 text-green-600 rounded-lg hover:bg-green-100 transition-colors shadow-sm flex-shrink-0">
                          <Save size={18} />
                        </button>
                        <button onClick={() => setEditingTaskId(null)} className="p-2.5 bg-slate-100 text-slate-500 rounded-lg hover:bg-slate-200 transition-colors shadow-sm flex-shrink-0">
                          <X size={18} />
                        </button>
                      </div>
                    ) : (
                      <>
                        <div>
                          <span className="text-xs font-bold text-indigo-500 bg-indigo-50 px-2 py-1 rounded-md mr-3 border border-indigo-100">
                            {t.type} {t.value && `(${t.value})`}
                          </span>
                          <span className="font-bold text-slate-700">{t.name}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => { setExcludeEditTaskId(excludeEditTaskId === t.id ? null : t.id); setExcludeDateInput(getLocalDateString()); }}
                            title="おやすみ日（この日は提出不要）を設定"
                            className={`transition-all active:scale-90 p-2 rounded-full ${excludeEditTaskId === t.id ? 'text-amber-500 bg-amber-50' : 'text-slate-400 hover:text-amber-500 hover:bg-amber-50'}`}>
                            <CalendarOff size={18} />
                          </button>
                          <button onClick={() => startEditTask(t)} className="text-slate-400 hover:text-indigo-500 transition-all active:scale-90 p-2 rounded-full hover:bg-indigo-50">
                            <Pencil size={18} />
                          </button>
                          <button onClick={() => handleDeleteTaskSecure(t.id)} className="text-slate-400 hover:text-red-500 transition-all active:scale-90 p-2 rounded-full hover:bg-red-50">
                            <Trash2 size={18} />
                          </button>
                        </div>
                      </>
                    )}
                  </div>

                  {/* 🌟 おやすみ日の一覧チップ */}
                  {(t.excludeDates || []).length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-3">
                      {(t.excludeDates || []).map(d => (
                        <span key={d} className="inline-flex items-center gap-1 px-2 py-1 bg-amber-50 border border-amber-200 text-amber-700 rounded-lg text-xs font-bold">
                          <CalendarOff size={12} /> {d}
                          <button onClick={() => handleRemoveExcludeDate(t.id, d)} title="おやすみ設定を取り消す" className="ml-0.5 text-amber-400 hover:text-red-500 transition-colors">
                            <X size={12} />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}

                  {/* 🌟 おやすみ日の追加エディタ */}
                  {excludeEditTaskId === t.id && (
                    <div className="mt-3 p-3 bg-amber-50/60 border border-amber-200 rounded-xl animate-fade-in-up">
                      <p className="text-xs text-amber-700 font-bold mb-2">「今日だけ宿題なし」など、提出しなくてよい日を追加できます。（必要回数にも数えられません）</p>
                      <div className="flex items-center gap-2">
                        <DateInput value={excludeDateInput} onChange={e => setExcludeDateInput(e.target.value)} className="bg-white border border-amber-200 rounded-xl p-2 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-amber-400 transition-all" />
                        <button onClick={() => handleAddExcludeDate(t.id)} className="px-4 py-2 bg-amber-500 text-white rounded-xl text-sm font-bold hover:bg-amber-400 transition-all active:scale-95 shadow-sm flex items-center gap-1.5">
                          <Plus size={16} /> おやすみ日に追加
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
              {db.tasks.filter(t => !t.archived).length === 0 && <div className="p-6 text-center text-slate-400 font-bold">ルールが設定されていません</div>}
            </div>

            {/* 🗄️ 終了（削除）した課題：記録は保持され、レポートに反映される */}
            {db.tasks.some(t => t.archived) && (
              <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
                <button onClick={() => setShowArchivedTasks(v => !v)} className="w-full p-4 bg-slate-50 font-bold text-slate-500 text-sm flex justify-between items-center hover:bg-slate-100 transition-colors">
                  <span className="flex items-center gap-2"><Archive size={16} /> 終了した課題（提出記録・集計は保持されています）</span>
                  <span className="text-xs bg-white px-2 py-1 rounded-lg shadow-sm">{db.tasks.filter(t => t.archived).length}件 {showArchivedTasks ? '▲' : '▼'}</span>
                </button>
                {showArchivedTasks && (
                  <div className="divide-y divide-slate-100 animate-fade-in-up">
                    {db.tasks.filter(t => t.archived).map(t => (
                      <div key={t.id} className="flex justify-between items-center p-4">
                        <div>
                          <span className="text-xs font-bold text-slate-400 bg-slate-100 px-2 py-1 rounded-md mr-3 border border-slate-200">
                            {t.type} {t.value && `(${t.value})`}
                          </span>
                          <span className="font-bold text-slate-500">{t.name}</span>
                          {t.archivedAt && <span className="ml-2 text-xs text-slate-400">（{t.archivedAt} 終了）</span>}
                        </div>
                        <div className="flex items-center gap-1">
                          <button onClick={() => handleRestoreTask(t.id)} title="ルールを復元する" className="text-slate-400 hover:text-green-600 transition-all active:scale-90 p-2 rounded-full hover:bg-green-50">
                            <ArchiveRestore size={18} />
                          </button>
                          <button onClick={() => handlePermanentDeleteTask(t.id)} title="レポート集計からも完全に削除する" className="text-slate-400 hover:text-red-500 transition-all active:scale-90 p-2 rounded-full hover:bg-red-50">
                            <Trash2 size={18} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {activeTab === 'report' && (
          <div className="space-y-4 animate-fade-in-up">
            <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-900 p-6 rounded-3xl shadow-lg text-white relative overflow-hidden">
              <FileText size={150} className="absolute -right-8 -bottom-10 opacity-10" />
              <div className="relative z-10">
                <span className="text-xs font-bold tracking-[0.18em] text-indigo-200">REPORT CENTER</span>
                <h3 className="text-2xl font-bold mt-2">レポートセンター</h3>
                <p className="text-sm font-bold text-slate-300 mt-2 max-w-2xl leading-relaxed">目的に合わせて、学期末の提出レポート、保護者面談サマリー、校内支援会議資料を作成します。</p>
              </div>
            </div>

            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 space-y-6">
              <div>
                <h4 className="text-sm font-bold text-slate-700 mb-3">1. 資料の種類</h4>
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                  {[
                    { id: 'term', title: '学期末レポート', detail: '提出状況と朝のきもちを詳しく共有', badge: '従来形式', tone: 'red' },
                    { id: 'family', title: '保護者面談サマリー', detail: '学習・生活・学校の支援をA4一枚に集約', badge: 'おすすめ', tone: 'indigo' },
                    { id: 'internal', title: '校内支援ケース資料', detail: '事実・支援・振り返り期限を校内で検討', badge: '校内限定', tone: 'amber' },
                  ].map(template => {
                    const selected = reportTemplate === template.id;
                    const selectedClass = template.tone === 'red'
                      ? 'border-red-400 bg-red-50 ring-red-100'
                      : template.tone === 'amber'
                        ? 'border-amber-400 bg-amber-50 ring-amber-100'
                        : 'border-indigo-500 bg-indigo-50 ring-indigo-100';
                    return (
                      <button key={template.id} type="button" onClick={() => setReportTemplate(template.id)} className={`text-left p-4 rounded-2xl border-2 transition-all ${selected ? `${selectedClass} ring-4` : 'border-slate-100 hover:border-slate-200 bg-white'}`}>
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-bold text-slate-800">{template.title}</span>
                          <span className="text-[10px] font-bold bg-white/80 border border-slate-200 text-slate-500 px-2 py-1 rounded-full">{template.badge}</span>
                        </div>
                        <p className="text-xs text-slate-500 mt-2 leading-relaxed">{template.detail}</p>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_280px] gap-4">
                <div>
                  <h4 className="text-sm font-bold text-slate-700 mb-3">2. 集計期間</h4>
                  <div className="flex items-center gap-3 bg-slate-50 p-4 rounded-xl border border-slate-200">
                    <div className="flex-1">
                      <label className="block text-xs font-bold text-slate-500 mb-1">開始日</label>
                      <DateInput value={reportStartDate} onChange={e=>setReportStartDate(e.target.value)} className="w-full bg-white border border-slate-200 rounded-xl p-3 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-indigo-300 transition-all shadow-sm" />
                    </div>
                    <div className="text-slate-400 font-bold mt-5">〜</div>
                    <div className="flex-1">
                      <label className="block text-xs font-bold text-slate-500 mb-1">終了日</label>
                      <DateInput value={reportEndDate} onChange={e=>setReportEndDate(e.target.value)} className="w-full bg-white border border-slate-200 rounded-xl p-3 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-indigo-300 transition-all shadow-sm" />
                    </div>
                  </div>
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-700 mb-3">3. 対象児童</h4>
                  <select value={reportStudentId} onChange={event => setReportStudentId(event.target.value)} className="w-full bg-white border border-slate-200 rounded-xl p-3.5 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-indigo-300">
                    <option value="all">クラス全員（{db.students.length}名）</option>
                    {db.students.map(student => <option key={student.id} value={student.id}>{student.id}. {student.name}</option>)}
                  </select>
                  <p className="text-[11px] text-slate-400 mt-2">児童ごとにA4一枚で出力します。</p>
                </div>
              </div>

              {reportTemplate !== 'term' && (
                <div className={`text-xs p-4 rounded-xl border leading-relaxed ${reportTemplate === 'internal' ? 'bg-amber-50 border-amber-200 text-amber-800' : 'bg-indigo-50 border-indigo-100 text-indigo-800'}`}>
                  <p className="font-bold flex items-center gap-2"><ShieldAlert size={16} /> {reportTemplate === 'internal' ? '校内限定資料です' : '共有範囲を安全に制御します'}</p>
                  <p className="mt-1">{reportTemplate === 'internal' ? '教師の観察事実と振り返り予定日を含みます。印刷物の保管・廃棄に注意してください。' : '教師の内部観察メモと振り返り予定日は掲載せず、集計された事実と学校での具体的な取り組みだけを出力します。'}</p>
                </div>
              )}

              <button onClick={handlePrintReport} className="w-full bg-slate-900 text-white font-bold py-4 rounded-xl transition-all active:scale-[0.99] flex items-center justify-center gap-2 shadow-md hover:bg-slate-800">
                <Printer size={20} /> {reportStudentId === 'all' ? `${db.students.length}名分を` : '選択した児童の資料を'}作成して印刷
              </button>

              <div className="text-xs text-slate-500 bg-slate-50 p-4 rounded-xl border border-slate-200 leading-relaxed">
                <p className="font-bold text-slate-700 mb-1 flex items-center gap-1"><FileText size={14}/> PDF保存</p>
                <p>印刷画面の送信先を<b>「PDFに保存」</b>に変更してください。背景色を出す場合は<b>「背景のグラフィック」</b>を有効にします。共有前に必ず内容を確認してください。</p>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="space-y-4 animate-fade-in-up">
            <form onSubmit={handleChangePin} className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 flex flex-col gap-3">
              <h3 className="text-sm font-bold text-red-500">セキュリティ設定</h3>
              <p className="text-xs text-slate-500 font-bold mb-2">先生用メニューを開くためのPINコード（暗証番号）を変更します。</p>
              <input 
                type="password" 
                placeholder="新しいPINコード (英数字4文字以上)" 
                value={newPin} 
                onChange={e => {
                  const val = e.target.value.replace(/[Ａ-Ｚａ-ｚ０-９]/g, s => String.fromCharCode(s.charCodeAt(0) - 0xFEE0)).replace(/[^a-zA-Z0-9]/g, '');
                  setNewPin(val);
                }} 
                className="bg-red-50 border border-red-200 text-red-700 font-mono tracking-widest font-bold rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-red-400 transition-all" 
              />
              <button type="submit" className="bg-slate-800 text-white font-bold py-3 rounded-xl transition-all active:scale-95 hover:bg-slate-700 shadow-sm">設定を保存</button>
            </form>

            <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 flex flex-col gap-4">
              <h3 className="text-sm font-bold text-slate-600 flex items-center gap-2"><Database size={18}/> データのバックアップと復元</h3>
              <p className="text-xs text-slate-500 font-bold mb-2 leading-relaxed">
                現在のすべてのデータ（名簿・課題・提出記録・設定）をファイルとして保存（バックアップ）したり、保存したファイルから復元することができます。端末の変更時や定期的なデータ保管にご利用ください。
              </p>
              <div className="flex gap-4">
                <button onClick={handleExportData} className="flex-1 bg-indigo-50 text-indigo-700 font-bold py-3 rounded-xl border border-indigo-200 transition-all active:scale-95 flex items-center justify-center gap-2 hover:bg-indigo-100 shadow-sm">
                  <Download size={18} /> バックアップを保存
                </button>
                <input type="file" accept=".json" ref={fileInputRef} onChange={handleImportData} className="hidden" />
                <button onClick={() => fileInputRef.current.click()} className="flex-1 bg-orange-50 text-orange-700 font-bold py-3 rounded-xl border border-orange-200 transition-all active:scale-95 flex items-center justify-center gap-2 hover:bg-orange-100 shadow-sm">
                  <Upload size={18} /> データから復元
                </button>
              </div>
            </div>

            {/* ☁️ Googleドライブ同期（複数端末でのデータ共有） */}
            <div className="bg-white p-5 rounded-2xl shadow-sm border border-sky-200 flex flex-col gap-4">
              <h3 className="text-sm font-bold text-sky-700 flex items-center gap-2"><Cloud size={18} /> 複数端末でのデータ同期（Googleドライブ）</h3>
              <p className="text-xs text-slate-500 font-bold leading-relaxed">
                Googleアカウントでログインすると、名簿・課題・提出記録などをGoogleドライブに自動バックアップし、別の端末（PC・iPad・Chromebook）でも同じデータを引き継げます。
              </p>

              {!drive.clientId ? (
                // ── クライアントID未設定：セットアップ ──
                <div className="bg-sky-50/70 border border-sky-200 rounded-xl p-4 flex flex-col gap-3">
                  <div className="flex items-center gap-2 text-sky-700 font-bold text-sm">
                    <KeyRound size={16} /> はじめの設定（Google クライアントID）
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Google Cloud Console で作成した「OAuth クライアントID」を貼り付けてください。設定方法は
                    <a href="https://github.com/GIGAyama/Homework_barcordreader#-複数端末でのデータ同期googleドライブ連携" target="_blank" rel="noopener noreferrer" className="text-sky-600 underline font-bold inline-flex items-center gap-0.5">README <ExternalLink size={11} /></a>
                    をご覧ください。（この端末にのみ保存され、外部に送信されません）
                  </p>
                  <input
                    type="text"
                    placeholder="xxxxxxxx.apps.googleusercontent.com"
                    value={clientIdInput}
                    onChange={e => setClientIdInput(e.target.value.trim())}
                    className="bg-white border border-sky-200 rounded-xl p-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-sky-400 transition-all"
                  />
                  <button
                    onClick={() => {
                      if (!clientIdInput || !clientIdInput.includes('.apps.googleusercontent.com')) {
                        return showToast('正しいクライアントIDを入力してください', 'error');
                      }
                      drive.setClientId(clientIdInput);
                      showToast('クライアントIDを保存しました');
                    }}
                    className="bg-sky-600 text-white font-bold py-3 rounded-xl transition-all active:scale-95 hover:bg-sky-500 shadow-sm flex items-center justify-center gap-2">
                    <Save size={18} /> 保存して有効にする
                  </button>
                </div>
              ) : (
                // ── クライアントID設定済み：接続・同期の操作 ──
                <div className="flex flex-col gap-3">
                  <div className={`flex items-center justify-between gap-2 px-4 py-3 rounded-xl border text-sm font-bold ${drive.connected ? 'bg-green-50 border-green-200 text-green-700' : 'bg-slate-50 border-slate-200 text-slate-500'}`}>
                    <span className="flex items-center gap-2">
                      {drive.syncing ? <Loader2 size={16} className="animate-spin" /> : drive.connected ? <CheckCircle2 size={16} /> : <Circle size={16} />}
                      {drive.syncing ? '通信中…' : drive.connected ? 'ドライブに接続中' : '未接続'}
                    </span>
                    {drive.lastSyncedAt && (
                      <span className="text-xs font-normal text-slate-400">
                        最終同期: {new Date(drive.lastSyncedAt).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </span>
                    )}
                  </div>

                  {!drive.connected ? (
                    <button onClick={drive.connect} disabled={drive.syncing} className="bg-sky-600 text-white font-bold py-3 rounded-xl transition-all active:scale-95 hover:bg-sky-500 shadow-sm flex items-center justify-center gap-2 disabled:opacity-60">
                      <Link2 size={18} /> Googleでログインして接続
                    </button>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <button onClick={drive.syncNow} disabled={drive.syncing} className="bg-sky-50 text-sky-700 font-bold py-3 rounded-xl border border-sky-200 transition-all active:scale-95 hover:bg-sky-100 shadow-sm flex items-center justify-center gap-2 disabled:opacity-60">
                        <RefreshCw size={16} /> 今すぐ同期
                      </button>
                      <button onClick={drive.backupNow} disabled={drive.syncing} className="bg-indigo-50 text-indigo-700 font-bold py-3 rounded-xl border border-indigo-200 transition-all active:scale-95 hover:bg-indigo-100 shadow-sm flex items-center justify-center gap-2 disabled:opacity-60">
                        <CloudUpload size={16} /> 保存
                      </button>
                      <button onClick={drive.restoreNow} disabled={drive.syncing} className="bg-orange-50 text-orange-700 font-bold py-3 rounded-xl border border-orange-200 transition-all active:scale-95 hover:bg-orange-100 shadow-sm flex items-center justify-center gap-2 disabled:opacity-60">
                        <CloudDownload size={16} /> 復元
                      </button>
                    </div>
                  )}

                  {/* 自動同期トグル */}
                  <label className="flex items-center justify-between gap-3 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl cursor-pointer">
                    <span className="text-sm font-bold text-slate-600 flex items-center gap-2">
                      <RefreshCw size={16} className="text-sky-500" /> 自動同期
                      <span className="text-xs font-normal text-slate-400">（変更を自動保存・起動時に復元確認）</span>
                    </span>
                    <input
                      type="checkbox"
                      checked={drive.autoSync}
                      onChange={e => {
                        drive.setAutoSync(e.target.checked);
                        showToast(e.target.checked ? '自動同期をONにしました' : '自動同期をOFFにしました');
                      }}
                      className="w-11 h-6 appearance-none rounded-full bg-slate-300 checked:bg-sky-500 relative transition-colors cursor-pointer before:content-[''] before:absolute before:top-0.5 before:left-0.5 before:w-5 before:h-5 before:bg-white before:rounded-full before:transition-transform checked:before:translate-x-5"
                    />
                  </label>

                  <div className="flex items-center justify-between gap-2 pt-1">
                    {drive.connected && (
                      <button onClick={drive.disconnect} className="text-xs text-slate-400 hover:text-slate-600 font-bold underline flex items-center gap-1">
                        <Unlink size={13} /> 接続を解除
                      </button>
                    )}
                    <button
                      onClick={() => {
                        if (!window.confirm('クライアントIDの設定を削除します。（同期は使えなくなりますが、端末内のデータは残ります）')) return;
                        if (drive.connected) drive.disconnect();
                        drive.setAutoSync(false);
                        drive.setClientId('');
                        setClientIdInput('');
                        showToast('クライアントIDの設定を削除しました');
                      }}
                      className="text-xs text-slate-400 hover:text-red-500 font-bold underline ml-auto">
                      クライアントIDを変更／削除
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="bg-white p-5 rounded-2xl shadow-sm border border-red-200 flex flex-col gap-4 mt-2">
              <h3 className="text-sm font-bold text-red-600 flex items-center gap-2"><AlertTriangle size={18}/> 年度更新（データ初期化）</h3>
              <p className="text-xs text-slate-500 font-bold leading-relaxed">
                新年度に向けて、現在の「名簿」「課題ルール」「提出記録」をすべて削除し、初期状態に戻します。（PINコードの設定のみ保持されます）<br/>
                <span className="text-red-500 mt-1 inline-block">※この操作は取り消せません。実行前に必ず上記の「バックアップを保存」を行ってください。</span>
              </p>
              <button onClick={handleYearlyReset} className="w-full bg-red-50 text-red-700 font-bold py-3.5 rounded-xl border border-red-200 transition-all active:scale-95 flex items-center justify-center gap-2 hover:bg-red-100 shadow-sm">
                <RefreshCw size={18} /> 全データを消去して新年度を迎える
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// ==========================================
// 🚀 メインアプリケーション
// ==========================================
export default function App() {
  const [view, setView] = useState('standby');
  const [toast, setToast] = useState(null);
  const [currentStudent, setCurrentStudent] = useState(null);
  const [selectedTasks, setSelectedTasks] = useState([]);
  const [authPin, setAuthPin] = useState('');
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);

  const [reportData, setReportData] = useState([]);
  const [reportPeriod, setReportPeriod] = useState({ start: '', end: '' });
  const [reportTemplate, setReportTemplate] = useState('term');

  const [students, setStudents] = useLocalStorage('hp_students', [
    { id: '1', name: 'さとう 花子' },
    { id: '2', name: 'すずき 太郎' }
  ]);
  const [tasks, setTasks] = useLocalStorage('hp_tasks', [
    { id: '1', type: '毎日（平日）', value: '', name: '音読' },
    { id: '2', type: '週回数', value: '3', name: '自主学習' }
  ]);
  const [logs, setLogs] = useLocalStorage('hp_logs', []);
  const [config, setConfig] = useLocalStorage('hp_config', { pin: 'admin' });
  const [absences, setAbsences] = useLocalStorage('hp_absences', []);
  const [dailyCheckIns, setDailyCheckIns] = useLocalStorage('hp_daily_checkins', []);
  const [forgottenItems, setForgottenItems] = useLocalStorage('hp_forgotten_items', []);
  const [supportActions, setSupportActions] = useLocalStorage('hp_support_actions', []);
  const [classActions, setClassActions] = useLocalStorage('hp_class_actions', []);
  const [familyContacts, setFamilyContacts] = useLocalStorage('hp_family_contacts', []);
  const [schemaVersion, setSchemaVersion] = useLocalStorage('hp_schema_version', 1);

  // ☁️ Googleドライブ同期の設定（クライアントID・自動同期のON/OFF）
  const [driveClientId, setDriveClientId] = useLocalStorage('hp_gdrive_client_id', '');
  const [driveAutoSync, setDriveAutoSync] = useLocalStorage('hp_gdrive_autosync', false);

  const db = useMemo(() => ({
    students, setStudents,
    tasks, setTasks,
    logs, setLogs,
    config, setConfig,
    absences, setAbsences,
    dailyCheckIns, setDailyCheckIns,
    forgottenItems, setForgottenItems,
    supportActions, setSupportActions,
    classActions, setClassActions,
    familyContacts, setFamilyContacts,
    schemaVersion, setSchemaVersion,
  }), [students, setStudents, tasks, setTasks, logs, setLogs, config, setConfig, absences, setAbsences, dailyCheckIns, setDailyCheckIns, forgottenItems, setForgottenItems, supportActions, setSupportActions, classActions, setClassActions, familyContacts, setFamilyContacts, schemaVersion, setSchemaVersion]);

  // 旧形式の各記録を、現在のイベントコレクションへ安全に移行する。
  useEffect(() => {
    if (Number(schemaVersion) >= DATA_SCHEMA_VERSION) return;
    const migrated = migrateData({ students, tasks, logs, config, absences, dailyCheckIns, forgottenItems, supportActions, classActions, familyContacts });
    setTasks(migrated.tasks);
    setLogs(migrated.logs);
    setDailyCheckIns(migrated.dailyCheckIns);
    setForgottenItems(migrated.forgottenItems);
    setSupportActions(migrated.supportActions);
    setClassActions(migrated.classActions);
    setFamilyContacts(migrated.familyContacts);
    setSchemaVersion(migrated.schemaVersion);
  }, [schemaVersion, students, tasks, logs, config, absences, dailyCheckIns, forgottenItems, supportActions, classActions, familyContacts, setTasks, setLogs, setDailyCheckIns, setForgottenItems, setSupportActions, setClassActions, setFamilyContacts, setSchemaVersion]);

  const showToastMsg = useCallback((msg, type = 'success') => setToast({ message: msg, type }), []);

  // ☁️ Googleドライブ同期フック（複数端末でのデータ共有）
  const driveSync = useGoogleDriveSync({ db, clientId: driveClientId, autoSync: driveAutoSync, showToast: showToastMsg });
  const drive = useMemo(() => ({
    ...driveSync,
    clientId: driveClientId, setClientId: setDriveClientId,
    autoSync: driveAutoSync, setAutoSync: setDriveAutoSync,
  }), [driveSync, driveClientId, setDriveClientId, driveAutoSync, setDriveAutoSync]);

  const handleScan = useCallback((id) => {
    const student = db.students.find(s => s.id === id);
    if (!student) return showToastMsg('IDがみつかりません', 'error');
    
    const todayStr = getLocalDateString();
    // 手動記録の timestamp は操作時刻のため、週回数の集計は date（対象日）で行う
    const [monStr, sunStr] = getWeekRangeStrs(todayStr);

    const studentTodayLogs = db.logs.filter(l => l.date === todayStr && l.studentId === student.id);
    const studentWeeklyLogs = db.logs.filter(l => l.studentId === student.id && l.date >= monStr && l.date <= sunStr);

    const activeTasks = db.tasks.filter(t => isTaskDueOn(t, todayStr)).map(t => {
      const isDone = studentTodayLogs.some(log => submissionMatchesTask(log, t));
      let weeklyCount = 0;
      let quotaReached = false;
      if (t.type === '週回数') {
         weeklyCount = studentWeeklyLogs.filter(log => submissionMatchesTask(log, t)).length;
         quotaReached = weeklyCount >= parseInt(t.value || 1, 10);
      }
      return { ...t, done: isDone, weeklyCount, quotaReached };
    }).filter(t => {
      if (t.type === '週回数' && !t.done && t.quotaReached) return false;
      return true;
    });

    setCurrentStudent(student);
    setSelectedTasks(activeTasks);
    setView('student');
  }, [db.students, db.tasks, db.logs, showToastMsg]);

  const handleTasksSelected = useCallback((tasks) => {
    setSelectedTasks(tasks);
    setView('feeling');
  }, []);

  const handleFeelingSelect = useCallback((feeling) => {
    const todayStr = getLocalDateString(new Date());
    const timestamp = Date.now();
    const newLogs = selectedTasks.map(task => createSubmissionEvent({
      student: currentStudent,
      task,
      date: todayStr,
      timestamp,
    }));
    db.setLogs(prev => [...prev, ...newLogs]);
    db.setDailyCheckIns(prev => upsertDailyCheckIn(prev, createDailyCheckIn({
      student: currentStudent,
      date: todayStr,
      feeling,
      timestamp,
    })));
    setView('complete');
  }, [selectedTasks, currentStudent, db]);

  const handleAdminLogin = useCallback((e) => {
    e.preventDefault();
    if (authPin === db.config.pin) {
      setShowAuthModal(false);
      setAuthPin('');
      setView('admin');
    } else {
      showToastMsg('PINコードが違います', 'error');
    }
  }, [authPin, db.config.pin, showToastMsg]);

  // 🖨️ 印刷モードの検知（CSSの不具合防止）
  useEffect(() => {
    const handleBeforePrint = () => setIsPrinting(true);
    const handleAfterPrint = () => setIsPrinting(false);
    window.addEventListener('beforeprint', handleBeforePrint);
    window.addEventListener('afterprint', handleAfterPrint);
    return () => {
      window.removeEventListener('beforeprint', handleBeforePrint);
      window.removeEventListener('afterprint', handleAfterPrint);
    };
  }, []);

  return (
    <>
      <div className={`h-screen w-full flex flex-col font-sans overflow-hidden text-slate-800 bg-red-50/40 relative selection:bg-red-200 ${isPrinting ? 'hidden' : ''}`}>
        <GlobalStyles />
        {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
        <Header onAdminClick={() => setShowAuthModal(true)} view={view} />
        
        <main className="flex-1 overflow-y-auto relative z-0">
          {view === 'standby' && <StandbyView onScan={handleScan} />}
          {view === 'student' && <StudentTasksView student={currentStudent} tasks={selectedTasks} onNext={handleTasksSelected} onCancel={() => setView('standby')} />}
          {view === 'feeling' && <FeelingView onFeelingSelect={handleFeelingSelect} />}
          {view === 'complete' && <CompleteView onFinish={() => setView('standby')} />}
          {view === 'admin' && (
            <AdminView
              onClose={() => setView('standby')}
              showToast={showToastMsg}
              db={db}
              drive={drive}
              onGenerateReport={(data, period, template) => {
                setReportData(data);
                setReportPeriod(period);
                setReportTemplate(template);
              }}
              isPrinting={isPrinting}
            />
          )}
        </main>

        {view !== 'admin' && <Footer />}

        {showAuthModal && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex justify-center items-center p-4 animate-fade-in-up">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden flex flex-col">
              <div className="flex justify-between items-center p-5 border-b border-slate-100 bg-slate-50">
                <h3 className="font-bold text-lg text-slate-800 flex items-center gap-2">
                  <GraduationCap className="text-red-500" size={20} /> 先生用メニュー
                </h3>
                <button onClick={() => setShowAuthModal(false)} className="p-2 rounded-full hover:bg-slate-200 text-slate-500 transition-colors focus:outline-none focus:ring-2 focus:ring-slate-300"><X size={20}/></button>
              </div>
              <form onSubmit={handleAdminLogin} className="p-6 flex flex-col gap-5">
                <p className="text-sm text-slate-500 font-bold leading-relaxed">
                  管理画面を開くためのPINコードを入力してください。<br/>
                  （初期値: <span className="text-red-600 bg-red-50 px-1.5 py-0.5 rounded border border-red-200 font-mono">admin</span>）
                </p>
                <input 
                  type="password" 
                  value={authPin} 
                  onChange={e => {
                    const val = e.target.value.replace(/[Ａ-Ｚａ-ｚ０-９]/g, s => String.fromCharCode(s.charCodeAt(0) - 0xFEE0)).replace(/[^a-zA-Z0-9]/g, '');
                    setAuthPin(val);
                  }} 
                  placeholder="****" 
                  autoFocus 
                  className="bg-slate-50 border-2 border-slate-100 rounded-2xl p-4 text-center text-2xl tracking-[0.5em] font-mono focus:border-red-400 focus:outline-none focus:ring-4 focus:ring-red-50 transition-all shadow-inner" 
                />
                <button type="submit" className="bg-slate-800 text-white font-bold py-4 rounded-2xl shadow-md active:scale-95 transition-all hover:bg-slate-700 hover:shadow-lg">認証する</button>
              </form>
            </div>
          </div>
        )}
      </div>

      <PrintReport data={reportData} period={reportPeriod} template={reportTemplate} />
    </>
  );
}
