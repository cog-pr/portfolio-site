// public/fonts/ 用のサブセットフォントを生成する。
//
// 実行順序: **ビルド → サブセット → もう一度ビルド**（`npm run build:full`）。
//
//   1回目のビルド … サブセット対象の文字を集めるためのHTMLを出す
//   サブセット     … woff2 と fonts-jp.generated.css（unicode-range）を書き出す
//   2回目のビルド … 更新された unicode-range をHTMLにインライン展開する
//
// 2回目が必要なのは、CSSをインライン化している（astro.config.mjs）ため。
// 1回目のHTMLには古い unicode-range が焼き込まれたままになる。
// なお抽出時に <style> は除去するので、1回目と2回目で対象文字は変わらない（収束する）。
//
// なぜビルド後か:
//   サブセットの対象文字を、ソースコードではなく **実際に出力されたHTML** から集めるため。
//   ソースを走査すると日本語のコード内コメントまで拾ってしまい、
//   描画されない文字のために和文フォントが数十KB太る（実測 +15KB）。
//
// 書体ごとに必要な文字が違う点も利用する:
//   - Zen Kaku Gothic New **Bold** は見出し（h1〜h3）と strong だけに使われる。
//     本文全部を入れると倍近く太るので、太字コンテキストの文字だけを抽出する。
//   - Archivo / IBM Plex Mono は欧文のみなので固定の文字セットでよい。
//
// 生成物は public/fonts/ に書き出し、dist/ が既にあれば dist/fonts/ にも複製する
// （ビルドをやり直さずに済ませるため）。
import subsetFont from 'subset-font';
import fg from 'fast-glob';
import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const SRC_DIR = new URL('../fonts-src/', import.meta.url);
const OUT_DIR = new URL('../public/fonts/', import.meta.url);
const DIST_FONT_DIR = new URL('../dist/fonts/', import.meta.url);
await mkdir(OUT_DIR, { recursive: true });

const exists = async (p) =>
  access(p).then(
    () => true,
    () => false
  );

function stripNonRendered(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ');
}

/** 描画される属性値（alt / title / aria-label / meta content）も対象に含める */
function renderedAttributeText(html) {
  return [...html.matchAll(/(?:alt|title|aria-label|content)="([^"]*)"/gi)]
    .map((m) => m[1])
    .join(' ');
}

function stripTags(html) {
  return html.replace(/<[^>]+>/g, ' ');
}

const htmlFiles = await fg('dist/**/*.html', { cwd: ROOT, absolute: true });
if (htmlFiles.length === 0) {
  throw new Error(
    'dist/ に HTML がありません。先に `npm run build` を実行してください。\n' +
      '（サブセット対象の文字は出力HTMLから収集します）'
  );
}

let renderedText = '';
let boldText = '';
/*
  core = 入口ページで必要な文字 + 各ページが明示的に指定した文字
  ext  = それ以外のページにしか出ない文字

  入口ページ = トップ（/）と成果物一覧（/works/）。
  この2枚は「最初に開かれる前提のページ」なので、和文の到着を待たせない。

  分割の境界は実測で決めた。core を広げて「全ページの見出し＋導入段落」まで
  自動で入れると core が 34.7→54.4KB に膨らみ、トップの LCP が 1894→2179ms と
  悪化した。よって全ページを入れることはせず、入口の2枚だけを対象にしている。

  成果物一覧を core に含める理由（2026-08-15 実測）:
  一覧を専用ページに分けた直後、このページの和文は ext 側に落ちていた。
  ext は「このサイトについて」の長文まで抱えて 72KB あり、一覧を開くたびに
  それを丸ごと取得していた。LCP要素は看板のタイトル（Archivo）なのに、
  同時に走る 113KB の和文・等幅フォントが帯域を奪って LCP 2330ms まで落ちた。
  一覧側の和文を core に移すと ext を取得しなくなる。

  個別に申告したい場合: その要素に data-font-core を付ける。
  ファーストビューに出る和文で、ext の到着を待たせたくないものに使う。
  （例: 「このサイトについて」の導入文。core/ext にまたがっていたため
   LCP が 2.25s まで落ちていた）
  付けすぎると core が太ってトップが遅くなるので、本当に最初に見える分だけ。
*/
let coreText = '';

/*
  入口ページの判定。dist/index.html と dist/works/index.html。
  作品詳細（dist/works/<slug>/index.html）は含めない。
  本文が長く、入れると core が膨らんで入口が遅くなる。
*/
const isEntryPage = (file) =>
  /[/\\]dist[/\\]index\.html$/.test(file) || /[/\\]dist[/\\]works[/\\]index\.html$/.test(file);

for (const file of htmlFiles) {
  const raw = await readFile(file, 'utf-8');
  const cleaned = stripNonRendered(raw);

  const pageText = stripTags(cleaned) + ' ' + renderedAttributeText(cleaned);
  renderedText += pageText;
  if (isEntryPage(file)) coreText += pageText;

  // ページ側が core に入れるよう指定した要素
  for (const m of cleaned.matchAll(/<(\w+)[^>]*\bdata-font-core\b[^>]*>([\s\S]*?)<\/\1>/gi)) {
    coreText += stripTags(m[2]) + ' ';
  }

  // 太字で描画されうるコンテキスト: 見出し・strong・b・th
  for (const m of cleaned.matchAll(
    /<(h[1-6]|strong|b|th)\b[^>]*>([\s\S]*?)<\/\1>/gi
  )) {
    boldText += stripTags(m[2]) + ' ';
  }
}

/*
  和文の下敷き。サブセットを作り直す前に文章を足したとき（npm run build だけで確かめるとき）でも、
  句読点・括弧などの約物だけは core から欠けないようにしておく。
  約物は新しい文にほぼ必ず出てきて、欠けると本文の中で書体が混ざって目立つ。
  漢字や仮名は、足しても新しい文を覆える見込みが低く、全ページで読む core を太らせるだけなので入れない
  （サイトで実際に使う字は、出力 HTML から毎回集めている）。
*/
const BASELINE_JP = '、。・ー「」『』（）！？：／〜…々％＆';

const LATIN_TEXT =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789' +
  " .,:;!?()[]{}'\"-–—/_+*&%$#@~^|\\<>=`ĀāĒēĪīŌōŪū";

// core = 入口ページと明示指定された要素で必要な文字。ext = 残り全部（core と重複させない）。
const uniq = (s) => [...new Set([...s])];
const CORE_SET = uniq(coreText + BASELINE_JP + LATIN_TEXT).join('');
const coreChars = new Set([...CORE_SET]);
const EXT_SET = uniq(renderedText)
  .filter((c) => !coreChars.has(c))
  .join('');

const jobs = [
  // Archivo は LCP要素（ヒーローの大見出し）の書体なので、可変軸を残さず
  // 単一ウェイトの静的インスタンスにする。
  //   wght: 700 のみ。可変（400-700）だと 20.1KB、ウェイト別2ファイルだと
  //         リクエストが1本増え、どちらも LCP を押し上げた（実測）。
  //         .font-display を使う要素は全てディスプレイ用の大きな文字なので、
  //         700 に統一して問題ない（base.css で font-weight を指定している）。
  //   wdth: サイト内で実際に描画されるのは 80 のみ。仕様の 75〜85 帯の中で固定。
  //         別の幅にしたいならここを変えて再実行する。
  {
    src: 'Archivo.ttf',
    out: 'Archivo-display.woff2',
    text: LATIN_TEXT,
    variationAxes: { wdth: 80, wght: 700 },
  },
  {
    src: 'ZenKakuGothicNew-Regular.ttf',
    out: 'ZenKakuGothicNew-Regular.woff2',
    text: CORE_SET,
    emitRangeFor: 'core',
  },
  {
    // core との重複を持たない補集合。2ファイル合計が単一サブセットとほぼ同じ量になる。
    src: 'ZenKakuGothicNew-Regular.ttf',
    out: 'ZenKakuGothicNew-Regular-ext.woff2',
    text: EXT_SET,
    emitRangeFor: 'ext',
  },
  {
    src: 'ZenKakuGothicNew-Bold.ttf',
    out: 'ZenKakuGothicNew-Bold.woff2',
    // 見出し・strong だけ。本文全部を入れない（§8のフォント予算200KBを守るため）
    text: boldText + BASELINE_JP + LATIN_TEXT,
  },
  {
    src: 'IBMPlexMono-Regular.ttf',
    out: 'IBMPlexMono-Regular.woff2',
    text: LATIN_TEXT,
  },
];

/** 連続するコードポイントを U+XX-YY にまとめた unicode-range 文字列を作る */
function toUnicodeRange(text) {
  const points = [...new Set([...text].map((c) => c.codePointAt(0)))].sort((a, b) => a - b);
  const parts = [];
  let start = points[0];
  let prev = points[0];
  const hex = (n) => n.toString(16).toUpperCase().padStart(4, '0');
  for (const p of points.slice(1)) {
    if (p === prev + 1) {
      prev = p;
      continue;
    }
    parts.push(start === prev ? `U+${hex(start)}` : `U+${hex(start)}-${hex(prev)}`);
    start = prev = p;
  }
  parts.push(start === prev ? `U+${hex(start)}` : `U+${hex(start)}-${hex(prev)}`);
  return parts.join(',');
}

/*
  元フォントが実際に収録しているコードポイントの集合を cmap から読む。

  unicode-range は「このファイルがこの文字を持つ」という**宣言**であって保証ではない。
  元フォントに無い字を要求しても、サブセット結果には入らない。それなのに範囲だけが
  その字を主張すると、ブラウザは core を選び → 字が無い → 同じ family の全範囲フェイス
  （ext）へ落ちて、**57KB を無駄に取得する**。

  実際に踏んだ: 経歴に「～」（U+FF5E 全角チルダ）を書いたところ、Zen Kaku Gothic New が
  この字を持たないため、トップページが ext まで取得して LCP が 1728→2179ms になった。
  日本語の波ダッシュは「〜」（U+301C）が正しく、そちらは収録されている。

  そこで、サブセットに渡す前に「元フォントに無い字」を落とす。範囲が嘘をつかなくなり、
  同じ事故が起きなくなる。落とした字はビルドログに出す（表示は環境のフォールバック任せになる）。
*/
function fontCoverage(buf) {
  const numTables = buf.readUInt16BE(4);
  let cmapOff = 0;
  for (let i = 0; i < numTables; i++) {
    const p = 12 + i * 16;
    if (buf.toString('ascii', p, p + 4) === 'cmap') cmapOff = buf.readUInt32BE(p + 8);
  }
  if (!cmapOff) return null;

  // format 12（全平面）を優先し、無ければ format 4（BMP）を使う
  let best = null;
  const n = buf.readUInt16BE(cmapOff + 2);
  for (let i = 0; i < n; i++) {
    const rec = cmapOff + 4 + i * 8;
    const off = cmapOff + buf.readUInt32BE(rec + 4);
    const format = buf.readUInt16BE(off);
    const score = format === 12 ? 2 : format === 4 ? 1 : 0;
    if (score > 0 && (!best || score > best.score)) best = { off, format, score };
  }
  if (!best) return null;

  const set = new Set();
  if (best.format === 12) {
    const groups = buf.readUInt32BE(best.off + 12);
    for (let i = 0; i < groups; i++) {
      const g = best.off + 16 + i * 12;
      const start = buf.readUInt32BE(g);
      const end = buf.readUInt32BE(g + 4);
      if (buf.readUInt32BE(g + 8) === 0) continue; // .notdef に落ちる範囲
      for (let c = start; c <= end; c++) set.add(c);
    }
  } else {
    const segX2 = buf.readUInt16BE(best.off + 6);
    const endO = best.off + 14;
    const startO = endO + segX2 + 2;
    const deltaO = startO + segX2;
    const rangeO = deltaO + segX2;
    for (let i = 0; i < segX2 / 2; i++) {
      const end = buf.readUInt16BE(endO + i * 2);
      const start = buf.readUInt16BE(startO + i * 2);
      const delta = buf.readInt16BE(deltaO + i * 2);
      const ro = buf.readUInt16BE(rangeO + i * 2);
      if (start === 0xffff) continue;
      for (let c = start; c <= end; c++) {
        let gid;
        if (ro === 0) gid = (c + delta) & 0xffff;
        else {
          const gi = rangeO + i * 2 + ro + (c - start) * 2;
          if (gi + 1 >= buf.length) continue;
          gid = buf.readUInt16BE(gi);
          if (gid !== 0) gid = (gid + delta) & 0xffff;
        }
        if (gid !== 0) set.add(c);
      }
    }
  }
  return set;
}

const distExists = await exists(DIST_FONT_DIR);
if (distExists) await mkdir(DIST_FONT_DIR, { recursive: true });

let total = 0;
const emittedRanges = {};
for (const job of jobs) {
  const inputBuf = await readFile(new URL(job.src, SRC_DIR));

  // 元フォントに無い字は落とす（理由は fontCoverage のコメント）
  const coverage = fontCoverage(inputBuf);
  let text = job.text;
  if (coverage) {
    const dropped = [...new Set([...job.text])].filter((c) => !coverage.has(c.codePointAt(0)));
    if (dropped.length > 0) {
      text = [...job.text].filter((c) => coverage.has(c.codePointAt(0))).join('');
      // 空白類はグリフが無くても表示に影響しないので知らせない（ログが読めなくなるだけ）
      const visible = dropped.filter((c) => !/s/u.test(c));
      if (visible.length > 0) {
        const shown = visible
          .map((c) => `${c} (U+${c.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')})`)
          .join(', ');
        console.warn(`  警告: ${job.src} に無い文字を除外しました -> ${shown}`);
      }
    }
  }

  const outBuf = await subsetFont(inputBuf, text, {
    targetFormat: 'woff2',
    ...(job.variationAxes ? { variationAxes: job.variationAxes } : {}),
  });
  await writeFile(new URL(job.out, OUT_DIR), outBuf);
  if (distExists) await writeFile(new URL(job.out, DIST_FONT_DIR), outBuf);
  if (job.emitRangeFor) emittedRanges[job.emitRangeFor] = toUnicodeRange(text);
  total += outBuf.length;
  console.log(`${job.src} -> ${job.out}: ${(outBuf.length / 1024).toFixed(1)}KB`);
}

// unicode-range は生成した文字集合とズレると欠字になるため、手書きせず自動生成する。
//
// ext 側には unicode-range を書かない（= 全範囲）。代わりに **core を後に定義する**。
//
// CSS Fonts 4 §4.5 は、同じ family / style で unicode-range が重なる場合
// 「後に定義された規則から先に照合する」と定めている。したがって
//   - core の範囲内の文字 … 先に照合される core が使われる（正しい）
//   - それ以外の文字       … core が外れ、全範囲の ext が使われる（正しい）
// となり、両方に範囲を書いたときと結果は完全に一致する。
// 取得も従来どおり必要な側だけで、トップページが ext を落とすことはない。
//
// なぜこうするか: unicode-range の文字列そのものが重い。
// CSSはインライン化しているため、この文字列は**全ページのHTMLに焼き込まれる**。
// ext 側の範囲は 2974バイト（gzip 1122バイト）あり、これを消すと全ページの
// 文書がその分小さくなる。「このサイトについて」は文書サイズがそのまま
// FCP → LCP に効くページなので（仕様書 §8 の但し書き）、ここが直接効く。
//
// 順序を入れ替えてはいけない。core を先に書くと、core の範囲内の文字にも
// 全範囲の ext が優先され、字形が欠ける（ext にその字は入っていない）。
const generatedCss = `/*
  自動生成 — 直接編集しないこと（\`npm run fonts:subset\` が書き出す）。

  和文 Regular を、重複のない2つのサブセットに分割している。
  - core: トップページで実際に使う文字
  - ext:  それ以外のページでしか出てこない文字

  ext には unicode-range を書かず（全範囲）、core を後に定義している。
  CSS は「後に定義された @font-face から先に照合する」ため、core の範囲内は
  core が、範囲外は ext が使われる。両方に範囲を書くのと結果は同じで、
  巨大な範囲文字列を1つ減らせる（全ページのHTMLに焼き込まれるため）。

  **この2つの順序を入れ替えないこと。** core を先に書くと ext が優先され、
  トップページの和文が欠ける。
*/
@font-face {
  font-family: 'Zen Kaku Gothic New';
  src: url('/fonts/ZenKakuGothicNew-Regular-ext.woff2') format('woff2');
  font-weight: 400;
  font-style: normal;
  font-display: swap;
}

@font-face {
  font-family: 'Zen Kaku Gothic New';
  src: url('/fonts/ZenKakuGothicNew-Regular.woff2') format('woff2');
  font-weight: 400;
  font-style: normal;
  font-display: swap;
  unicode-range: ${emittedRanges.core};
}
`;
await writeFile(new URL('../src/styles/fonts-jp.generated.css', import.meta.url), generatedCss);

const totalKb = total / 1024;
const BUDGET_KB = 200;
console.log(`\n合計: ${totalKb.toFixed(1)}KB / 予算 ${BUDGET_KB}KB`);
if (totalKb > BUDGET_KB) {
  console.error(`フォント予算超過: ${totalKb.toFixed(1)}KB > ${BUDGET_KB}KB`);
  process.exit(1);
}
