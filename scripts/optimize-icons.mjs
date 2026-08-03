/**
 * アイコンを軽くし、iPad 用のアイコンを作る。
 *
 * なぜ必要か（2つある）：
 *
 * 1. 画像が重い。icon-512.png が 260KB、favicon.png が 143KB あった。
 *    どちらも「赤い下地に白いポスト」という色数の少ない絵なので、
 *    フルカラーで持つ必要がない。パレット PNG にすると見た目を変えずに
 *    大きく減らせる。40人が同時に開く校内 Wi-Fi では、この差がそのまま
 *    初回表示の待ち時間になる。
 *
 * 2. iPad のホーム画面でアイコンの角が黒くなる。
 *    index.html は apple-touch-icon に icon-192.png を指していたが、
 *    この画像は角丸の外側が透明。iOS は apple-touch-icon の透明部分を
 *    黒で埋めるため、ホーム画面では赤いアイコンの四隅だけが黒く出る。
 *    透明を持たない専用の apple-touch-icon.png（180x180）を用意する。
 *
 *   node scripts/optimize-icons.mjs
 */
import sharp from 'sharp';
import { writeFileSync, statSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PUB = join(ROOT, 'public');

/** 見た目が変わらない範囲で、いちばん色数の少ないパレット PNG を選ぶ */
const palettize = async (src, size) => {
    let best = null;
    for (const colours of [256, 192, 128, 96]) {
        const buf = await sharp(src)
            .resize(size, size)
            .png({ palette: true, colours, effort: 10, compressionLevel: 9 })
            .toBuffer();
        if (!best || buf.length < best.buf.length) best = { buf, colours };
    }
    return best;
};

const targets = [
    ['icons/icon-512.png', 512],
    ['icons/icon-192.png', 192],
    ['favicon.png', 256], // favicon に 512 は要らない。タブとブックマークで使うだけ
];

for (const [rel, size] of targets) {
    const src = join(PUB, rel);
    if (!existsSync(src)) continue;
    const before = statSync(src).size;
    const { buf, colours } = await palettize(src, size);
    // sharp を通して書き直すとパレットが落ちるので、作ったバッファをそのまま書く
    writeFileSync(src, buf);
    console.log(`${rel}  ${(before / 1024).toFixed(1)} KB → ${(buf.length / 1024).toFixed(1)} KB (${colours}色)`);
}

// iPad 用。透明を残さないよう、下地の赤で塗りつぶしてから書き出す。
const apple = await sharp(join(PUB, 'icons', 'icon-512.png'))
    .resize(180, 180)
    .flatten({ background: '#d0392d' })
    .png({ palette: true, colours: 128, effort: 10, compressionLevel: 9 })
    .toBuffer();
writeFileSync(join(PUB, 'apple-touch-icon.png'), apple);
console.log(`apple-touch-icon.png  ${(apple.length / 1024).toFixed(1)} KB（透明なし・180x180）`);
