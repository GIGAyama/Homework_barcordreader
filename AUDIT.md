# 宿題ポスト 点検記録（GIGA Standard v4）

2026-08-03 時点。すべて**実測**で、推測では書いていない。
測り方が書いていない項目は無い。再現できないものは「未確認」と書く。

計測環境：Chromium 141（Playwright）、820×1180 / DPR 2 と 1280×900 / DPR 2。
本番（`gigayama.github.io`）へはこの作業環境から到達できないため、
`npm run build` の出力をローカルの HTTP サーバーで配って測った。

---

## 1. まとめ

| 区分 | 改修前 | 改修後 |
|---|---|---|
| CSP | 無し | 有り（ワイルドカードは connect-src のみ・理由は §4） |
| コントラスト基準未満 | **63件**（13画面） | **0件** |
| タップ44px未満 | **42件**（13画面） | **0件** |
| CSP違反・JSエラー | 0 / 1件 | 0 / 0件 |
| 画像の合計 | 493.1 KB | **100.4 KB**（-79.6%） |
| Service Worker の登録 | 登録されていた（§3 に訂正あり） | 登録・有効化を実測で確認 |
| オフライン起動 | 未計測 | 起動する（実測） |
| 圏外＋本体未取得 | 白画面 | offline.html が出る（実測） |
| 更新の通知 | 無し（黙って入れ替わる） | 「さいしんに する」を押すまで切り替わらない（実測） |
| maskable アイコン | 桃色の余白付き | 下地を全面に。セーフゾーン外の中身 **0.02%** |
| 品質ゲート | 静的解析・テスト・ビルド | ＋GIGA v4 の機械検査（わざと壊して検知を確認） |

---

## 2. 型と構成

**B型**（Vite + React + Tailwind v4 → GitHub Pages）。
`base` は `/Homework_barcordreader/`。

かつて `code.gs`（Google Apps Script 版、439行）が残っていたが、**削除した**
（2026-08、GAS 版の廃止が確定したため。経緯は §7-1）。
本番は Vite + React 版を GitHub Pages で配信している。

---

## 3. 訂正：Service Worker は元から登録されていた

**このファイルの以前の版には誤りがあった。** 「改修前は Service Worker が一度も
登録されておらず、オフライン対応が入っていなかった」と書いたが、**これは事実ではない。**
元のコードは正しく登録していた。

実際に起きていたのは、**この改修の途中で自分が入れた退行**だった。
登録と「あたらしい版があります」の案内を一体で扱うため、登録を `src/main.jsx` から
React 側（`src/PwaPrompts.jsx` の `useEffect`）へ移したところ、登録されなくなった。
その状態を測って「改修前の姿」と取り違えたのが誤りの中身。

3通りをそれぞれビルドして実測した結果がこれ。

| 登録を書いた場所 | 結果 |
|---|---|
| `main.jsx` の一番外側で `load` を待つ（**改修前のコード**） | `{"登録":true,"active":true,"キャッシュ":["shukudai-post-v2"]}` |
| React の `useEffect` の中で `load` を待つ（**改修の途中**） | `{"登録":false,"active":false,"キャッシュ":[]}` |
| `useEffect` の中で `readyState` を見てから待つ（**現在**） | `{"登録":true,"active":true,"キャッシュ":["shukudai-post-v3"]}` |

理由ははっきりしている。モジュールとして読み込まれる `main.jsx` の本体は
`load` より前に走るのでリスナーが間に合うが、React の effect は描画のあとに走るため、
そのとき `load` はすでに終わっている。

```js
// 動く：load より前にリスナーを付けられる
window.addEventListener('load', () => { navigator.serviceWorker.register(...) });

// 動かない：effect は描画のあと。そのとき load は終わっている
useEffect(() => {
  window.addEventListener('load', () => { navigator.serviceWorker.register(...) });
}, []);
```

現在は必ずこう書いている。

```js
if (document.readyState === 'complete') start();
else window.addEventListener('load', start, { once: true });
```

### この件から残しておくこと

1. **登録を React 側へ移す改修は自然に発生する。** 登録と更新案内は一体で扱いたくなる。
   そのとき `readyState` の分岐が無いと、**ビルドも静的解析も通ったまま静かに壊れる。**
2. **`sw.js` を読んでも分からない。** ブラウザに `navigator.serviceWorker.getRegistration()`
   を問い合わせて初めて出る。表示に関わる改修をしたら、必ず実機・実ブラウザで確かめること。
3. **測った状態が「改修前」なのか「改修の途中」なのかを取り違えない。**
   比較するなら、比較対象のコミットを実際にビルドして測ること。今回はそれを怠った。

改修前の Service Worker にも直すべき点はあった（§5-7 の `skipWaiting()` と
§5-9 の `offline.html`）。ただしそれは「動いていなかった」という話ではない。

## 4. セキュリティ（P0）

### 4-1. CSP を入れた

入れたもの（`index.html`）。

```
default-src 'self';
script-src 'self' https://accounts.google.com;
style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
font-src 'self' https://fonts.gstatic.com;
img-src 'self' data: blob:;
connect-src 'self' https:;
frame-src https://accounts.google.com;
worker-src 'self'; manifest-src 'self';
object-src 'none'; base-uri 'self'; form-action 'self';
```

**`connect-src` だけ `https:` と広い。** 理由を書いておく。

このアプリは、先生が自分で立てた AI プロキシ（Cloud Run など）の URL を
**画面から入力して**使う作りになっている（`src/geminiClient.js`）。
URL は学校ごとに違うので、あらかじめ列挙できない。
列挙できないものを列挙したふりをして `default-src 'self'` で締めると、
**動いていた機能が黙って壊れる。** それは CSP が無いより悪い。

そこで `https:` に限る（`http:` / `data:` / `ws:` は通さない）ことにし、
アプリ側でも `validateProxyUrl()` が HTTPS 以外を弾く二重構えにした。

### 4-2. `frame-ancestors` は `<meta>` では効かない

最初 `frame-ancestors 'none'` を書いたが、実測でこう出た。

```
The Content Security Policy directive 'frame-ancestors' is ignored
when delivered via a <meta> element.
```

**効かないうえに、読み込みのたびに警告が出るだけ**なので外した。
他サイトへの埋め込みを止めるには HTTP ヘッダーが要るが、GitHub Pages では足せない。
独自ドメインや CDN を挟むときに設定すること、と `index.html` にコメントで残した。

### 4-3. Google Fonts は自己ホストしなかった（測ったうえでの判断）

Zen Maru Gothic を `fonts.googleapis.com` から読んでいる。
Digital_textbook では CDN を自己ホストに寄せたので、同じ判断をするか検討し、**しなかった**。

測った数字。

| 方式 | 初回の転送 | リポジトリの重さ |
|---|---|---|
| Google Fonts（現状） | 必要なサブセットだけ（数十〜150KB） | 0 |
| 日本語サブセット一括を自己ホスト | **4.2MB**（3ウェイト分） | 4.2MB |
| 分割サブセットを自己ホスト | 必要な分だけ | **6.6MB**（354ファイル） |

一括自己ホストは、**校内 Wi-Fi で40人が同時に開くという、いちばん避けたい状況を自分で作る。**
分割自己ホストは実行時は良いが、6.6MB／354ファイルを50本のリポジトリに置くのは保守できない。

そして決め手は、**フォントは止まっても動作に影響しない**という点。
Digital_textbook で自己ホストしたのは pdf.js や fabric.js という
**無いと起動しない実行コード**だった。フォントは違う。

代わりに、端末側の日本語フォントを後ろに並べた。

```css
font-family: 'Zen Maru Gothic', 'Hiragino Maru Gothic ProN', 'Yu Gothic UI',
             'Hiragino Kaku Gothic ProN', 'Noto Sans JP', system-ui, sans-serif;
```

この作業環境では `fonts.googleapis.com` が塞がれている（`ERR_CONNECTION_RESET`）ため、
**フィルタリングされた学校とまったく同じ状態で全画面を測ることになった。**
その状態でコントラスト0件・タップ0件・レイアウト崩れ無しを確認している。

### 4-4. 法務

`LICENSE`（MIT）と `.github/dependabot.yml`（月1回・メジャー更新は自動で上げない）を追加した。
`.env` や `.clasp.json` の混入は無し。

---

## 5. 表示・PWA（P1）

### 5-1. 画面の高さ

`h-screen`（= `100vh`）を使っていた。iPad の Safari と Android の Chrome では
アドレスバーの分だけ `100vh` が実際の表示領域より大きくなり、
いちばん下のボタンがバーの下に隠れて押せなくなる。

`100dvh` に変え、古い端末用に `@supports not (height: 100dvh)` を添えた。
実測でシェルの高さ = ウィンドウの高さ（1180px = 1180px）、横スクロール無し。

### 5-2. 安全領域

`viewport-fit=cover` が無く、`env(safe-area-inset-*)` もどこにも無かった。
両方入れ、ヘッダー・フッター・更新の帯に適用した。

### 5-3. 文字サイズ

`clamp()` が1つも無かった。児童が見る画面（ID の表示欄・テンキー・児童名・見出し）を
画面幅から決まる式にした。320px のスマホから電子黒板まで1本の式でまかなう。

### 5-4. 動きと配色の設定

`prefers-reduced-motion` と `forced-colors` に対応していなかった。両方入れた。

`prefers-reduced-motion` は `animation-duration: 0` にすると
`animation-fill-mode: forwards` が効かず、`fadeInUp` を使っている箇所が
**`opacity: 0` のまま消える**。0.01ms を残して「一瞬で最終状態になる」ようにした。

### 5-5. アイコン

`apple-touch-icon` が `icons/icon-192.png`（角丸の外が透明）を指していた。
iOS は apple-touch-icon の透明部分を黒で埋めるため、
**iPad のホーム画面で赤いアイコンの四隅だけが黒く出る。**
透明を持たない専用の `apple-touch-icon.png`（180×180）を作った。

### 5-6. manifest

`id` / `dir` / `display_override` / `launch_handler` / `categories` が無かった。追加した。
`id` / `scope` / `start_url` はいずれも `/Homework_barcordreader/`。

### 5-7. 更新の通知

改修前の `sw.js` は `install` で `skipWaiting()` していた。
つまり**新しい版が来たら、児童が操作している最中でも黙って入れ替わる**。
朝の受付で番号を打っている途中に入れ替わると、その入力は消える。

`skipWaiting()` を外し、画面から `SKIP_WAITING` を送ったときだけ切り替えるようにした。

実測（新しい版を置いて `registration.update()` を呼び、3秒放置）。

```
"押すまで切り替わらない": {
  "3秒間の状態": ["waiting/sw.js"],
  "勝手な再読み込み": 0,
  "案内が出ている": true
},
"押したら切り替わる": {
  "再読み込みされた": true,
  "有効なキャッシュ": ["shukudai-post-v4"],
  "案内は消えた": true
}
```

### 5-8. 他アプリのキャッシュを巻き添えにしないこと

`gigayama.github.io` は数十本のアプリが同じドメインを共有していて、
Cache Storage はドメイン単位なので `caches.keys()` は他アプリのぶんも返す。

この `sw.js` はすでに接頭辞で絞る形に直っていた（PR #18）。
今回は**それが本当に効いているか**を実測した。
他アプリのキャッシュを2つ置いてから版を上げ、`activate` を通した結果。

```
"全部": ["digital-textbook-vendor-v1", "keisan-card-static-1.0.0", "shukudai-post-v4"],
"keisan-card 残った": true,
"digital-textbook 残った": true
```

自アプリの古い版（`shukudai-post-v3`）だけが消えている。

### 5-9. オフライン

`offline.html` が無く、圏外で本体が手元に無いと白画面になっていた。
外部資産に一切頼らない（JavaScript も使わない）ページを追加し、`sw.js` の先読みに入れた。

実測（本体のキャッシュだけ消して圏外にする）。

```
"圏外＋本体なし": {
  "タイトル": "宿題ポスト｜いまはインターネットにつながっていません",
  "見出し": "いまは つながっていません",
  "ボタン": "もう一度 ひらく"
}
```

### 5-10. ホーム画面に追加

`beforeinstallprompt` を捕まえていなかった。
このイベントは React が起動するより前に飛んでくることがあり、
そのとき受け取り手がいないと**捨てられて二度と来ない**。
`<head>` のいちばん上で読む `public/install-hook.js` に置いた。
インライン `<script>` にすると CSP に `'unsafe-inline'` かハッシュが要るので、あえて別ファイルにした。

---

## 6. アクセシビリティと性能（P1・P2）

### 6-1. コントラスト：63件 → 0件

13画面（受付、PIN、先生用の11タブ）を実ブラウザで歩き、
`getComputedStyle` の色と、親をたどって解決した背景色から比を出した。

**測り方で1つ落とし穴があった。** Tailwind v4 は色を `oklch()` で書き出す。
数字だけ拾うと `oklch(0.554 0.046 257.417)` を `rgb(0.554, 0.046, 257.417)` と
読み違え、**どの要素も「ほぼ真っ黒」と判定されて比が 1.0 付近になる。**
`ctx.fillStyle` に代入して読み返しても `oklch` のまま返るので、
**1px 実際に塗って `getImageData` で読む**ことにした。
これで初めて本当の数字が出た（誤報だった「クリア」ボタンが消え、
本当に足りていない63件が見えた）。

直し方は「色相を変えず、面か文字を1〜2段濃くする」。
グラデーションの見出しカードは面を一段濃くして白文字が乗るようにした。
使用不可の状態（`cursor-not-allowed`）は WCAG の対象外なので触っていない。

一括で濃くしたとき、**濃い面の上にある薄い文字まで濃くしてしまい3件が悪化した**。
実測で検出して戻した（`text-slate-200` / `text-slate-300` に）。
一括置換だけで済ませず、必ず測り直すこと。

### 6-2. タップ領域：42件 → 0件

ボタン自体を大きくすると、詰めて組んである先生用の画面が折り返して崩れる。
疑似要素で**当たり判定だけ**を広げる `.tap-44` を使った。見た目は変わらない。

```css
.tap-44::after {
  content: ""; position: absolute; top: 50%; left: 50%;
  transform: translate(-50%, -50%);
  width: 100%; height: 100%; min-width: 44px; min-height: 44px;
}
```

チェックボックスだけはこの手が使えない（`input` は疑似要素を持てない）。
囲みの `<label>` 側で 44px を確保した。

### 6-3. 画像：493.1KB → 100.4KB

| ファイル | 前 | 後 |
|---|---:|---:|
| `icons/icon-512.png` | 260.1 KB | 28.7 KB |
| `icons/icon-192.png` | 44.9 KB | 5.5 KB |
| `favicon.png` | 142.6 KB | 8.8 KB |
| `icons/maskable-512.png` | 144.3 KB | 39.5 KB |
| `icons/maskable-192.png` | 21.7 KB | 15.0 KB |
| `apple-touch-icon.png` | （無し） | 4.2 KB |

色数の少ない絵なのでフルカラーで持つ必要がない。パレット PNG にした。
`favicon.png` は 512×512 だったが、タブとブックマークで使うだけなので 256×256 にした。

### 6-4. maskable アイコン

改修前は「桃色（`#fef2f2`）の余白がついた角丸アイコン」だった。
余白を付ければ確かに欠けはしないが、**切り抜かれた形の内側が桃色で埋まる**ため、
ホーム画面では「桃色の丸の中に小さな赤いアイコン」に見え、
他の GIGA アプリと並べたときだけ縮んで見える。

実測すると、白いポストの絵のうちセーフゾーン外にあったのは **0.91%** だけだった。
つまり**直すべきなのは「欠け」ではなく「桃色の余白」のほう**だった。

下地の赤を端まで伸ばし、絵を 80% にした。セーフゾーン外の中身は **0.02%**。

このとき、下地に単色のグラデーションを敷くと**角丸四角の輪郭が薄い影として残った**
（元の絵の赤は左上が明るく右下が影で暗いため、単色とは合わない）。
元の絵から赤い下地だけを取り出して引き伸ばし、ぼかしたものを下地にすることで解決した。
手順は `scripts/make-maskable.mjs` にコメント付きで残してある。

---

## 7. 判断が要る点（人間が決めること）

### 7-1. `code.gs` をどうするか（決着済み）

439行の Google Apps Script 実装が残っていたが、**GAS 版の廃止が確定したため削除した**（2026-08）。
このアプリは静的ページ（Vite + React → GitHub Pages）へ完全に移行している。

あわせて `quality.config.json` の `securityExceptions.xFrameAllowAll`（`XFrameOptionsMode.ALLOWALL`
を許していた例外）も外した。**例外の理由になっていたファイルが無くなったので、例外も残さない。**

戻したくなったときは git の履歴から取り出せる（削除前の最終版は `code.gs` を含むコミットにある）。

### 7-2. `frame-ancestors`

GitHub Pages では設定できない。独自ドメインや CDN を挟む予定があるなら、
そのときに HTTP ヘッダーで入れること。

### 7-3. AI プロキシと `connect-src`

§4-1 の通り、URL を列挙できない設計なので `https:` にしてある。
もし将来「学校ごとの URL を設定ファイルに固定する」形に変えられるなら、
`connect-src` をその1本に絞れる。

---

## 8. 品質ゲート

`npm run check` は 静的解析 → テスト → 本番ビルド → GIGA v4 の機械検査 の順に走る。

```
Checked 70 files: 0 error(s), 0 warning(s).
```

**「0件でした」だけでは、検査が動いているのか何も見ていないのか区別がつかない。**
そこで7か所をわざと壊し、検知することを確認した。

| わざと壊したもの | 検知 |
|---|---|
| CSP を消す | `CSP_MISSING` |
| `viewport-fit=cover` を外す | `VIEWPORT_FIT` |
| `sw.js` の接頭辞フィルタを外す | `SW_CACHE_WIPE` |
| manifest の `scope` を他アプリのものにする | `PWA_MANIFEST` |
| `prefers-reduced-motion` を消す | `REDUCED_MOTION` |
| `Escape` の処理を消す | `A11Y_ESCAPE` |
| `MANUAL.md` を消す | `LEGAL_FILE_MISSING` + `REQUIRED_FILE_MISSING` |
| `safe-area-inset` をヘッダー等から消す | **検知せず**（下記） |

終了コードは 1 になった。

`safe-area-inset` を検知しなかったのは誤りではない。この検査は
「プロジェクトのどこかで使っているか」を見るもので、
`PwaPrompts.jsx` と `offline.html` に残っていたため成立している。
**個別の要素まで見る検査ではない**ことを承知して使うこと。

### この作業で見つかった、検査そのものの不具合

`scripts/lib/giga-v4-checks.mjs` は他のリポジトリにも配る共通の検査なので、
ここで見つけた3件は正本（Digital_textbook）にも反映した。

1. **`SW_CACHE_WIPE` が取りこぼす。** 削除する式の形を正規表現で追っていたため、
   `(k) => caches.delete(k)` のように引数を括弧で囲む書き方を見落としていた。
   **「消す式」ではなく「自アプリだけに絞る式（`startsWith`）があるか」を見る**形に変えた。
   `CACHE_PREFIX` という定数の有無は根拠にしない（名前だけ定義して全部消すコードが実在した）。
2. **`SW_LOCALSTORAGE` が誤検知する。** 「localStorage は操作しない」という
   注意書きに反応していた。判定の前にコメントを落とすようにした。
3. **`VIEWPORT_100VH` が誤検知する。** `dvh` のフォールバックを後ろにしか探していなかった。
   `@supports not (height: 100dvh) { ... height: 100vh }` のように
   `100vh` をあとに書く形があるため、前方も見るようにした。

---

## 9. 測り直す手順

```bash
npm ci
npm run check          # 静的解析 → テスト → ビルド → 機械検査
npm run icons          # アイコンを作り直す（元絵を差し替えたときだけ）
```

ブラウザでの実測（コントラスト・タップ領域・PWA の挙動）は、
`npm run build` の出力を `/Homework_barcordreader/` 以下に配って Playwright で行った。
CI には入れていない（実ブラウザを起動するため時間がかかる）。
表示に手を入れたときは、手元で測ってから PR を出すこと。
