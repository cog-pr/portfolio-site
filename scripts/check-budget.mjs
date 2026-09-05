// lighthouserc.json のしきい値を、本番と同条件（gzip配信）で検証する。
//
// Lighthouse CI 本体は Windows で一時ディレクトリ削除に失敗して落ちるため
// ローカルでは通しで回せない。CI（ubuntu）では autorun がそのまま動く。
// このスクリプトは「CIが落ちない状態か」を手元で確認するためのもので、
// LHCI と同じく **複数runの中央値** で判定する。
import { spawn } from 'node:child_process';
import { readFile, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { startStaticServer } from './static-server.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const PORT = Number(process.env.BUDGET_PORT ?? 4174);
const RUNS = Number(process.env.BUDGET_RUNS ?? 3);
const ORIGIN = `http://localhost:${PORT}`;

const PATHS = ['/', '/works/', '/about-this-site/', '/works/takaga-ai/'];

/*
  LCP だけページごとに閾値が違う。lighthouserc.json の assertMatrix と揃えること。
  「このサイトについて」はHTML文書が大きく、simulated throttlingではFCPの到着が
  支配的になるため 2.4s を上限にする（仕様書 §8 の但し書きを参照）。
*/
const LCP_LIMITS = { '/about-this-site/': 2400 };
const LCP_DEFAULT = 2000;

// lighthouserc.json と同じしきい値
const ASSERTIONS = [
  { key: 'perf', label: 'performance', min: 95 },
  { key: 'a11y', label: 'accessibility', min: 100 },
  { key: 'lcp', label: 'LCP (ms)', max: LCP_DEFAULT, perPath: LCP_LIMITS },
  { key: 'cls', label: 'CLS', max: 0.05 },
  { key: 'tbt', label: 'TBT (ms)', max: 200 },
];

function median(values) {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

async function runOnce(url, i) {
  const out = path.join(ROOT, `.budget-${i}.json`);
  await new Promise((resolve, reject) => {
    const child = spawn(
      [
        'npx lighthouse',
        url,
        '--output=json',
        `--output-path="${out}"`,
        '--chrome-flags="--headless=new --no-sandbox"',
        '--only-categories=performance,accessibility',
        '--form-factor=mobile',
        '--screenEmulation.mobile',
        '--throttling-method=simulate',
        '--quiet',
      ].join(' '),
      { cwd: ROOT, stdio: 'ignore', shell: true }
    );
    child.on('exit', () => resolve());
    child.on('error', reject);
  });
  const r = JSON.parse(await readFile(out, 'utf-8'));
  await rm(out, { force: true });
  return {
    perf: r.categories.performance.score * 100,
    a11y: r.categories.accessibility.score * 100,
    lcp: r.audits['largest-contentful-paint'].numericValue,
    cls: r.audits['cumulative-layout-shift'].numericValue,
    tbt: r.audits['total-blocking-time'].numericValue,
  };
}

const server = await startStaticServer(PORT);
let failed = false;
try {
  for (const p of PATHS) {
    const results = [];
    for (let i = 0; i < RUNS; i++) results.push(await runOnce(ORIGIN + p, i));

    console.log(`\n${p}  (${RUNS}回の中央値)`);
    for (const a of ASSERTIONS) {
      const value = median(results.map((r) => r[a.key]));
      const max = a.perPath?.[p] ?? a.max;
      const ok = a.min !== undefined ? value >= a.min : value <= max;
      const limit = a.min !== undefined ? `>= ${a.min}` : `<= ${max}`;
      const shown = a.key === 'cls' ? value.toFixed(3) : Math.round(value);
      console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${a.label.padEnd(16)} ${String(shown).padStart(6)}  (${limit})`);
      if (!ok) failed = true;
    }
  }
} finally {
  server.close();
}

console.log(failed ? '\n予算割れあり' : '\nすべて予算内');
process.exit(failed ? 1 : 0);
