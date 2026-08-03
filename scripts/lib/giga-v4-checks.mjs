/**
 * GIGA Standard v4 Part I（表示・PWA・セキュリティ・性能）の機械的な検査。
 *
 * scripts/lib/project-quality.mjs は SchoolPlan_Editor の正本をそのまま
 * コピーしたもので、GAS 向けの共通検査が入っている。あちらは一字も変えず、
 * このファイルで「静的サイト型（Vite + React）に必要な検査」を足す。
 * こうしておくと、正本が更新されたときに丸ごと差し替えるだけで済む。
 *
 * 判定の考え方：
 *   error   … 児童の手元で実害が出る、または他アプリを壊す
 *   warning … 直したほうがよいが、動かなくなるわけではない
 */
import fs from 'node:fs';
import path from 'node:path';

const read = (root, rel) => {
    const p = path.join(root, rel);
    return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null;
};

const issue = (severity, code, message, file = null, line = null) =>
    ({ severity, code, message, file, line });

const lineOf = (source, index) => source.slice(0, index).split('\n').length;

const walk = (dir, ignore, out = []) => {
    if (!fs.existsSync(dir)) return out;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (e.isDirectory()) {
            if (ignore.has(e.name)) continue;
            walk(path.join(dir, e.name), ignore, out);
        } else {
            out.push(path.join(dir, e.name));
        }
    }
    return out;
};

export function runGigaV4Checks(rootDir, config) {
    const g = config.gigaV4 || {};
    if (g.enabled === false) return [];

    const issues = [];
    const exceptions = new Set(g.exceptions || []);
    const skip = (code) => exceptions.has(code);

    const entryHtml = config.entryHtml || 'index.html';
    const html = read(rootDir, entryHtml);

    const ignoreDirs = new Set([...(config.ignoreDirectories || []), 'vendor', '.assets-original']);
    const sourceFiles = [
        ...walk(path.join(rootDir, 'src'), ignoreDirs),
        ...(html ? [path.join(rootDir, entryHtml)] : []),
    ];
    const relative = (abs) => path.relative(rootDir, abs).split(path.sep).join('/');
    const sources = sourceFiles.map((abs) => ({ file: relative(abs), text: fs.readFileSync(abs, 'utf8') }));
    const styleAndMarkup = sources.filter((s) => /\.(css|html|jsx?|tsx?)$/.test(s.file));
    const allText = styleAndMarkup.map((s) => s.text).join('\n');

    // ---------------------------------------------------------------- 表示
    // 100vh をそのまま使うと、スマホのアドレスバーの分だけ画面からはみ出す。
    if (!skip('VIEWPORT_100VH')) {
        for (const { file, text } of styleAndMarkup) {
            const pattern = /(?:min-height|max-height|height)\s*:\s*100vh/g;
            for (const m of text.matchAll(pattern)) {
                // dvh のフォールバックは前後どちらに書いてもよい。
                // @supports not (height: 100dvh) { ... height: 100vh } のように
                // 100vh をあとに書く形もあるため、前方も見る。
                const around = text.slice(Math.max(0, m.index - 300), m.index + 300);
                if (/100dvh/.test(around)) continue;
                issues.push(issue('error', 'VIEWPORT_100VH',
                    '100vh を単独で使っている。100dvh を1行下に添えること（スマホでアドレスバーの分はみ出す）。',
                    file, lineOf(text, m.index)));
            }
        }
    }

    if (html) {
        const viewport = html.match(/<meta\s+name=["']viewport["'][^>]*>/i);
        if (!skip('VIEWPORT_FIT') && (!viewport || !/viewport-fit\s*=\s*cover/.test(viewport[0]))) {
            issues.push(issue('error', 'VIEWPORT_FIT',
                'viewport に viewport-fit=cover が無い（ノッチ・ホームバー領域まで背景が伸びない）。', entryHtml));
        }
        if (!skip('USER_SCALABLE_NO') && viewport && /user-scalable\s*=\s*no|maximum-scale\s*=\s*1/.test(viewport[0])) {
            issues.push(issue('warning', 'USER_SCALABLE_NO',
                '拡大を禁止している。文章を読む画面・教員用画面では外すこと（アクセシビリティの後退）。', entryHtml));
        }
    }

    if (!skip('SAFE_AREA') && !/safe-area-inset/.test(allText)) {
        issues.push(issue('error', 'SAFE_AREA',
            'safe-area-inset をどこにも使っていない。下部固定の要素と左右パディングに適用すること。'));
    }

    if (!skip('FLUID_TYPE') && !/clamp\s*\(/.test(allText)) {
        issues.push(issue('warning', 'FLUID_TYPE',
            'clamp() による文字サイズ指定が無い。320px から電子黒板まで1本の式でまかなうこと。'));
    }

    if (!skip('REDUCED_MOTION') && !/prefers-reduced-motion/.test(allText)) {
        issues.push(issue('error', 'REDUCED_MOTION',
            'prefers-reduced-motion に対応していない（感覚過敏の児童への配慮）。'));
    }

    // Canvas を使っているのに devicePixelRatio の補正が無いと、高DPI機で
    // 手書きの線と文字がぼやける。ぼやけの最大要因。
    if (!skip('CANVAS_DPR')) {
        const usesCanvas = /getContext\s*\(\s*['"]2d['"]/.test(allText);
        const hasDpr = /devicePixelRatio/.test(allText);
        if (usesCanvas && !hasDpr) {
            issues.push(issue('error', 'CANVAS_DPR',
                'Canvas を使っているのに devicePixelRatio の補正が無い（高DPI機で線と文字がぼやける）。'));
        }
        // 上限2で頭打ちにしないと、3倍端末で9倍の面積を描いてメモリ4GB機が落ちる
        if (hasDpr && !/Math\.min\s*\([^)]*devicePixelRatio|devicePixelRatio[^)\n]*,\s*2\s*\)/.test(allText)) {
            issues.push(issue('warning', 'CANVAS_DPR_CAP',
                'devicePixelRatio を 2 で頭打ちにしていない可能性がある（3倍端末で面積が9倍になる）。'));
        }
    }

    // ------------------------------------------------------------ セキュリティ
    if (!skip('LOCALSTORAGE_CLEAR')) {
        for (const { file, text } of sources) {
            for (const m of text.matchAll(/localStorage\s*\.\s*clear\s*\(/g)) {
                issues.push(issue('error', 'LOCALSTORAGE_CLEAR',
                    'localStorage.clear() は他アプリの学習データまで消す。自アプリ接頭辞のキーだけを消すこと。',
                    file, lineOf(text, m.index)));
            }
        }
    }

    if (html && !skip('CSP_MISSING')) {
        // content の中には 'self' のように引用符が現れる。開き引用符と同じ種類の
        // 引用符で閉じるところまでを取る（後方参照）。ここを ["'] で書くと
        // 'self' の ' で切れてしまい、directive を見落とす。
        const csp = html.match(/<meta\s+http-equiv=["']Content-Security-Policy["'][^>]*?content=("|')([\s\S]*?)\1/i);
        if (!csp) {
            issues.push(issue('error', 'CSP_MISSING', 'Content-Security-Policy が無い。', entryHtml));
        } else {
            const content = csp[2];
            for (const directive of ['script-src', 'connect-src']) {
                const m = content.match(new RegExp(directive + '\\s+([^;]*)'));
                if (!m) {
                    issues.push(issue('warning', 'CSP_DIRECTIVE_MISSING',
                        `CSP に ${directive} が無い。`, entryHtml));
                    continue;
                }
                if (/(^|\s)\*(\s|$)|https:\/\/\*/.test(m[1])) {
                    issues.push(issue('error', 'CSP_WILDCARD',
                        `CSP の ${directive} にワイルドカードがある。必要な宛先だけを列挙すること。`, entryHtml));
                }
            }
            if (/'unsafe-eval'/.test(content)) {
                issues.push(issue('error', 'CSP_UNSAFE_EVAL', "CSP に 'unsafe-eval' がある。", entryHtml));
            }
            // script-src を 'self' で締めているのにインライン script があると動かない
            const inline = [...html.matchAll(/<script\b(?![^>]*\bsrc=)[^>]*>/gi)];
            const scriptSrc = (content.match(/script-src\s+([^;]*)/) || ['', ''])[1];
            if (inline.length > 0 && !/'unsafe-inline'/.test(scriptSrc)) {
                issues.push(issue('error', 'CSP_INLINE_SCRIPT',
                    `インライン <script> が ${inline.length} 個あるが script-src が許可していない。外部ファイルへ切り出すこと。`,
                    entryHtml));
            }
        }
    }

    if (!skip('ENV_TRACKED')) {
        const gitignore = read(rootDir, '.gitignore') || '';
        if (fs.existsSync(path.join(rootDir, '.env')) && !/^\s*\.env\s*$/m.test(gitignore)) {
            issues.push(issue('error', 'ENV_TRACKED',
                '.env が .gitignore に入っていない（秘密情報をコミットする事故につながる）。', '.gitignore'));
        }
    }

    // ------------------------------------------------------------------ PWA
    // gigayama.github.io は多数のアプリが同一オリジンを共有している。
    // id / scope / start_url がリポジトリ名の絶対パスから外れると別アプリと衝突する。
    if (!skip('PWA_MANIFEST')) {
        const expected = g.basePath;
        const viteConfig = read(rootDir, 'vite.config.js') || '';
        const distManifest = read(rootDir, 'dist/manifest.webmanifest');
        const staticManifest = read(rootDir, 'manifest.webmanifest');
        const manifestText = distManifest || staticManifest;

        if (expected) {
            if (manifestText) {
                let parsed = null;
                try { parsed = JSON.parse(manifestText); } catch { /* 静的でない場合は下の正規表現で見る */ }
                if (parsed) {
                    for (const key of ['id', 'scope', 'start_url']) {
                        const value = parsed[key];
                        if (typeof value !== 'string' || !value.startsWith(expected)) {
                            issues.push(issue('error', 'PWA_MANIFEST',
                                `manifest の ${key} が "${expected}" で始まっていない（実際: ${String(value)}）。同一オリジンの他アプリと取り違えられる。`,
                                distManifest ? 'dist/manifest.webmanifest' : 'manifest.webmanifest'));
                        }
                    }
                }
            } else if (viteConfig) {
                // まだビルドしていないときは、設定ファイルの記述で見る
                for (const key of ['id', 'scope', 'start_url']) {
                    const m = viteConfig.match(new RegExp(key + "\\s*:\\s*(.+)"));
                    if (m && !m[1].includes(expected) && !/BASE/.test(m[1])) {
                        issues.push(issue('error', 'PWA_MANIFEST',
                            `vite.config.js の manifest.${key} が "${expected}" を指していない。`, 'vite.config.js'));
                    }
                }
            }
        }
    }

    if (!skip('PWA_INSTALL')) {
        // 捕捉は <head> の先頭で読む小さな外部ファイルに置くのが定石なので、
        // src/ だけでなく public/ 直下の .js も見る。ファイル名はアプリごとに違う。
        const publicScripts = walk(path.join(rootDir, 'public'), ignoreDirs)
            .filter((abs) => abs.endsWith('.js'))
            .map((abs) => fs.readFileSync(abs, 'utf8'))
            .join('\n');
        if (!/beforeinstallprompt/.test(allText) && !/beforeinstallprompt/.test(publicScripts)) {
            issues.push(issue('error', 'PWA_INSTALL',
                'beforeinstallprompt を捕捉していない。通信が遅い端末でインストールボタンが出なくなる。'));
        }
    }

    if (!skip('PWA_OFFLINE') && !fs.existsSync(path.join(rootDir, 'public/offline.html'))
        && !fs.existsSync(path.join(rootDir, 'offline.html'))) {
        issues.push(issue('error', 'PWA_OFFLINE', 'offline.html が無い（圏外で「壊れた」と思わせてしまう）。'));
    }

    // Service Worker が localStorage に触れると学習データを壊しうる。
    // caches.keys() の全削除は同一オリジンの他アプリをオフラインで起動不能にする。
    if (!skip('SW_UNSAFE')) {
        // 「localStorage は操作しない」と注意書きしてあるだけで引っかかっては、
        // 検査が信用されなくなる。判定の前にコメントを落とす。
        const stripComments = (src) => src
            .replace(/\/\*[\s\S]*?\*\//g, '')
            .replace(/(^|[^:])\/\/.*$/gm, '$1');
        for (const rel of ['sw.js', 'public/sw.js', 'dist/sw.js', 'docs/sw.js']) {
            const raw = read(rootDir, rel);
            if (!raw) continue;
            const sw = stripComments(raw);
            if (/localStorage/.test(sw)) {
                issues.push(issue('error', 'SW_LOCALSTORAGE', 'Service Worker が localStorage に触れている。', rel));
            }
            /*
             * 全キャッシュ削除の判定は、削除する式の形で書かない。
             * (k) => caches.delete(k) と k => caches.delete(k) と
             * (e) => caches.delete(e) のように書き方の幅が広く、
             * 正規表現で追うと必ず取りこぼす（実際、53リポジトリを調べたとき
             * 引数の書き方が違うだけで1件見落とした）。
             *
             * 見るべきは「消す式」ではなく「自アプリだけに絞る式があるか」。
             * caches.keys() で一覧を取って消しているのに、接頭辞で絞る
             * startsWith が1つも無ければ、それは全部消している。
             */
            const listsAllCaches = /caches\.keys\s*\(\s*\)/.test(sw);
            const deletes = /caches\.delete\s*\(/.test(sw);
            // 「接頭辞で始まるものだけ」を表す書き方があるかどうかだけを見る。
            // CACHE_PREFIX という定数があること自体は根拠にならない。
            // 名前は定義しつつ、activate では全部消しているコードが実在した。
            const narrowsToOwn = /startsWith\s*\(|indexOf\s*\([^)]*\)\s*===?\s*0/.test(sw);
            if (listsAllCaches && deletes && !narrowsToOwn) {
                issues.push(issue('error', 'SW_CACHE_WIPE',
                    'Service Worker が全キャッシュを削除している。同一オリジンの他アプリがオフラインで起動しなくなる。', rel));
            }
        }
    }

    // ---------------------------------------------------------------- 性能
    if (!skip('ASSET_SIZE')) {
        const limits = g.assetLimits || {};
        const defaultLimit = limits.default ?? 150 * 1024;
        for (const dir of ['public', 'src/assets', 'assets', 'icons']) {
            for (const abs of walk(path.join(rootDir, dir), ignoreDirs)) {
                if (!/\.(png|jpe?g|gif|webp)$/i.test(abs)) continue;
                const rel = relative(abs);
                const size = fs.statSync(abs).size;
                const limit = limits[path.basename(abs)] ?? defaultLimit;
                if (size > limit) {
                    issues.push(issue('warning', 'ASSET_SIZE',
                        `${(size / 1024).toFixed(1)}KB は上限 ${(limit / 1024).toFixed(0)}KB を超えている。`, rel));
                }
            }
        }
    }

    // ---------------------------------------------------- アクセシビリティ
    if (!skip('A11Y_PRINT') && !/@media\s+print/.test(allText)) {
        issues.push(issue('warning', 'A11Y_PRINT', '印刷用のスタイルが無い（記録・ワークシート系では本質機能）。'));
    }

    if (!skip('A11Y_DIALOG')) {
        const modalCount = (allText.match(/fixed inset-0/g) || []).length;
        const dialogCount = (allText.match(/role=["']dialog["']/g) || []).length;
        if (modalCount > 0 && dialogCount === 0) {
            issues.push(issue('error', 'A11Y_DIALOG',
                `全画面のかぶせ表示が ${modalCount} 箇所あるが role="dialog" が無い。`));
        }
    }

    if (!skip('A11Y_LIVE') && !/aria-live/.test(allText)) {
        issues.push(issue('warning', 'A11Y_LIVE',
            'aria-live が無い。保存完了などの状態変化が読み上げられない。'));
    }

    if (!skip('A11Y_ESCAPE') && /fixed inset-0/.test(allText) && !/['"]Escape['"]/.test(allText)) {
        issues.push(issue('error', 'A11Y_ESCAPE',
            'Esc キーの処理が無い。キーボードだけではモーダルを閉じられない。'));
    }

    // ---------------------------------------------------------------- 法務
    if (!skip('LEGAL')) {
        for (const rel of ['LICENSE', '.github/dependabot.yml', 'README.md', 'MANUAL.md']) {
            if (!fs.existsSync(path.join(rootDir, rel))) {
                issues.push(issue('error', 'LEGAL_FILE_MISSING', `${rel} が無い。`, rel));
            }
        }
    }

    return issues;
}
