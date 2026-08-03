#!/usr/bin/env node
/**
 * 品質ゲート。
 *
 *   npm run check          … 人が読む形式で出す
 *   npm run check -- --json … CI などが読む形式で出す
 *
 * 中身は2階建てになっている。
 *   scripts/lib/project-quality.mjs … SchoolPlan_Editor の正本をそのままコピーした共通検査。
 *                                     アプリごとに書き換えない（正本が更新されたら丸ごと差し替える）。
 *   scripts/lib/giga-v4-checks.mjs  … このアプリ（Vite + React の静的サイト）に必要な
 *                                     GIGA Standard v4 Part I の検査。
 *
 * 検査に落ちたときは、検査をゆるめるのではなく quality.config.json の
 * gigaV4.exceptions / securityExceptions に理由を書いて明示的に許可すること。
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { formatQualityReport, loadQualityConfig, runQualityChecks } from './lib/project-quality.mjs';
import { runGigaV4Checks } from './lib/giga-v4-checks.mjs';

const rootDir = path.resolve(process.cwd());

let report;
try {
    report = runQualityChecks(rootDir);
    const config = loadQualityConfig(rootDir);
    // 正本の設定にはこのキーが無いので、生の JSON からも読み直す
    const rawPath = path.join(rootDir, 'quality.config.json');
    const raw = fs.existsSync(rawPath) ? JSON.parse(fs.readFileSync(rawPath, 'utf8')) : {};
    const extra = runGigaV4Checks(rootDir, { ...config, gigaV4: raw.gigaV4 });

    // package-lock.json のような自動生成ファイルは「1ファイルが大きすぎる」の
    // 対象外にする。あの警告は人が保守するソースに向けたもの。
    const ignoreLarge = new Set(raw.maintainability?.ignoreLargeFiles || []);
    const fromCore = report.issues.filter(
        (i) => !(ignoreLarge.has(i.file) && (i.code === 'LARGE_FILE_LINES' || i.code === 'LARGE_FILE_BYTES'))
    );

    const issues = [...fromCore, ...extra].sort((a, b) => {
        if (a.severity !== b.severity) return a.severity === 'error' ? -1 : 1;
        return `${a.file || ''}:${a.line || 0}:${a.code}`.localeCompare(`${b.file || ''}:${b.line || 0}:${b.code}`);
    });

    report = {
        ...report,
        issues,
        errors: issues.filter((i) => i.severity === 'error'),
        warnings: issues.filter((i) => i.severity === 'warning'),
    };
} catch (error) {
    console.error(`Quality checker failed: ${error instanceof Error ? error.stack : String(error)}`);
    process.exit(2);
}

if (process.argv.includes('--json')) console.log(JSON.stringify(report, null, 2));
else console.log(formatQualityReport(report));

if (report.errors.length > 0) process.exit(1);
