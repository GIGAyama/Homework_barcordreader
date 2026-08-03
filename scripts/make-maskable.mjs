/**
 * maskable アイコンを作り直す。
 *
 * なぜ必要か：
 *   これまで maskable として配っていた画像は「桃色の余白がついた角丸アイコン」だった。
 *   maskable は Android が端末ごとに違う形（円・角丸四角・しずく型）で切り抜く前提の
 *   画像で、余白を付ければ確かに欠けはしない。ただし切り抜かれた形の内側が
 *   桃色（#fef2f2）で埋まるため、ホーム画面では「桃色の丸の中に小さな赤いアイコン」に
 *   見え、他の GIGA アプリと並べたときだけ明らかに縮んで見える。
 *
 *   実測では、白いポストの絵の 0.91% がセーフゾーン（中央80%の円）の外にあった。
 *   これは角丸四角の縁のアンチエイリアスで、切り抜かれても実害はない。
 *   直すべきなのは「欠け」ではなく「桃色の余白」のほう。
 *
 * どう直すか：
 *   下地の赤をアイコンの端まで伸ばす。元の icon-512.png は角が透明なので、
 *   赤いグラデーションの上に重ねるだけで角が赤で埋まる。
 *   どんな形で切り抜かれても「赤が赤に切られる」だけになり、欠けて見えない。
 *
 *   purpose:"any" のアイコン（icon-192 / icon-512 / favicon）は切り抜かれないので
 *   一切変更しない。
 *
 *   node scripts/make-maskable.mjs
 */
import sharp from 'sharp';
import { existsSync, writeFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'public', 'icons', 'icon-512.png');
const SIZE = 512;

if (!existsSync(SRC)) {
    console.error('[make-maskable] 元画像がありません: ' + SRC);
    process.exit(1);
}

/*
 * 下地は「赤の単色グラデーション」を自分で描くのではなく、元の絵から作る。
 *
 * 単色を敷くと、元の絵の赤（左上が明るく、右下は影で暗い）と微妙に色が合わず、
 * 角丸四角の輪郭が「うっすら四角い影」として残ってしまう。実際に出力して確認した。
 *
 * そこで元の絵から赤い下地だけを取り出し（白いポストと透明な角は、
 * 周囲の赤で塗りつぶす）、それを引き伸ばしてぼかしたものを下地にする。
 * 色が定義上そろうので継ぎ目が出ない。
 */
const background = await (async () => {
    const { data, info } = await sharp(SRC).ensureAlpha().raw()
        .toBuffer({ resolveWithObject: true });
    const { width: W, height: H, channels: C } = info;
    // ここでの「赤」の判定はきつめにする。ゆるくすると、白いポストの縁の
    // アンチエイリアス（薄いピンク）まで赤とみなしてしまい、下地に
    // ポストの形の淡い輪郭が焼き付いて残る。実際にそうなったので直した。
    const isRed = (i) => data[i + 3] >= 250
        && data[i] > 140 && data[i + 1] < 100 && data[i + 2] < 100;

    // 赤くない画素（白いポスト・透明な角）を、同じ行のいちばん近い赤で埋める。
    // 行方向だけで十分埋まる。埋め残しは次の列方向で拾う。
    const fill = (getIndex, outer, inner) => {
        for (let a = 0; a < outer; a++) {
            let last = -1;
            for (let b = 0; b < inner; b++) {
                const i = getIndex(a, b) * C;
                if (isRed(i)) { last = i; continue; }
                if (last >= 0) {
                    data[i] = data[last]; data[i + 1] = data[last + 1];
                    data[i + 2] = data[last + 2]; data[i + 3] = 255;
                }
            }
            for (let b = inner - 1; b >= 0; b--) {
                const i = getIndex(a, b) * C;
                if (isRed(i)) { last = i; continue; }
                if (last >= 0) {
                    data[i] = data[last]; data[i + 1] = data[last + 1];
                    data[i + 2] = data[last + 2]; data[i + 3] = 255;
                }
            }
        }
    };
    fill((y, x) => y * W + x, H, W);
    fill((x, y) => y * W + x, W, H);

    // 引き伸ばして角まで赤で埋め、ぼかして継ぎ目とノイズを消す
    return sharp(data, { raw: { width: W, height: H, channels: C } })
        .resize(Math.round(W * 1.5), Math.round(H * 1.5), { fit: 'fill' })
        .extract({
            left: Math.round(W * 0.25), top: Math.round(H * 0.25),
            width: W, height: H,
        })
        .blur(W / 10)
        .png()
        .toBuffer();
})();

const compose = async (ratio) => {
    const s = Math.round(SIZE * ratio);
    const art = await sharp(SRC).resize(s, s).png().toBuffer();
    return sharp(background).composite([{ input: art, gravity: 'center' }]).png().toBuffer();
};

/**
 * セーフゾーン（中央80%の円）の外に「中身」が何割あるか。
 * 赤い下地（R が G・B より十分大きい）は切り抜かれてよいので中身に数えない。
 */
const contentOutside = async (buf) => {
    const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const { width: W, height: H, channels: C } = info;
    const cx = W / 2, cy = H / 2, R = W * 0.4;
    let out = 0, total = 0;
    for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
            const i = (y * W + x) * C;
            if (data[i + 3] < 16) continue;
            if (data[i] > data[i + 1] + 40 && data[i] > data[i + 2] + 40) continue; // 赤い下地
            total++;
            if (Math.hypot(x - cx, y - cy) > R) out++;
        }
    }
    return out / total;
};

// 絵が収まる倍率を、実際に画素を数えながら大きいほうから探す。
// 「たぶんこれくらい」で決め打つと、端末の切り抜き形によっては欠ける。
let chosen = null;
for (let ratio = 1.00; ratio >= 0.60; ratio -= 0.02) {
    const buf = await compose(ratio);
    const outside = await contentOutside(buf);
    if (outside <= 0.002) { chosen = { ratio, buf, outside }; break; }
}

if (!chosen) {
    console.error('❌ 中身をセーフゾーンに収められなかった。元画像を見直すこと。');
    process.exit(1);
}
const { buf: composed, ratioOut = chosen.outside } = chosen;

for (const [name, size, limit] of [
    ['maskable-512.png', 512, 61440],
    ['maskable-192.png', 192, 20480],
]) {
    let best = null;
    for (const colours of [256, 192, 128, 96, 64]) {
        const buf = await sharp(composed)
            .resize(size, size)
            .png({ palette: true, colours, effort: 10, compressionLevel: 9 })
            .toBuffer();
        best = { buf, colours };
        if (buf.length <= limit) break;
    }
    const out = join(ROOT, 'public', 'icons', name);
    // sharp で再エンコードするとパレットが落ちるため、作ったバッファをそのまま書く
    writeFileSync(out, best.buf);
    console.log(`${name}  ${(statSync(out).size / 1024).toFixed(1)} KB (${best.colours}色)`);
}

console.log(`\n絵の倍率: ${(chosen.ratio * 100).toFixed(0)}%`);
console.log(`セーフゾーン（中央80%の円）の外に出ている「中身」: ${(ratioOut * 100).toFixed(2)}%`);
console.log('✅ 外側は下地の赤だけ。どの形で切り抜かれても欠けて見えない。');
