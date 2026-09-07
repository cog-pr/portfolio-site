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

// 和文の下敷き。コンテンツが差し替わっても最低限の字形は保証しておく。
const BASELINE_JP =
  '闇が主役で光は例外である夜の都市窓明かり作品制作年役割技術スタック' +
  '設計実装デザイン開発の一覧について選定意思決定ログ検討した選択肢決め手振り返り' +
  '実測値このサイト初期転送量測定公開連絡先お問い合わせ全て見る戻る次へ前へ';

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

const distExists = await exists(DIST_FONT_DIR);
if (distExists) await mkdir(DIST_FONT_DIR, { recursive: true });

let total = 0;
const emittedRanges = {};
for (const job of jobs) {
  const inputBuf = await readFile(new URL(job.src, SRC_DIR));
  const outBuf = await subsetFont(inputBuf, job.text, {
    targetFormat: 'woff2',
    ...(job.variationAxes ? { variationAxes: job.variationAxes } : {}),
  });
  await writeFile(new URL(job.out, OUT_DIR), outBuf);
  if (distExists) await writeFile(new URL(job.out, DIST_FONT_DIR), outBuf);
  if (job.emitRangeFor) emittedRanges[job.emitRangeFor] = toUnicodeRange(job.text);
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
