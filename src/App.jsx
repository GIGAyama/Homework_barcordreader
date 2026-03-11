import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Mailbox, Settings, ScanLine, Calculator, Trash2, CheckCircle2, Circle, X, Users, Activity, Plus, Check, HeartPulse, ShieldAlert, Printer, FileText, Smile, Moon, Zap, CloudRain, PartyPopper, Sparkles, GraduationCap, ClipboardList, CalendarRange, Database, Download, Upload, AlertTriangle, RefreshCw, Pencil, Save } from 'lucide-react';

// ==========================================
// 🎨 グローバルスタイル設定 (CSS)
// ==========================================
const GlobalStyles = () => (
  <style>{`
    @import url('https://fonts.googleapis.com/css2?family=Zen+Maru+Gothic:wght@400;500;700&display=swap');
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

  const setValue = useCallback((value) => {
    try {
      const valueToStore = value instanceof Function ? value(storedValue) : value;
      setStoredValue(valueToStore);
      window.localStorage.setItem(key, JSON.stringify(valueToStore));
    } catch (error) {
      console.error(`Error setting localStorage key "${key}":`, error);
    }
  }, [key, storedValue]);

  return [storedValue, setValue];
};

// ==========================================
// 📊 コアビジネスロジック (レポート計算エンジン)
// ==========================================
const generateReportData = (startDate, endDate, students, tasks, logs) => {
  const start = new Date(startDate);
  const end = new Date(endDate);
  start.setHours(0,0,0,0);
  end.setHours(23,59,59,999);
  
  const taskRequirements = {};
  tasks.forEach(t => taskRequirements[t.name] = 0);
  
  let currentDate = new Date(start);
  const weeks = new Set(); 

  while (currentDate <= end) {
    const day = currentDate.getDay();
    const isWeekday = day >= 1 && day <= 5;
    const dateStr = getLocalDateString(currentDate);
    const dayNames = ['日', '月', '火', '水', '木', '金', '土'];
    const dayStr = dayNames[day];
    
    const diffToMon = currentDate.getDate() - day + (day === 0 ? -6 : 1);
    const mon = new Date(currentDate);
    mon.setDate(diffToMon);
    weeks.add(getLocalDateString(mon));

    tasks.forEach(t => {
      if (t.type === '毎日（平日）' && isWeekday) taskRequirements[t.name]++;
      if (t.type === '曜日固定' && t.value === dayStr) taskRequirements[t.name]++;
      if (t.type === '日付指定' && t.value === dateStr) taskRequirements[t.name]++;
    });
    
    currentDate.setDate(currentDate.getDate() + 1);
  }

  tasks.forEach(t => {
    if (t.type === '週回数') {
      taskRequirements[t.name] += weeks.size * parseInt(t.value || 1, 10);
    }
  });

  return students.map(student => {
    const studentLogs = logs.filter(l => l.studentId === student.id && l.date >= startDate && l.date <= endDate);
    
    const taskStats = tasks.map(t => {
      const required = taskRequirements[t.name] || 0;
      const submitted = studentLogs.filter(l => l.taskName === t.name).length;
      const unsubmitted = Math.max(0, required - submitted);
      const rate = required > 0 ? Math.round((submitted / required) * 100) : 0;
      return { name: t.name, required, submitted, unsubmitted, rate };
    });
    
    const feelings = { 'げんき':0, 'ねむい':0, 'イライラ':0, 'かなしい':0 };
    studentLogs.forEach(l => {
      if (l.feeling && feelings[l.feeling] !== undefined) feelings[l.feeling]++;
    });

    return { student, taskStats, feelings };
  });
};

// ==========================================
// 🧩 汎用UIコンポーネント
// ==========================================
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
const PrintReport = ({ data, period }) => {
  if (!data || data.length === 0) return null;

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
                    <td className="border border-slate-400 p-3 font-bold">{t.name}</td>
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
        <button onClick={() => selected.length > 0 && onNext(tasks.filter(t => selected.includes(t.name)))} disabled={selected.length === 0} 
          className={`py-4 rounded-xl font-bold text-lg transition-all duration-200 active:scale-95 ${selected.length > 0 ? 'bg-red-500 text-white shadow-md hover:bg-red-400' : 'bg-slate-200 text-slate-400 cursor-not-allowed'}`}>
          つぎへ
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
const AdminView = ({ onClose, showToast, db, onGenerateReport, isPrinting }) => {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [newStudent, setNewStudent] = useState({ id: '', name: '' });
  const [bulkStudents, setBulkStudents] = useState('');
  const [newTask, setNewTask] = useState({ type: '毎日（平日）', value: '', name: '' });
  const [newPin, setNewPin] = useState('');
  const fileInputRef = useRef(null);

  // 🌟 編集用ステート
  const [editingStudentId, setEditingStudentId] = useState(null);
  const [editStudentData, setEditStudentData] = useState({ id: '', name: '' });
  
  const [editingTaskId, setEditingTaskId] = useState(null);
  const [editTaskData, setEditTaskData] = useState({ name: '' });

  // 日付の初期化
  const todayForDash = useMemo(() => new Date(), []);
  const todayStrForDash = useMemo(() => getLocalDateString(todayForDash), [todayForDash]);
  
  const [reportStartDate, setReportStartDate] = useState(() => getLocalDateString(new Date(todayForDash.getFullYear(), todayForDash.getMonth(), 1)));
  const [reportEndDate, setReportEndDate] = useState(() => getLocalDateString(new Date(todayForDash.getFullYear(), todayForDash.getMonth() + 1, 0)));

  const [dashboardPreset, setDashboardPreset] = useState('today');
  const [dashboardStart, setDashboardStart] = useState(todayStrForDash);
  const [dashboardEnd, setDashboardEnd] = useState(todayStrForDash);

  const isSingleDay = dashboardStart === dashboardEnd;

  // 🚀 【最適化】1日表示用のデータをメモ化
  const { singleDayData, singleDaySubmitRate, singleDayFeelingCounts, actedStudentsCount } = useMemo(() => {
    if (!isSingleDay) return { singleDayData: [], singleDaySubmitRate: 0, singleDayFeelingCounts: {}, actedStudentsCount: 0 };
    
    const targetDateObj = new Date(dashboardStart);
    const diffToMon = targetDateObj.getDate() - targetDateObj.getDay() + (targetDateObj.getDay() === 0 ? -6 : 1);
    const monday = new Date(targetDateObj); monday.setDate(diffToMon); monday.setHours(0,0,0,0);
    const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6); sunday.setHours(23,59,59,999);
    const targetDayNames = ['日', '月', '火', '水', '木', '金', '土'];
    const targetDayStr = targetDayNames[targetDateObj.getDay()];
    const isTargetWeekday = targetDateObj.getDay() >= 1 && targetDateObj.getDay() <= 5;

    const data = db.students.map(student => {
      const studentTargetLogs = db.logs.filter(l => l.date === dashboardStart && l.studentId === student.id);
      const studentWeeklyLogs = db.logs.filter(l => l.studentId === student.id && l.timestamp >= monday.getTime() && l.timestamp <= sunday.getTime());

      const activeTasks = db.tasks.filter(t => {
        if (t.type === '毎日（平日）' && !isTargetWeekday) return false;
        if (t.type === '曜日固定' && t.value !== targetDayStr) return false;
        if (t.type === '日付指定' && t.value !== dashboardStart) return false;
        return true;
      }).map(t => {
        const isDone = studentTargetLogs.some(l => l.taskName === t.name);
        let weeklyCount = 0;
        let quotaReached = false;
        if (t.type === '週回数') {
           weeklyCount = studentWeeklyLogs.filter(l => l.taskName === t.name).length;
           quotaReached = weeklyCount >= parseInt(t.value || 1, 10);
        }
        return { ...t, done: isDone, weeklyCount, quotaReached };
      }).filter(t => {
        if (t.type === '週回数' && !t.done && t.quotaReached) return false;
        return true;
      });

      const sortedTargetLogs = [...studentTargetLogs].sort((a, b) => b.timestamp - a.timestamp);
      const latestFeeling = sortedTargetLogs.find(l => l.feeling)?.feeling || null;
      let feelingData = null;
      if (latestFeeling && FEELING_CONFIG[latestFeeling]) {
        const config = FEELING_CONFIG[latestFeeling];
        feelingData = { label: latestFeeling, icon: config.icon, color: config.colorClass, bg: config.bgClass };
      }

      const completedTasksCount = activeTasks.filter(t => t.done).length;
      const totalTasksCount = activeTasks.length;
      const isAllDone = totalTasksCount > 0 && completedTasksCount === totalTasksCount;
      const isPartial = completedTasksCount > 0 && completedTasksCount < totalTasksCount;

      return { student, tasks: activeTasks, feelingData, isAllDone, isPartial };
    });

    const actedCount = data.filter(d => d.tasks.some(t => t.done) || d.feelingData).length;
    const rate = db.students.length > 0 ? Math.round((actedCount / db.students.length) * 100) : 0;
    
    const counts = { 'げんき': 0, 'ねむい': 0, 'イライラ': 0, 'かなしい': 0 };
    data.forEach(d => { if (d.feelingData) counts[d.feelingData.label]++; });

    return { singleDayData: data, singleDaySubmitRate: rate, singleDayFeelingCounts: counts, actedStudentsCount: actedCount };
  }, [dashboardStart, db.students, db.tasks, db.logs, isSingleDay]);

  // 🚀 【最適化】複数日表示用のデータをメモ化
  const { multiDayData, multiSubmitRate, multiTotalRequired, multiTotalSubmitted, multiFeelingCounts } = useMemo(() => {
    if (isSingleDay) return { multiDayData: [], multiSubmitRate: 0, multiTotalRequired: 0, multiTotalSubmitted: 0, multiFeelingCounts: {} };
    
    const data = generateReportData(dashboardStart, dashboardEnd, db.students, db.tasks, db.logs);
    let rate = 0, req = 0, sub = 0;
    const counts = { 'げんき': 0, 'ねむい': 0, 'イライラ': 0, 'かなしい': 0 };
    
    data.forEach(d => {
      d.taskStats.forEach(t => { req += t.required; sub += t.submitted; });
      Object.keys(counts).forEach(k => { counts[k] += d.feelings[k]; });
    });
    rate = req > 0 ? Math.round((sub / req) * 100) : 0;

    return { multiDayData: data, multiSubmitRate: rate, multiTotalRequired: req, multiTotalSubmitted: sub, multiFeelingCounts: counts };
  }, [dashboardStart, dashboardEnd, db.students, db.tasks, db.logs, isSingleDay]);


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
    if (!newTask.name) return showToast('課題名を入力してください', 'error');
    if (newTask.type === '曜日固定' && !newTask.value) newTask.value = '月';
    if (newTask.type === '週回数' && !newTask.value) newTask.value = '1';
    
    db.setTasks([...db.tasks, { id: Date.now().toString(), ...newTask }]);
    setNewTask({ type: '毎日（平日）', value: '', name: '' });
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
    
    // 課題名の更新
    const updatedTasks = db.tasks.map(t => t.id === taskId ? { ...t, name: newName } : t);
    db.setTasks(updatedTasks);

    // 過去のログ（提出記録）も新しい課題名に一括更新
    const updatedLogs = db.logs.map(l => l.taskName === oldName ? { ...l, taskName: newName } : l);
    db.setLogs(updatedLogs);

    setEditingTaskId(null);
    showToast('課題ルールを更新しました');
  };

  const handleDeleteTaskSecure = (id) => {
    const inputPin = window.prompt('【誤操作防止】\n本当に削除する場合は、先生用PINコードを入力してください。');
    if (inputPin === null) return;
    if (inputPin === db.config.pin) {
      db.setTasks(db.tasks.filter(x => x.id !== id));
      showToast('課題を削除しました');
    } else {
      showToast('PINコードが違うため削除をキャンセルしました', 'error');
    }
  };

  const handleChangePin = (e) => {
    e.preventDefault();
    if (newPin.length < 4) return showToast('PINは4文字以上で設定してください', 'error');
    db.setConfig({ ...db.config, pin: newPin });
    setNewPin('');
    showToast('PINコードを変更しました');
  };

  const handleExportData = () => {
    const backupData = {
      students: db.students, tasks: db.tasks, logs: db.logs, config: db.config,
      exportDate: new Date().toISOString()
    };
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
        if (!importedData.students || !importedData.tasks || !importedData.logs || !importedData.config) throw new Error('不正なファイル形式です');
        if (window.confirm('⚠️現在のデータはすべて上書きされます。復元を実行しますか？')) {
          db.setStudents(importedData.students); db.setTasks(importedData.tasks);
          db.setLogs(importedData.logs); db.setConfig(importedData.config);
          showToast('データを復元しました');
        }
      } catch (error) { showToast('ファイルの読み込みに失敗しました', 'error'); }
      e.target.value = null;
    };
    reader.readAsText(file);
  };

  const handleYearlyReset = () => {
    const inputPin = window.prompt('【⚠️警告：データの初期化】\n新年度に向けて「名簿」「課題ルール」「提出記録」をすべて完全に削除します。\n（※実行前に必ず「バックアップを保存」してください）\n\n本当に初期化する場合は、先生用PINコードを入力してください。');
    if (inputPin === null) return;
    if (inputPin === db.config.pin) {
      db.setStudents([]); db.setTasks([]); db.setLogs([]);
      showToast('データを初期化し、新年度の準備が完了しました');
    } else {
      showToast('PINコードが違うため初期化をキャンセルしました', 'error');
    }
  };

  const handlePrintReport = () => {
    const data = generateReportData(reportStartDate, reportEndDate, db.students, db.tasks, db.logs);
    onGenerateReport(data, { start: reportStartDate, end: reportEndDate });
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
                  <input type="date" value={dashboardStart} onChange={e => {setDashboardStart(e.target.value); setDashboardPreset('custom');}} className="bg-slate-50 border border-slate-200 rounded-xl p-2 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-red-400 transition-all" />
                  <span className="text-slate-400 font-bold">〜</span>
                  <input type="date" value={dashboardEnd} onChange={e => {setDashboardEnd(e.target.value); setDashboardPreset('custom');}} className="bg-slate-50 border border-slate-200 rounded-xl p-2 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-red-400 transition-all" />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden flex flex-col">
              <div className="p-4 bg-slate-50 border-b border-slate-100 font-bold text-slate-700 text-sm flex justify-between items-center z-10">
                <span className="flex items-center gap-2"><ClipboardList size={18} className="text-slate-500" /> {isSingleDay ? '対象日の提出状況一覧' : '指定期間の提出・きもち集計一覧'}</span>
                <span className="text-xs font-normal text-slate-500 bg-white px-2 py-1 rounded shadow-sm">※未提出が目立ちます</span>
              </div>
              <div className="overflow-x-auto overflow-y-auto max-h-[500px]">
                <table className="w-full text-left border-collapse min-w-[600px]">
                  <thead className="sticky top-0 z-10 bg-slate-50 shadow-sm border-b border-slate-200">
                    <tr className="text-xs text-slate-500 font-bold uppercase tracking-wider">
                      <th className="p-4 w-1/4">児童名</th>
                      <th className="p-4 w-1/4">きもち</th>
                      <th className="p-4 w-1/2">{isSingleDay ? '対象日の課題（緑: 提出済 / 赤: 未提出）' : '期間内の課題（提出回数 / 必要回数）'}</th>
                      <th className="p-4 text-center w-24">{isSingleDay ? '完了状態' : '達成率'}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {isSingleDay && singleDayData.map((data) => (
                      <tr key={data.student.id} className="hover:bg-slate-50 transition-colors">
                        <td className="p-4 font-bold text-slate-800 whitespace-nowrap">{data.student.name}</td>
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
                        <td className="p-4">
                          {data.tasks.length === 0 ? (
                            <span className="text-slate-400 text-sm font-bold bg-slate-100 px-3 py-1 rounded-lg">対象課題なし</span>
                          ) : (
                            <div className="flex flex-wrap gap-2">
                              {data.tasks.map(t => (
                                <div key={t.name} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-bold border shadow-sm transition-all ${t.done ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-600 hover:scale-105'}`}>
                                  {t.done ? <CheckCircle2 size={16} className="text-green-500" /> : <Circle size={16} className="text-red-400" />}
                                  {t.name}
                                </div>
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
              <select value={newTask.type} onChange={e=>setNewTask({...newTask, type: e.target.value})} className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-red-400 transition-all">
                <option value="毎日（平日）">毎日（平日）</option>
                <option value="曜日固定">曜日固定</option>
                <option value="日付指定">日付指定</option>
                <option value="週回数">週の回数指定</option>
              </select>
              
              {newTask.type === '曜日固定' && (
                <select value={newTask.value} onChange={e=>setNewTask({...newTask, value: e.target.value})} className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm focus:outline-none focus:ring-2 focus:ring-red-400 transition-all animate-fade-in-up">
                  {['月','火','水','木','金'].map(d=><option key={d} value={d}>{d}曜日</option>)}
                </select>
              )}
              {newTask.type === '日付指定' && (
                <input type="date" value={newTask.value} onChange={e=>setNewTask({...newTask, value: e.target.value})} className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm focus:outline-none focus:ring-2 focus:ring-red-400 transition-all animate-fade-in-up" />
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
              {db.tasks.map(t => (
                <div key={t.id} className="flex justify-between items-center p-4 hover:bg-slate-50 transition-colors">
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
              ))}
              {db.tasks.length === 0 && <div className="p-6 text-center text-slate-400 font-bold">ルールが設定されていません</div>}
            </div>
          </div>
        )}

        {activeTab === 'report' && (
          <div className="space-y-4 animate-fade-in-up">
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex flex-col gap-4">
              <h3 className="text-sm font-bold text-slate-600">学期末レポート（PDF）の作成</h3>
              <p className="text-xs text-slate-500 font-bold mb-2 leading-relaxed">
                指定した期間の「提出状況」と「きもち」を集計し、保護者配布用の個別レポート（A4サイズ1枚ずつ）を作成します。
              </p>
              
              <div className="flex items-center gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
                <div className="flex-1">
                  <label className="block text-xs font-bold text-slate-500 mb-1">開始日</label>
                  <input type="date" value={reportStartDate} onChange={e=>setReportStartDate(e.target.value)} className="w-full bg-white border border-slate-200 rounded-xl p-3 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-red-400 transition-all shadow-sm" />
                </div>
                <div className="text-slate-400 font-bold mt-5">〜</div>
                <div className="flex-1">
                  <label className="block text-xs font-bold text-slate-500 mb-1">終了日</label>
                  <input type="date" value={reportEndDate} onChange={e=>setReportEndDate(e.target.value)} className="w-full bg-white border border-slate-200 rounded-xl p-3 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-red-400 transition-all shadow-sm" />
                </div>
              </div>

              <button onClick={handlePrintReport} className="bg-slate-800 text-white font-bold py-4 rounded-xl transition-all active:scale-95 flex items-center justify-center gap-2 mt-2 shadow-sm hover:bg-slate-700">
                <Printer size={20} /> レポートを作成して印刷（PDF保存）
              </button>
              
              <div className="text-xs text-slate-500 mt-2 bg-indigo-50 p-4 rounded-xl border border-indigo-100 leading-relaxed">
                <p className="font-bold text-indigo-700 mb-2 flex items-center gap-1"><FileText size={14}/> PDF保存のコツ</p>
                <p>印刷画面が開いたら、送信先（プリンター）を<b>「PDFに保存」</b>に変更してください。<br/>※設定で<b>「背景のグラフィック」にチェック</b>を入れると、アイコンの色などが綺麗に出力されます。</p>
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

  const db = useMemo(() => ({ students, setStudents, tasks, setTasks, logs, setLogs, config, setConfig }), [students, setStudents, tasks, setTasks, logs, setLogs, config, setConfig]);
  
  const showToastMsg = useCallback((msg, type = 'success') => setToast({ message: msg, type }), []);

  const handleScan = useCallback((id) => {
    const student = db.students.find(s => s.id === id);
    if (!student) return showToastMsg('IDがみつかりません', 'error');
    
    const today = new Date();
    const todayStr = getLocalDateString(today);
    const dayNames = ['日', '月', '火', '水', '木', '金', '土'];
    const todayDayStr = dayNames[today.getDay()];
    const isWeekday = today.getDay() >= 1 && today.getDay() <= 5;
    
    const diffToMon = today.getDate() - today.getDay() + (today.getDay() === 0 ? -6 : 1);
    const monday = new Date(today); monday.setDate(diffToMon); monday.setHours(0,0,0,0);
    const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6); sunday.setHours(23,59,59,999);

    const studentTodayLogs = db.logs.filter(l => l.date === todayStr && l.studentId === student.id);
    const studentWeeklyLogs = db.logs.filter(l => l.studentId === student.id && l.timestamp >= monday.getTime() && l.timestamp <= sunday.getTime());

    const activeTasks = db.tasks.filter(t => {
      if (t.type === '毎日（平日）' && !isWeekday) return false;
      if (t.type === '曜日固定' && t.value !== todayDayStr) return false;
      if (t.type === '日付指定' && t.value !== todayStr) return false;
      return true;
    }).map(t => {
      const isDone = studentTodayLogs.some(l => l.taskName === t.name);
      let weeklyCount = 0;
      let quotaReached = false;
      if (t.type === '週回数') {
         weeklyCount = studentWeeklyLogs.filter(l => l.taskName === t.name).length;
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
    const newLogs = selectedTasks.map(t => ({
      id: Math.random().toString(36).substr(2, 9),
      date: todayStr,
      studentId: currentStudent.id,
      studentName: currentStudent.name,
      taskName: t.name,
      feeling: feeling,
      timestamp: timestamp
    }));
    db.setLogs([...db.logs, ...newLogs]);
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
              onGenerateReport={(data, period) => { setReportData(data); setReportPeriod(period); }}
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

      <PrintReport data={reportData} period={reportPeriod} />
    </>
  );
}
