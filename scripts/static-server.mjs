// 計測用の静的サーバー。
//
// `astro preview` は gzip を返さないが、本番（Cloudflare Workers Static Assets）はテキスト資産を
// 必ず圧縮して配信する。非圧縮のまま計測すると HTML が実測の約5倍の転送量になり、
// LCP を本番より悪く見積もってしまう。
// 「このサイトについて」で公開する数値を本番と揃えるため、圧縮ありで配信する。
import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat, readFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const DIST = fileURLToPath(new URL('../dist/', import.meta.url));

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.avif': 'image/avif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
};

// woff2 / 画像は既に圧縮済みなので再圧縮しない
const COMPRESSIBLE = new Set(['.html', '.css', '.js', '.json', '.svg']);

async function resolveFile(urlPath) {
  const clean = decodeURIComponent(urlPath.split('?')[0]);
  // ディレクトリトラバーサル防止
  const rel = path.normalize(clean).replace(/^([/\\])+/, '');
  let file = path.join(DIST, rel);
  if (!file.startsWith(DIST)) return null;

  try {
    const s = await stat(file);
    if (s.isDirectory()) file = path.join(file, 'index.html');
  } catch {
    return null;
  }
  try {
    await stat(file);
    return file;
  } catch {
    return null;
  }
}

export function startStaticServer(port) {
  const server = createServer(async (req, res) => {
    const file = await resolveFile(req.url ?? '/');
    if (!file) {
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end('not found');
      return;
    }

    const ext = path.extname(file).toLowerCase();
    const type = TYPES[ext] ?? 'application/octet-stream';
    const acceptsGzip = /\bgzip\b/.test(req.headers['accept-encoding'] ?? '');

    if (COMPRESSIBLE.has(ext) && acceptsGzip) {
      const body = gzipSync(await readFile(file));
      res.writeHead(200, {
        'content-type': type,
        'content-encoding': 'gzip',
        'content-length': body.length,
        'cache-control': 'public, max-age=31536000',
      });
      res.end(body);
      return;
    }

    const s = await stat(file);
    res.writeHead(200, {
      'content-type': type,
      'content-length': s.size,
      'cache-control': 'public, max-age=31536000',
    });
    createReadStream(file).pipe(res);
  });

  return new Promise((resolve) => {
    server.listen(port, () => resolve(server));
  });
}

// `node scripts/static-server.mjs [port]` で単体起動できる（Lighthouse CI 用）。
// Windows ではドライブレターの扱いで単純な文字列比較が一致しないため pathToFileURL を使う。
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const port = Number(process.argv[2] ?? 4173);
  await startStaticServer(port);
  console.log(`serving dist/ with gzip on http://localhost:${port}`);
}
