// 計測条件としきい値は lighthouserc.json だけに書く。このモジュールがそれを読む。
//
// 以前は build-metrics.mjs と check-budget.mjs がそれぞれ Lighthouse のフラグと
// しきい値を独自に持っていた。条件がずれていたうえ build-metrics は1回しか
// 測らなかったため、外れ値がそのまま公開値になり、「このサイトについて」が
// LCP 705ms、CI の判定が約1655ms という状態になった（2026-11-03。仕様書 §8）。
//
// 条件を変えるときは lighthouserc.json を触る。このファイルに閾値を書かない。
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const ROOT = fileURLToPath(new URL('../', import.meta.url));

export async function loadLighthouseConfig() {
  const { ci } = JSON.parse(
    await readFile(path.join(ROOT, 'lighthouserc.json'), 'utf-8')
  );
  const { url: urls, numberOfRuns = 1, settings = {} } = ci.collect;
  return {
    paths: urls.map((u) => new URL(u).pathname),
    numberOfRuns,
    settings,
    assertMatrix: ci.assert?.assertMatrix ?? [],
  };
}

/*
  collect.settings を無加工で Lighthouse に渡すための設定ファイルを書く。
  CLI のフラグへ変換すると配列（onlyCategories）やネスト（screenEmulation）の
  扱いで取りこぼすため、--config-path 経由で渡す。
*/
export async function writeLighthouseConfig(settings, filePath) {
  await writeFile(
    filePath,
    JSON.stringify({ extends: 'lighthouse:default', settings }, null, 2)
  );
  return filePath;
}

/*
  assertMatrix から、ある URL に効くしきい値を解決する。
  後に書いたブロックが前のブロックを上書きする（lhci と同じ）。
*/
export function assertionsFor(assertMatrix, url) {
  const resolved = {};
  for (const block of assertMatrix) {
    if (!new RegExp(block.matchingUrlPattern).test(url)) continue;
    for (const [audit, rule] of Object.entries(block.assertions ?? {})) {
      const [level, options] = Array.isArray(rule) ? rule : ['error', rule];
      if (level === 'off') {
        delete resolved[audit];
        continue;
      }
      resolved[audit] = { level, ...options };
    }
  }
  return resolved;
}

/*
  計測に使う Lighthouse の版。lighthouserc.json の条件が同じでも、
  版が違えば数値が変わる。Lantern（simulate スロットリングの見積もり）の
  計算が版ごとに違うため、同じページの同じトレースから別の FCP が出る。

  実測（#57）: 観測された描画は両方 204ms なのに、
    lighthouse 12.1.0 → FCP 1507ms / LCP 1807ms
    lighthouse 13.6.0 → FCP  603ms / LCP  603ms

  スクリプトが `npx lighthouse` を版を指定せずに呼んでいたため、
  Lighthouse 13 の公開と同時に、CI（@lhci/cli が同梱する 12.1.0）と
  手元・公開値の計測器が黙って食い違った。

  package.json で lighthouse と @lhci/cli を完全固定し、同じ版を共有させている
  （@lhci/cli@0.14.0 の依存は lighthouse@12.1.0 で、npm が1本に重複排除する）。
  **lhci を上げるときは lighthouse も必ず合わせること。**
*/
export async function pinnedLighthouseVersion() {
  const pkg = JSON.parse(await readFile(path.join(ROOT, 'package.json'), 'utf-8'));
  return pkg.devDependencies.lighthouse;
}

export async function assertLighthouseVersion(reportVersion) {
  const pinned = await pinnedLighthouseVersion();
  if (reportVersion !== pinned) {
    throw new Error(
      `Lighthouse の版が固定値と違う（レポート ${reportVersion} / package.json ${pinned}）。` +
        'CI と別の計測器で測った数値は比較できない。npm ci をやり直すこと。'
    );
  }
  return pinned;
}

/** lhci の assert と同じ集計。走りを1本選ぶのではなく、監査ごとに中央値を取る。 */
export function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}
