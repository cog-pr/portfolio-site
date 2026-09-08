// 作品のサムネイル/カバー画像のプレースホルダーを生成する。
// 実際の制作物の画像に差し替えるまでの仮素材（ビル夜景ふうの窓パターン）。
import { mkdir, writeFile } from 'node:fs/promises';

const TOKENS = {
  void: '#000000',
  facade: '#0B0A14',
  facadeLit: '#1A0740',
  signal: '#4805F1',
  fluorescent: '#F2F0FF',
  sodium: '#FF7A18',
};

function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildingSvg({ width, height, seed, coverMode }) {
  const rand = mulberry32(seed);
  const cols = coverMode ? 14 : 6;
  const rows = coverMode ? 7 : 8;
  const gap = 4;
  const cellW = (width - gap * (cols + 1)) / cols;
  const cellH = (height - gap * (rows + 1)) / rows;

  let rects = '';
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = gap + c * (cellW + gap);
      const y = gap + r * (cellH + gap);
      const roll = rand();
      let fill = TOKENS.facade;
      if (roll > 0.82) fill = TOKENS.signal;
      else if (roll > 0.6) fill = TOKENS.facadeLit;
      rects += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${cellW.toFixed(1)}" height="${cellH.toFixed(1)}" fill="${fill}" />`;
    }
  }

  // 一点だけナトリウム灯を混ぜる（画面全体ではなく素材内の演出として最小限）
  if (coverMode) {
    const sr = Math.floor(rand() * rows);
    const sc = Math.floor(rand() * cols);
    const x = gap + sc * (cellW + gap);
    const y = gap + sr * (cellH + gap);
    rects += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${cellW.toFixed(1)}" height="${cellH.toFixed(1)}" fill="${TOKENS.sodium}" />`;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="${width}" height="${height}" fill="${TOKENS.void}" />
  ${rects}
</svg>`;
}

// src/content/works/*.md の slug と揃えること。
// 実際のスクリーンショットに差し替えたら、その作品はこの配列から外す。
//
// 2026-09-08 に全4件が実際の画面に差し替わったため、対象はゼロ。
// スクリーンショットをすぐ用意できない作品を追加したときだけ、ここに足す。
const works = [];

const DEST = new URL('../src/content/works/images/', import.meta.url);
await mkdir(DEST, { recursive: true });

for (const w of works) {
  const thumb = buildingSvg({ width: 480, height: 640, seed: w.seed, coverMode: false });
  const cover = buildingSvg({ width: 1600, height: 900, seed: w.seed + 1, coverMode: true });
  await writeFile(new URL(`${w.slug}-thumb.svg`, DEST), thumb);
  await writeFile(new URL(`${w.slug}-cover.svg`, DEST), cover);
  console.log(`generated images for ${w.slug}`);
}
