// Local dev server: serves /public and runs the /api functions the same way
// Vercel does (Web Request in, Web Response out). With no Redis env vars set,
// data is kept in .data/db.json.
//
//   npm run dev              -> http://localhost:3000
//   npm run dev -- --reset   -> start with an empty database
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gtaFontFace } from './fonts.mjs';
import { withModulePreloads } from './preload.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = path.join(root, 'public');
const PORT = Number(process.env.PORT || 3000);

if (process.argv.includes('--reset')) {
  const dir = process.env.LOCAL_DATA_DIR || path.join(root, '.data');
  fs.rmSync(dir, { recursive: true, force: true });
  console.log(`Cleared ${dir}`);
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.woff': 'font/woff',
  '.txt': 'text/plain; charset=utf-8',
};

const SKIP_HEADERS = new Set(['connection', 'keep-alive', 'transfer-encoding', 'upgrade', 'expect']);

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function runApi(req, res, url) {
  const name = url.pathname.slice('/api/'.length).replace(/\/$/, '');
  const file = path.join(root, 'api', `${name}.js`);
  if (!/^[a-z-]+$/.test(name) || !fs.existsSync(file)) {
    res.writeHead(404, { 'content-type': 'text/plain' });
    return res.end('Not found');
  }
  const mod = await import(pathToFileURL(file).href);
  const handler = mod[req.method];
  if (typeof handler !== 'function') {
    res.writeHead(405, { 'content-type': 'text/plain' });
    return res.end('Method not allowed');
  }
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) {
    if (!SKIP_HEADERS.has(k) && v != null) headers.set(k, Array.isArray(v) ? v.join(', ') : v);
  }
  if (!headers.has('x-forwarded-for')) headers.set('x-forwarded-for', req.socket.remoteAddress || '127.0.0.1');
  const body = ['GET', 'HEAD'].includes(req.method) ? undefined : await readBody(req);
  const request = new Request(url, { method: req.method, headers, body });
  const response = await handler(request);
  const out = {};
  response.headers.forEach((v, k) => (out[k] = v));
  res.writeHead(response.status, out);
  res.end(Buffer.from(await response.arrayBuffer()));
}

function serveStatic(req, res, url) {
  let rel = decodeURIComponent(url.pathname);
  if (rel.endsWith('/')) rel += 'index.html';
  const file = path.normalize(path.join(PUBLIC, rel));
  if (!file.startsWith(PUBLIC) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404, { 'content-type': 'text/plain' });
    return res.end('Not found');
  }
  res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache' });
  if (rel === '/css/app.css') return res.end(gtaFontFace(PUBLIC) + fs.readFileSync(file, 'utf8'));
  if (rel === '/index.html') return res.end(withModulePreloads(fs.readFileSync(file, 'utf8'), PUBLIC));
  fs.createReadStream(file).pipe(res);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  try {
    if (url.pathname.startsWith('/api/')) await runApi(req, res, url);
    else serveStatic(req, res, url);
  } catch (err) {
    console.error(err);
    if (!res.headersSent) res.writeHead(500, { 'content-type': 'text/plain' });
    res.end('Dev server error');
  }
});

server.listen(PORT, () => {
  const kind = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL ? 'Upstash Redis' : 'local file (.data/db.json)';
  console.log(`Come Dine portal running at http://localhost:${PORT}  (storage: ${kind})`);
});
