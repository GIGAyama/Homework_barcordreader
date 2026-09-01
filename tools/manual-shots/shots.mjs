/* 宿題ポスト 使い方マニュアル用の撮影シナリオ。
 *
 *   node .claude/skills/note-article/scripts/capture.mjs tools/manual-shots/shots.mjs \
 *        --base http://127.0.0.1:4180/ --out docs/manual/images
 *
 * 撮る順は、マニュアルの本文の順（01- からの連番）。
 *
 * ⚠️ --strict は付けていない。先生用メニューはどのタブでも本文の頭 300 字が
 *    同じ（題とタブの帯）なので、「同じ画面に見える」の警告が中身の違う絵にも鳴る。
 *    そのぶん、撮ったあとに 1 枚ずつ目で見ること。
 */
import { join } from 'node:path';
import { buildDemoClass, FIXED_TIME, TODAY } from './demo-class.mjs';

export const viewport = { width: 1280, height: 900 };

const MARK_STYLE = '[data-manual-mark]{outline:4px solid #dc2626!important;'
  + 'outline-offset:3px!important;border-radius:12px}';

/* ⚠️ capture.mjs の freeze() は使わない。このアプリの画面は
   opacity:0 から始まる fadeInUp で出てくるので、「止める」と
   その 0 のところで止まり、中身が写らない絵が並ぶ。
   止めるのではなく、animation そのものを無くして素の状態にする。 */
const STILL_STYLE = '*,*::before,*::after{animation:none!important;'
  + 'transition:none!important;caret-color:transparent!important}';

/* ---------------------------------------------------------------- 道具 */

const still = (p) => p.raw.addStyleTag({ content: STILL_STYLE }).then(() => true);

/* 文字でさがして赤い枠で囲む。画面の中の字はなぞらず、囲むだけにする
   （ボタンの位置が変わっても、囲みを引き直せば済む形にしておく）。 */
const markText = (p, text, { nth = 0, up = true } = {}) => p.eval(([t, n, goUp, css]) => {
  const want = t.replace(/\s+/g, '');
  const hit = [...document.querySelectorAll('body *')].filter((el) => {
    const own = (el.textContent || '').replace(/\s+/g, '');
    if (!own.includes(want)) return false;
    return ![...el.children].some((c) => (c.textContent || '').replace(/\s+/g, '').includes(want));
  });
  let el = hit[n];
  if (!el) throw new Error(`囲めなかった（文字）: ${t}`);
  if (goUp) el = el.closest('button,a,label,summary') || el;
  el.setAttribute('data-manual-mark', '1');
  if (!document.getElementById('manual-mark-style')) {
    const style = document.createElement('style');
    style.id = 'manual-mark-style';
    style.textContent = css;
    document.head.appendChild(style);
  }
  el.scrollIntoView({ block: 'center' });
  return true;
}, [text, nth, up, MARK_STYLE]);

const markTitle = (p, title) => p.eval(([t, css]) => {
  const el = [...document.querySelectorAll('[title]')].find((e) => e.title.includes(t));
  if (!el) throw new Error(`囲めなかった（title）: ${t}`);
  el.setAttribute('data-manual-mark', '1');
  if (!document.getElementById('manual-mark-style')) {
    const style = document.createElement('style');
    style.id = 'manual-mark-style';
    style.textContent = css;
    document.head.appendChild(style);
  }
  return true;
}, [title, MARK_STYLE]);

const unmark = (p) => p.eval(() => {
  document.querySelectorAll('[data-manual-mark]').forEach((el) => el.removeAttribute('data-manual-mark'));
  return true;
});

/* ⚠️ スクロールする箱は 2 つ入れ子になっている。外側（<main>）を掴むと、
   高さを測っても窓とほぼ同じ数しか返らず、てっぺんへ戻す指示も内側に届かない。
   内側（先生用メニューの中身）を名指しする。 */
const SCROLLER = 'main [class*="overflow-y-auto"]';

const findFn = `(find, n) => {
  let el;
  if (find.startsWith('text:')) {
    const want = find.slice(5).replace(/\\s+/g, '');
    const hit = [...document.querySelectorAll('body *')].filter((e) => {
      const own = (e.textContent || '').replace(/\\s+/g, '');
      if (!own.includes(want)) return false;
      return ![...e.children].some((c) => (c.textContent || '').replace(/\\s+/g, '').includes(want));
    });
    el = hit[n];
    if (el) el = el.closest('section,form,label,div') || el;
  } else if (find.startsWith('title:')) {
    el = [...document.querySelectorAll('[title]')].filter((e) => e.title.includes(find.slice(6)))[n];
  } else {
    el = document.querySelectorAll(find)[n];
  }
  return el;
}`;

/* 触るところだけを切り出した「寄り」の絵。
   引きの絵だけだと、印刷したときに字が読めない（縦 92mm に押しこまれる）。 */
const closeUp = async (p, out, name, finder, { pad = 24, nth = 0, up = 0 } = {}) => {
  await p.settle();
  const box = await p.eval(([find, n, padding, upTimes, src]) => {
    let el = eval(src)(find, n);
    for (let i = 0; i < upTimes && el?.parentElement; i += 1) el = el.parentElement;
    if (!el) return null;
    el.scrollIntoView({ block: 'center' });
    const r = el.getBoundingClientRect();
    return {
      x: Math.max(0, r.x - padding),
      y: Math.max(0, r.y - padding),
      width: Math.min(window.innerWidth - Math.max(0, r.x - padding), r.width + padding * 2),
      height: Math.min(window.innerHeight - Math.max(0, r.y - padding), r.height + padding * 2),
    };
  }, [finder, nth, pad, up, findFn]);
  if (!box || box.width < 40 || box.height < 30) throw new Error(`寄れなかった: ${finder} [${nth}]`);
  await p.raw.screenshot({ path: join(out, `${name}.png`), clip: box });
  console.log(`  撮った  ${name}.png  （寄り ${Math.round(box.width)}x${Math.round(box.height)}）`);
};

/* 先生用メニューのタブを開く。タブの帯は横に流れるので、押す前に寄せる。 */
const openTab = async (p, label) => {
  await p.eval((t) => {
    const el = [...document.querySelectorAll('button')]
      .find((b) => (b.textContent || '').replace(/\s+/g, '') === t.replace(/\s+/g, ''));
    if (!el) throw new Error(`タブが無い: ${t}`);
    el.scrollIntoView({ block: 'center', inline: 'center' });
    el.click();
    return true;
  }, label);
  await p.sleep(1100);
};

const clickAria = async (p, label) => {
  await p.eval((t) => {
    const el = document.querySelector(`[aria-label="${t}"]`);
    if (!el) throw new Error(`aria-label が無い: ${t}`);
    el.click();
    return true;
  }, label);
  await p.sleep(800);
};

/* 見出しの字が無いアイコンだけのボタンは、title でさがして押す。 */
const clickTitle = async (p, title, { nth = 0 } = {}) => {
  await p.eval(([t, n]) => {
    const el = [...document.querySelectorAll('[title]')].filter((e) => e.title.includes(t))[n];
    if (!el) throw new Error(`title が無い: ${t}`);
    el.scrollIntoView({ block: 'center' });
    el.click();
    return true;
  }, [title, nth]);
  await p.sleep(900);
};

const setSelect = (p, selector, value, { nth = 0 } = {}) => p.eval(([sel, v, n]) => {
  const el = document.querySelectorAll(sel)[n];
  if (!el) throw new Error(`選べなかった: ${sel}`);
  const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
  setter.call(el, String(v));
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
}, [selector, value, nth]);

/* 先生用メニューの中身は、窓ではなく内側の箱がスクロールする。
   その箱の高さぶんだけ窓を縦に伸ばして、1 枚に収める。 */
const toTop = (p) => p.eval((sel) => {
  const c = document.querySelector(sel);
  if (c) c.scrollTop = 0;
  return true;
}, SCROLLER);

const panel = async (p, name, { expect, max = 1600, top = true } = {}) => {
  if (top) await toTop(p);
  const need = await p.eval((sel) => {
    const c = document.querySelector(sel);
    return c ? c.scrollHeight : 0;
  }, SCROLLER);
  await p.resize(1280, Math.max(900, Math.min(max, need + 250)));
  await p.sleep(900);
  /* ⚠️ 窓を伸ばしたあとに、もう一度てっぺんへ戻す。
     伸ばす前に戻しただけだと、組み直しで前の位置が残り、
     見出しの帯が上で切れた絵になる。 */
  if (top) await toTop(p);
  await p.sleep(500);
  await still(p);
  await p.shot(name, { expect });
  await p.resize(1280, 900);
  await p.sleep(500);
};

/* ---------------------------------------------------------------- 本編 */

export default async ({ open, log, out, base }) => {
  const p = await open('main');

  /* 端末の日付を 2026-06-11（木）の朝にそろえる。
     実日付のままだと、季節はずれの日付と、その日に出ていない課題が写る。 */
  await p.raw.clock.setFixedTime(new Date(FIXED_TIME));

  /* デモ学級を入れてから開き直す。実在する子どもは一人も入っていない。 */
  await p.eval((data) => {
    /* 日付を固定する前の 1 回目の読み込みで、実日付の復元ポイントができている。
       残したままだと、その 1 枚にだけ今日の日付が写る。 */
    window.localStorage.removeItem('hp_safety_snapshots_v1');
    window.localStorage.removeItem('hp_safety_snapshot_auto_at');
    for (const [key, value] of Object.entries(data)) {
      window.localStorage.setItem(key, JSON.stringify(value));
    }
    return true;
  }, buildDemoClass());
  await p.raw.reload({ waitUntil: 'networkidle' });
  await p.sleep(2200);
  await still(p);

  log('今日:', TODAY, '/ 配信元:', base);

  /* ── 2 章 アプリを開いて、ホーム画面に入れる ───────────────── */
  await p.resize(900, 1150);
  await p.sleep(600);
  await still(p);
  await p.shot('01-standby', { expect: 'ID NUMBER' });

  /* ホーム画面へ入れる案内は、ブラウザが「入れられる」と言ってきたときだけ出る。
     自動操作のブラウザではその合図が来ないので、同じ状態を作ってから撮る。 */
  await p.eval(() => {
    window.__pwaInstallPrompt = { prompt() {} };
    window.dispatchEvent(new Event('pwa-install-available'));
    return true;
  });
  await p.sleep(500);
  await markText(p, 'ホームに いれる');
  await closeUp(p, out, '02-install-button', 'nav', { pad: 6 });
  await unmark(p);

  /* ── 3 章 先生用メニューを開く（PIN）と、画面の地図 ──────── */
  await p.resize(1280, 900);
  await p.sleep(700);
  await clickAria(p, '先生用メニューをひらく');
  await still(p);
  await p.shot('03-pin', { expect: 'PINコード' });
  await p.setInput('input[type="password"]', 'admin');
  await p.click('認証する');
  await p.sleep(1600);
  await still(p);
  await panel(p, '05-admin-home', { expect: '先生用メニュー' });
  await closeUp(p, out, '06-tabs', '[class*="overflow-x-auto"]', { pad: 8 });

  /* ── 4 章 名簿管理 ─────────────────────────────── */
  await openTab(p, '名簿管理');
  await panel(p, '07-roster', { expect: '名簿' });
  await closeUp(p, out, '08-roster-bulk', 'text:名前を改行して入力してください', { pad: 12, up: 1 });

  /* ── 5 章 課題ルール ───────────────────────────── */
  await openTab(p, '課題ルール');
  await panel(p, '09-task-rules', { expect: '音読' });
  /* 「毎日（平日）」を選んだ形で撮る。開始日の欄は、繰り返す課題のときだけ出る。 */
  await setSelect(p, 'form select', '毎日（平日）');
  await p.sleep(600);
  await closeUp(p, out, '10-task-add', 'text:課題ルールの追加', { pad: 12, up: 1 });

  await clickTitle(p, '課題の期間');
  await markTitle(p, '課題の期間');
  await closeUp(p, out, '11-task-period', 'text:音読', { pad: 30, up: 2 });
  await unmark(p);
  await clickTitle(p, '課題の期間');

  await clickTitle(p, 'おやすみ日（この日は提出不要）');
  await markTitle(p, 'おやすみ日（この日は提出不要）');
  await closeUp(p, out, '12-task-restday', 'text:音読', { pad: 30, up: 2 });
  await unmark(p);
  await clickTitle(p, 'おやすみ日（この日は提出不要）');

  const suggests = await p.eval(() => [...document.querySelectorAll('[title]')]
    .filter((e) => e.title.includes('おやすみ日の提案が')).length);
  log('おやすみ日の提案があるボタンの数:', suggests);
  if (suggests > 0) {
    await clickTitle(p, 'おやすみ日の提案が');
    await markTitle(p, 'おやすみ日の提案が');
    await closeUp(p, out, '13-rest-suggestion', 'text:音読', { pad: 30, up: 2 });
    await unmark(p);
    await clickTitle(p, 'おやすみ日の提案が');
  }

  /* ── 6 章 子どもが毎朝する３つの操作 ──────────────────── */
  await p.eval(() => {
    const h2 = [...document.querySelectorAll('h2')].find((e) => e.textContent.includes('先生用メニュー'));
    if (!h2) throw new Error('先生用メニューの見出しが無い');
    const close = h2.parentElement.querySelector('button');
    if (!close) throw new Error('とじるボタンが無い');
    close.click();
    return true;
  });
  await p.sleep(1000);
  await p.resize(900, 1150);
  await p.sleep(800);
  await still(p);
  for (const n of ['1', '4']) await p.click(n, { exact: true });
  await p.shot('14-keypad', { expect: 'ID NUMBER' });
  await p.click('OK', { exact: true });
  await p.sleep(1000);
  await still(p);
  await p.shot('15-student-tasks', { expect: 'だすもの' });
  await p.click('音読');
  await p.click('自主学習');
  await p.sleep(600);
  await p.shot('16-student-selected', { expect: 'つぎへ' });
  await p.click('つぎへ');
  await p.sleep(900);
  await still(p);
  await p.shot('17-feeling', { expect: 'きもち' });
  await p.click('げんき');
  await p.sleep(700);
  await still(p);
  await p.shot('18-complete', { expect: '提出完了' });
  await p.sleep(3600);

  /* ── 7 章 ダッシュボード ──────────────────────── */
  await p.resize(1280, 900);
  await p.sleep(700);
  await clickAria(p, '先生用メニューをひらく');
  await p.setInput('input[type="password"]', 'admin');
  await p.click('認証する');
  await p.sleep(1600);
  await still(p);
  await panel(p, '19-dashboard', { expect: '表示期間' });
  await p.scrollTo('一部提出');
  await p.sleep(400);
  await closeUp(p, out, '20-dashboard-badge', 'text:一部提出', { pad: 16, up: 1 });

  /* ── 8 章 今日の校務 ───────────────────────── */
  await openTab(p, '今日の校務');
  await panel(p, '21-operations', { expect: '校務' });
  const hasBrief = await p.has('内容を確認');
  log('引き継ぎブリーフ:', hasBrief);
  if (hasBrief) {
    await p.click('内容を確認');
    await p.sleep(900);
    await panel(p, '22-handover', { expect: '引き継ぎ', top: false });
  }

  /* ── 9 章 忘れ物・準備 ─────────────────────── */
  await openTab(p, '忘れ物・準備');
  await panel(p, '23-forgotten-panel', { expect: '忘れた物' });
  await p.scrollTo('かんたん記録');
  await p.sleep(400);
  await closeUp(p, out, '24-forgotten-record', 'text:かんたん記録', { pad: 14, up: 1 });

  /* ── 10 章 児童支援 ───────────────────────── */
  await openTab(p, '児童支援');
  await panel(p, '25-support-candidates', { expect: '今日の確認候補' });
  /* 支援の記録がある子に切り替える。既定のままだと、効果レビューが
     「比較できる支援記録はまだありません」の絵になる。 */
  await p.eval((id) => {
    const el = [...document.querySelectorAll('select')]
      .find((s) => [...s.options].some((o) => o.value === id));
    if (!el) throw new Error('児童を選ぶところが無い');
    const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
    setter.call(el, id);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }, '9');
  await p.sleep(900);
  await p.click('支援を記録');
  await p.sleep(900);
  await panel(p, '26-support-record', { expect: '支援を記録' });
  await p.click('効果レビュー');
  await p.sleep(900);
  await panel(p, '27-support-impact', { expect: '効果レビュー' });
  await p.click('タイムライン');
  await p.sleep(900);
  await panel(p, '28-support-timeline', { expect: 'タイムライン' });

  /* ── 11 章 家庭連携 ───────────────────────── */
  await openTab(p, '家庭連携');
  await panel(p, '29-family', { expect: '家庭' });

  /* ── 12 章 学級改善 ───────────────────────── */
  await openTab(p, '学級改善');
  await panel(p, '30-class-insights', { expect: '改善候補' });
  const canAdopt = await p.has('改善プランに追加');
  log('改善候補があるか:', canAdopt);
  if (canAdopt) {
    await p.click('改善プランに追加');
    await p.sleep(1000);
    await panel(p, '31-class-plan', { expect: '改善プラン' });
  }

  /* ── 13 章 レポート印刷 ───────────────────── */
  await openTab(p, 'レポート印刷');
  await panel(p, '32-report-center', { expect: 'レポートセンター' });

  /* 紙の見本を 1 枚。印刷のときだけ出る紙面なので、
     印刷用の見え方に切り替えてから撮る。 */
  await p.eval(() => { window.print = () => window.dispatchEvent(new Event('beforeprint')); return true; });
  await p.click('保護者面談サマリー');
  await p.sleep(600);
  const selects = await p.eval(() => document.querySelectorAll('select').length);
  log('レポート画面の select 数:', selects);
  await setSelect(p, 'select', '9', { nth: selects - 1 });
  await p.sleep(600);
  await p.click('作成して印刷');
  await p.sleep(1500);
  await p.raw.emulateMedia({ media: 'print' });
  await p.resize(1100, 1180);
  await p.sleep(900);
  await still(p);
  await p.shot('33-report-print', { expect: 'サマリー' });
  await p.raw.emulateMedia({ media: 'screen' });
  /* 印刷の見え方から戻す。afterprint を送らないと、先生用メニューが隠れたままになる。 */
  await p.eval(() => { window.dispatchEvent(new Event('afterprint')); return true; });
  await p.resize(1280, 900);
  await p.sleep(900);

  /* ── 14 章 設定 ─────────────────────────── */
  await openTab(p, '設定');
  await panel(p, '34-settings', { expect: 'PINコード' });
  await closeUp(p, out, '04-pin-change', 'text:セキュリティ設定', { pad: 12 });
  await p.scrollTo('データのバックアップと復元');
  await p.sleep(400);
  await closeUp(p, out, '35-backup', 'text:データのバックアップと復元', { pad: 12 });
  await p.scrollTo('自動復元ポイント');
  await p.sleep(400);
  /* 復元ポイントが 1 つも無いと空の箱になる。手で 1 つ作ってから撮る。 */
  await p.click('今すぐ保存');
  await p.sleep(900);
  await closeUp(p, out, '36-snapshots', 'text:自動復元ポイント', { pad: 12, up: 2 });
  await p.scrollTo('複数端末でのデータ同期');
  await p.sleep(400);
  await closeUp(p, out, '37-drive', 'text:複数端末でのデータ同期', { pad: 12 });
  await p.scrollTo('年度更新');
  await p.sleep(400);
  await closeUp(p, out, '38-year-update', 'text:年度更新（データ初期化）', { pad: 12 });

  /* ── 16 章 AI 教師支援 ─────────────────────── */
  await openTab(p, 'AI教師支援');
  await panel(p, '39-ai-panel', { expect: 'AI' });

  /* ── 17 章 困ったときには（つながっていないときの画面） ──── */
  await p.raw.goto(`${base}offline.html`, { waitUntil: 'networkidle' });
  await p.resize(900, 1000);
  await p.sleep(800);
  await still(p);
  await p.shot('40-offline', { expect: 'つながって' });
};
