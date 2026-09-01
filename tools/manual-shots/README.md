# 使い方マニュアルの画面写真を撮り直す

`docs/manual/images/` の 40 枚を組み立てるための一式です。撮り直しのときに
同じ絵を作れるよう、残してあります（note の記事のときは残さず、
「撮り直すときは同じ組み立てからやり直すことになります」と書く羽目になりました）。

```
tools/manual-shots/
├── demo-class.mjs   撮影用のデモ学級を組み立てる。実在する子どもは一人もいません
├── shots.mjs        どの画面をどの順に撮るかのシナリオ
└── README.md        このファイル
```

## 撮り方

```bash
npm ci
npm i --no-save playwright
npm run build

# 本番と同じ形で配る（別のターミナルで動かしたままにする）
node .claude/skills/note-article/scripts/serve.mjs dist 4180 /

# 撮る
node .claude/skills/note-article/scripts/capture.mjs tools/manual-shots/shots.mjs \
     --base http://127.0.0.1:4180/ --out docs/manual/images
rm -f docs/manual/images/report.json
```

撮影の土台（`capture.mjs`）は note-article スキルのものをそのまま使います。
ここに自前の土台を作らないでください。2 つ持つと必ずずれます。

## 気をつけたところ

- **アニメーションは「止める」のではなく「無くす」。** この画面は
  `opacity: 0` から始まる `fadeInUp` で出てきます。`capture.mjs` の `freeze()` は
  その 0 のところで止めるので、中身が写らない絵が並びます。`shots.mjs` は
  `animation: none` を流しこんでいます
- **スクロールする箱は 2 つ入れ子。** 外側（`<main>`）を掴むと、高さを測っても
  窓とほぼ同じ数しか返らず、てっぺんへ戻す指示も内側に届きません。
  内側（先生用メニューの中身）を名指ししています
- **端末の日付は 2026-06-11（木）の朝 8:15 に固定。** 実日付のままだと、
  季節はずれの日付と、その日に出ていない課題が写ります
- **1 回目の読み込みで作られた復元ポイントを消してから開き直す。** 消さないと、
  自動復元ポイントの絵にだけ実日付が写ります
- **「ホームに いれる」は、ブラウザが「入れられる」と言ってきたときだけ出ます。**
  自動操作のブラウザではその合図が来ないので、同じ状態を作ってから撮っています

## 撮れていない画面

- 更新の帯（「あたらしい ばんが あります」）。新しい版が用意できたときにだけ
  出るもので、撮影のためだけに本物の更新を起こすことができません。
  マニュアルでは文章だけで説明しています

## 画像の大きさ

撮ったままだと 40 枚で 13MB あります。横幅 1600px に落として入れ直してください。

```bash
node -e "
const sharp = require('sharp');
const { readdirSync } = require('fs');
for (const f of readdirSync('docs/manual/images').filter(n => n.endsWith('.png'))) {
  const p = 'docs/manual/images/' + f;
  sharp(p).metadata().then(m => sharp(p)
    .resize({ width: Math.min(m.width, 1600), withoutEnlargement: true })
    .png({ compressionLevel: 9, palette: true, quality: 90 })
    .toBuffer().then(b => require('fs').writeFileSync(p, b)));
}
"
```
