/* マニュアル撮影用のデモ学級を組み立てる。
 *
 * 実在する子どもは一人も入っていない。名前はすべて撮影のために作ったもので、
 * アプリが最初から持っている見本（さとう 花子・すずき 太郎）と同じ性質のもの。
 *
 * 端末の日付は 2026-06-11（木）の朝 8:15 に固定して撮る。
 * 記録は 2026-05-11（月）から 2026-06-10（水）まで。
 */

export const TODAY = '2026-06-11';
export const FIXED_TIME = '2026-06-11T08:15:00+09:00';
const START = '2026-05-11';

/* 提出率が 20% に満たなかった日。「おやすみ日の提案」が実際に出ることを確かめるため、
   校外学習で宿題を出さなかった日として作る。 */
const FIELD_TRIP = '2026-06-02';

const NAMES = [
  'あおき ゆうと', 'いしかわ さくら', 'うえだ はると', 'えんどう みなみ',
  'おかもと りく', 'かとう ひなた', 'きむら そうた', 'くどう あかり',
  'こばやし れん', 'さかい ももか', 'しみず ゆい', 'すぎやま かいと',
  'せきぐち のあ', 'そのだ たける', 'たなか みつき', 'ちば りお',
  'つじ こうき', 'てらだ あおい', 'とみた はな', 'なかむら そら',
  'にしお ゆづき', 'ぬまた けんと', 'のぐち ひまり', 'はせがわ りつ',
  'ひらた あさひ', 'ふじもと なぎさ', 'まつだ ゆうき', 'みやざき ことね',
];

/* 撮り直しても同じ絵になるように、乱数は種つきのものを使う。 */
let seed = 20260611;
const rnd = () => {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
};

const ymd = (d) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};
const parse = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const dates = (from, to) => {
  const out = [];
  for (const d = parse(from); ymd(d) <= to; d.setDate(d.getDate() + 1)) out.push(ymd(d));
  return out;
};
const isWeekday = (s) => { const w = parse(s).getDay(); return w >= 1 && w <= 5; };
const at = (date, h, m) => parse(date).setHours(h, m, 0, 0);

export const buildDemoClass = () => {
  const students = NAMES.map((name, i) => ({ id: String(i + 1), name }));

  const tasks = [
    { id: 't1', type: '毎日（平日）', value: '', name: '音読', startDate: START, excludeDates: [] },
    { id: 't2', type: '曜日固定', value: '木', name: '漢字ドリル', startDate: START, excludeDates: [] },
    { id: 't3', type: '週回数', value: '3', name: '自主学習', startDate: START, excludeDates: [] },
    { id: 't4', type: '日付指定', value: TODAY, name: '町たんけんのしおり' },
  ];

  const logs = [];
  const dailyCheckIns = [];
  const absences = [];
  const forgottenItems = [];

  const feelings = ['げんき', 'げんき', 'げんき', 'ねむい', 'ねむい', 'イライラ', 'かなしい'];
  /* 提出がいつも遅れがちな子。「今日の確認候補」と「効果レビュー」を実際に出すため。 */
  const struggling = new Set(['9', '17', '23']);

  let eventNo = 0;
  const id = (prefix) => `${prefix}-demo-${++eventNo}`;

  for (const date of dates(START, '2026-06-10')) {
    if (!isWeekday(date)) continue;

    /* その日の欠席・遅刻。ダッシュボードで出欠の記録が見えるように少しだけ作る。 */
    const absentToday = [];
    if (date === '2026-05-19') absentToday.push(['4', '欠席'], ['21', '遅刻']);
    if (date === '2026-06-04') absentToday.push(['12', '欠席']);
    for (const [studentId, status] of absentToday) {
      const student = students.find((s) => s.id === studentId);
      absences.push({
        id: id('absence'), date, studentId, studentName: student.name, status,
        timestamp: at(date, 8, 20),
      });
    }
    const absentIds = new Set(absentToday.filter(([, s]) => s === '欠席').map(([i]) => i));

    for (const student of students) {
      if (absentIds.has(student.id)) continue;

      /* きもち（朝のチェックイン） */
      if (rnd() < 0.92) {
        dailyCheckIns.push({
          id: id('checkin'), eventType: 'daily-check-in', date,
          studentId: student.id, studentName: student.name,
          feeling: feelings[Math.floor(rnd() * feelings.length)],
          timestamp: at(date, 8, 15 + Math.floor(rnd() * 10)),
        });
      }

      const submit = (task) => logs.push({
        id: id('submission'), eventType: 'submission', date,
        studentId: student.id, studentName: student.name,
        taskId: task.id, taskName: task.name,
        timestamp: at(date, 8, 15 + Math.floor(rnd() * 10)), isManual: false,
      });

      /* 音読（毎日）。6/2 は校外学習で出していないので、ほとんど提出がない。 */
      const base = struggling.has(student.id) ? 0.45 : 0.9;
      if (date === FIELD_TRIP) { if (rnd() < 0.11) submit(tasks[0]); }
      else if (rnd() < base) submit(tasks[0]);

      /* 漢字ドリル（木曜） */
      if (parse(date).getDay() === 4 && rnd() < (struggling.has(student.id) ? 0.5 : 0.88)) submit(tasks[1]);

      /* 自主学習（週3回）。月・水・金に出す子が多い。 */
      const w = parse(date).getDay();
      if ([1, 3, 5].includes(w) && rnd() < (struggling.has(student.id) ? 0.4 : 0.82)) submit(tasks[2]);
    }
  }

  /* 忘れ物の記録。品物と教科の傾向がまとまって見える程度に作る。 */
  const forgotten = [
    ['9', '2026-06-10', '算数', '2', '筆箱', '少し困った', '貸し出し'],
    ['9', '2026-06-08', '国語', '1', '教科書', '参加が難しかった', '友達と共有'],
    ['17', '2026-06-09', '体育', '5', '体育着', '参加が難しかった', '家庭へ連絡'],
    ['17', '2026-06-03', '算数', '2', '筆箱', '少し困った', '貸し出し'],
    ['23', '2026-06-09', '算数', '3', '宿題', '少し困った', '本人と確認'],
    ['23', '2026-06-05', '国語', '1', 'ノート', '少し困った', '代用品'],
    ['5', '2026-06-08', '音楽', '4', 'その他', '影響なし', '貸し出し'],
    ['14', '2026-06-05', '算数', '2', '筆箱', '少し困った', '貸し出し'],
    ['2', '2026-06-04', '総合', '3', 'タブレット', '参加が難しかった', '友達と共有'],
    ['26', '2026-06-02', '体育', '5', '体育着', '少し困った', '代用品'],
    ['9', '2026-05-29', '算数', '2', '筆箱', '少し困った', '貸し出し'],
    ['11', '2026-05-28', '社会', '4', '教科書', '少し困った', '友達と共有'],
    ['17', '2026-05-27', '総合', '3', '充電', '参加が難しかった', '貸し出し'],
    ['23', '2026-05-26', '国語', '1', '宿題', '少し困った', '本人と確認'],
    ['9', '2026-05-22', '算数', '2', '筆箱', '影響なし', '貸し出し'],
    ['20', '2026-05-21', '理科', '3', 'ノート', '少し困った', '代用品'],
    ['17', '2026-05-20', '体育', '5', '体育着', '参加が難しかった', '家庭へ連絡'],
    ['23', '2026-05-18', '算数', '2', '宿題', '少し困った', '本人と確認'],
  ];
  for (const [studentId, date, subject, period, itemName, impact, response] of forgotten) {
    const student = students.find((s) => s.id === studentId);
    forgottenItems.push({
      id: id('forgotten-item'), eventType: 'forgotten-item', date,
      studentId, studentName: student.name,
      itemName, subject, period, impact, response, note: '',
      timestamp: at(date, 9, 30),
    });
  }

  /* 児童支援。効果レビューが「前後を比べられる」状態になるよう、
     14 日ぶんの前と後が取れる日付に置く。 */
  const supportActions = [
    {
      studentId: '9', date: '2026-05-26', category: '学習準備',
      observation: '算数の時間に筆箱を忘れることが月曜に多い。前日に時間割を合わせていないことが多いと本人が話した。',
      action: '帰りの会で、翌日の教科書と筆箱を机の上に出して確認する時間を 2 分とる。',
      goal: '筆箱を持ってきた日が週 4 日以上になる。',
      followUpDate: '2026-06-12',
    },
    {
      studentId: '23', date: '2026-05-28', category: '課題提出',
      observation: '音読カードの提出が週の後半で止まる。家で読んでいるが記録を書き忘れていると話した。',
      action: '朝の受付のあとに、その場でカードへ記入する時間をとる。',
      goal: '音読の提出が週 4 日以上になる。',
      followUpDate: '2026-06-15',
    },
    {
      studentId: '17', date: '2026-06-01', category: '生活・体調',
      observation: '体育の日に体育着を忘れることが続いている。朝の「きもち」で「ねむい」を選ぶ日と重なっている。',
      action: '前日の帰りに体育着を配布物と一緒に手渡しで確認する。',
      goal: '体育の時間に参加できない日をなくす。',
      followUpDate: '2026-06-16',
    },
  ].map((s) => {
    const student = students.find((x) => x.id === s.studentId);
    return {
      id: id('support-action'), eventType: 'support-action', date: s.date,
      studentId: s.studentId, studentName: student.name,
      category: s.category, observation: s.observation, action: s.action, goal: s.goal,
      followUpDate: s.followUpDate, status: '実施中', outcome: '', outcomeRating: null,
      createdAt: at(s.date, 16, 0), updatedAt: at(s.date, 16, 0),
    };
  });

  const familyContacts = [
    {
      studentId: '17', date: '2026-06-01', channel: '電話',
      topic: '体育着の持ち物について',
      sharedFacts: '体育のある日に体育着を忘れる日が 5 月に 3 回あったことをお伝えした。',
      familyResponse: '前の晩に用意する声かけをしてくださるとのことだった。',
      agreement: '学校では前日の帰りに手渡しで確認する。',
      followUpDate: '2026-06-16', staffName: '担任',
    },
    {
      studentId: '9', date: '2026-05-27', channel: '連絡帳',
      topic: '算数の学習の様子',
      sharedFacts: '筆箱を忘れた日に、算数の書き取りが進まないことがあったとお伝えした。',
      familyResponse: '家でも前日に時間割を合わせるよう見てくださるとのことだった。',
      agreement: '帰りの会で持ち物を確認する時間を学級全体でとる。',
      followUpDate: '', staffName: '担任',
    },
  ].map((c) => {
    const student = students.find((x) => x.id === c.studentId);
    return {
      id: id('family-contact'), eventType: 'family-contact', date: c.date,
      studentId: c.studentId, studentName: student.name,
      channel: c.channel, topic: c.topic, sharedFacts: c.sharedFacts,
      familyResponse: c.familyResponse, agreement: c.agreement,
      followUpDate: c.followUpDate, staffName: c.staffName,
      status: c.followUpDate ? '要フォロー' : '完了',
      followUpNote: '', privacyLevel: '校内限定',
      createdAt: at(c.date, 17, 0), updatedAt: at(c.date, 17, 0),
    };
  });

  return {
    hp_students: students,
    hp_tasks: tasks,
    hp_logs: logs,
    hp_absences: absences,
    hp_daily_checkins: dailyCheckIns,
    hp_forgotten_items: forgottenItems,
    hp_support_actions: supportActions,
    hp_class_actions: [],
    hp_family_contacts: familyContacts,
    hp_ai_activity: [],
    hp_config: { pin: 'admin' },
    hp_schema_version: 6,
  };
};
