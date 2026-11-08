// 「このサイトについて」ページが表示する実測値を src/data/metrics.json に書き出す。
//
// このスクリプトは Lighthouse を回さない。Lighthouse CI が .lighthouseci/ に
// 残したレポートを読み、監査ごとの中央値を取る。
// こうすると「公開する数値」と「CI が予算割れを判定した数値」が同一の計測になる。
//
// 以前は独自に Lighthouse を1回だけ回していた。条件が lighthouserc.json と別に
// 書かれていたうえ、1回の結果をそのまま公開していたため、計測が成立していない
// 走り（FCP と LCP が同値 705ms）がそのまま公開値として固定された
// （2026-11-03。CI の判定値は約1655ms。仕様書 §8 / #57）。
//
// 使い方:
//   npm run metrics:measure   # lhci collect → このスクリプト
//   CI では「Run Lighthouse CI」の後に走る（.github/workflows/lighthouse.yml）
//
// 手元の Windows では lhci が一時ディレクトリの削除に失敗して落ちることがある。
// 予算の確認だけなら npm run budget:check を使う（同じ lighthouserc.json を読む）。
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import path from 'node:path';
import {
  ROOT,
  loadLighthouseConfig,
  assertLighthouseVersion,
  median,
} from './lighthouse-config.mjs';

const DIST = path.join(ROOT, 'dist');
const LHCI_DIR = path.join(ROOT, '.lighthouseci');

/** 公開するのは入口の数値。トップページのレポートだけを使う。 */
const TARGET_PATH = '/';

/** index.html が直接読み込む <script type="module"> だけを初期JSとして数える。
 *  動的import（GSAP / OGL）は初期転送に含まれないため対象外。 */
async function measureInitialJs() {
  const html = await readFile(path.join(DIST, 'index.html'), 'utf-8');
  const srcs = [...html.matchAll(/<script[^>]+type="module"[^>]+src="([^"]+)"/g)].map((m) => m[1]);
  let total = 0;
  for (const src of srcs) {
    const file = path.join(DIST, src.replace(/^\//, ''));
    total += gzipSync(await readFile(file)).length;
  }
  return { bytes: total, files: srcs.length };
}

async function measureFonts() {
  const dir = path.join(ROOT, 'public', 'fonts');
  const files = (await readdir(dir)).filter((f) => f.endsWith('.woff2'));
  let total = 0;
  for (const f of files) {
    // woff2 は既にブロトリ圧縮済みなので、そのままのサイズが転送量。
    total += (await readFile(path.join(dir, f))).length;
  }
  return { bytes: total, files: files.length };
}

/*
  lhci collect が書いたレポート（lhr-<epoch>.json）のうち、対象ページのものを集める。
  ファイル名の epoch で新しい順に並べ、必要な回数ぶんだけ取る。
  前回の計測が残っていても、古い走りと混ぜて中央値を出さないため。
*/
async function readLhciReports(targetPath, runs) {
  let entries;
  try {
    entries = await readdir(LHCI_DIR);
  } catch {
    throw new Error('.lighthouseci/ が無い。先に計測すること: npm run metrics:measure');
  }
  const names = entries
    .filter((n) => /^lhr-\d+\.json$/.test(n))
    .sort((a, b) => Number(b.match(/\d+/)[0]) - Number(a.match(/\d+/)[0]));

  const reports = [];
  for (const name of names) {
    if (reports.length === runs) break;
    const report = JSON.parse(await readFile(path.join(LHCI_DIR, name), 'utf-8'));
    const url = report.finalDisplayedUrl ?? report.finalUrl ?? report.requestedUrl;
    if (url && new URL(url).pathname === targetPath) reports.push(report);
  }
  return reports;
}

const { numberOfRuns, settings } = await loadLighthouseConfig();
const reports = await readLhciReports(TARGET_PATH, numberOfRuns);

// 1回の計測をそのまま公開した結果が #57 の事故。足りないなら書き換えない。
if (reports.length < numberOfRuns) {
  throw new Error(
    `${TARGET_PATH} のレポートが ${reports.length} 件しかない` +
      `（lighthouserc.json は ${numberOfRuns} 回を指定）。` +
      '計測が途中で落ちていないか確認すること。'
  );
}

// 版が違えば同じページから別の数値が出る。固定値と一致しない限り公開しない。
const lighthouseVersion = await assertLighthouseVersion(reports[0].lighthouseVersion);

const audit = (id) => median(reports.map((r) => r.audits[id].numericValue));
const score = (id) => median(reports.map((r) => r.categories[id].score));

const { width, height } = settings.screenEmulation ?? {};
const viewport = width && height ? `${width}×${height}` : '既定';
const [initialJs, fonts] = await Promise.all([measureInitialJs(), measureFonts()]);

const metrics = {
  // 計測した時刻。このファイルを書いた時刻ではない。
  measuredAt: reports
    .map((r) => r.fetchTime)
    .sort()
    .at(-1),
  page: TARGET_PATH,
  runs: reports.length,
  lighthouseVersion,
  environment:
    `Lighthouse ${lighthouseVersion}（${settings.formFactor ?? 'mobile'} ${viewport}、` +
    `${settings.throttlingMethod ?? 'simulate'} スロットリング、gzip配信）`,
  scores: {
    performance: Math.round(score('performance') * 100),
    accessibility: Math.round(score('accessibility') * 100),
    bestPractices: Math.round(score('best-practices') * 100),
    seo: Math.round(score('seo') * 100),
  },
  vitals: {
    lcpMs: Math.round(audit('largest-contentful-paint')),
    cls: Number(audit('cumulative-layout-shift').toFixed(3)),
    tbtMs: Math.round(audit('total-blocking-time')),
    fcpMs: Math.round(audit('first-contentful-paint')),
  },
  budget: {
    initialJsGzipBytes: initialJs.bytes,
    initialJsFileCount: initialJs.files,
    fontsBytes: fonts.bytes,
    fontsFileCount: fonts.files,
  },
};

const outDir = path.join(ROOT, 'src', 'data');
await mkdir(outDir, { recursive: true });
await writeFile(path.join(outDir, 'metrics.json'), JSON.stringify(metrics, null, 2) + '\n');

console.log(JSON.stringify(metrics, null, 2));
