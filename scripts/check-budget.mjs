// lighthouserc.json のしきい値を、本番と同条件（gzip配信）で手元から検証する。
//
// Lighthouse CI 本体は Windows で一時ディレクトリの削除に失敗して落ちるため
// ローカルでは通しで回せない。CI（ubuntu）では autorun がそのまま動く。
// このスクリプトは「CIが落ちない状態か」を手元で確認するためのもの。
//
// 対象ページ・試行回数・計測条件・しきい値はすべて lighthouserc.json から読む。
// 以前はこのファイルに手で複製していて、画面サイズが CI と違っていた（#57）。
import { spawn } from 'node:child_process';
import { readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import {
  ROOT,
  loadLighthouseConfig,
  writeLighthouseConfig,
  assertionsFor,
  assertLighthouseVersion,
  median,
} from './lighthouse-config.mjs';
import { startStaticServer } from './static-server.mjs';

const PORT = Number(process.env.BUDGET_PORT ?? 4174);
const ORIGIN = `http://localhost:${PORT}`;

const { paths, numberOfRuns, settings, assertMatrix } = await loadLighthouseConfig();
const RUNS = Number(process.env.BUDGET_RUNS ?? numberOfRuns);

/*
  lighthouserc.json の表記を素の Lighthouse レポートで評価する。
  categories:<id> はカテゴリのスコア、それ以外は監査の numericValue。
  resource-summary:* は lhci が独自に組み立てる擬似監査なのでここでは評価できない。
  評価できなかったものは最後に一覧で出す（黙って抜けないようにする）。
*/
function readValue(report, key) {
  if (key.startsWith('categories:')) {
    const score = report.categories[key.slice('categories:'.length)]?.score;
    return score === undefined ? null : { value: score, isScore: true };
  }
  const numeric = report.audits[key]?.numericValue;
  return numeric === undefined ? null : { value: numeric, isScore: false };
}

const configPath = path.join(ROOT, '.budget-lh-config.json');

async function runOnce(url, i) {
  const out = path.join(ROOT, `.budget-${i}.json`);
  await new Promise((resolve, reject) => {
    const child = spawn(
      [
        'npx lighthouse',
        url,
        '--output=json',
        `--output-path="${out}"`,
        `--config-path="${configPath}"`,
        '--chrome-flags="--headless=new --no-sandbox"',
        '--quiet',
      ].join(' '),
      { cwd: ROOT, stdio: 'ignore', shell: true }
    );
    // Lighthouse は Windows で終了時に一時ディレクトリ削除に失敗して
    // 非ゼロ終了することがあるため、レポートが生成されていれば成功とみなす。
    child.on('exit', () => resolve());
    child.on('error', reject);
  });
  const report = JSON.parse(await readFile(out, 'utf-8'));
  await rm(out, { force: true });
  return report;
}

await writeLighthouseConfig(settings, configPath);
const server = await startStaticServer(PORT);
const skipped = new Set();
let failed = false;

try {
  for (const p of paths) {
    const url = ORIGIN + p;
    const assertions = assertionsFor(assertMatrix, url);
    const reports = [];
    for (let i = 0; i < RUNS; i++) reports.push(await runOnce(url, i));

    // CI と同じ計測器か確かめる。版が違う数値は CI の判定と比べられない。
    const version = await assertLighthouseVersion(reports[0].lighthouseVersion);

    console.log(`\n${p}  (Lighthouse ${version} / ${RUNS}回の中央値)`);
    for (const [key, rule] of Object.entries(assertions)) {
      const samples = reports.map((r) => readValue(r, key));
      if (samples.some((s) => s === null)) {
        skipped.add(key);
        continue;
      }
      const value = median(samples.map((s) => s.value));
      const scale = samples[0].isScore ? 100 : 1;
      const isMin = rule.minScore !== undefined;
      const bound = (isMin ? rule.minScore : rule.maxNumericValue) * scale;
      const ok = isMin ? value * scale >= bound : value <= rule.maxNumericValue;
      const shown = value * scale < 10 ? (value * scale).toFixed(3) : Math.round(value * scale);
      const mark = ok ? 'PASS' : rule.level === 'warn' ? 'WARN' : 'FAIL';
      console.log(
        `  ${mark}  ${key.padEnd(30)} ${String(shown).padStart(7)}  (${isMin ? '>=' : '<='} ${bound})`
      );
      if (!ok && rule.level !== 'warn') failed = true;
    }
  }
} finally {
  server.close();
  await rm(configPath, { force: true });
}

if (skipped.size) {
  console.log(`\n手元では評価しない項目（CIのみ）: ${[...skipped].join(', ')}`);
}
console.log(failed ? '\n予算割れあり' : '\nすべて予算内');
process.exit(failed ? 1 : 0);
