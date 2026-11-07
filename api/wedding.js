// Wedding Shoe Game questions for Adil & Aziza.
//
//   GET    /api/wedding            -> { siteUrl } (public)
//   POST   /api/wedding            -> guest submits { text, name }
//   GET    /api/wedding?list=1     -> MC: every question (needs the MC PIN)
//   PUT    /api/wedding            -> MC: { id, asked, starred } (needs PIN)
//   DELETE /api/wedding?id=...     -> MC: remove a question (needs PIN)
//
// Questions are kept in Redis. If Redis fails and a Vercel Blob store is
// connected, they are kept in Blob instead, with everything encoded in the
// blob's name so a list call reads them all (no caching to go stale).
//
// The MC PIN is the WEDDING_MC_PIN environment variable, or 2026 if unset.
import crypto from 'node:crypto';
import { json, readJson, HttpError, queryParams, str } from '../lib/http.js';
import { pipeline, storageKind, hashToObject, parseJson, PREFIX } from '../lib/store.js';
import { publicSiteUrl } from '../lib/site.js';

const KEY = `${PREFIX}wedding:questions`;
const MC_PIN = String(process.env.WEDDING_MC_PIN || '2026');
// The Blob key is normally BLOB_READ_WRITE_TOKEN, but Vercel can save it under
// a custom prefix, so also look for any variable holding a Blob key.
const BLOB_TOKEN = process.env.BLOB_READ_WRITE_TOKEN
  || Object.values(process.env).find((v) => typeof v === 'string' && v.startsWith('vercel_blob_rw_'))
  || '';
const HAS_BLOB = !!BLOB_TOKEN;
const BLOB_ROOT = 'wedding-shoe-game/';

function handle(fn) {
  return async (request) => {
    try {
      return await fn(request);
    } catch (err) {
      if (err instanceof HttpError) return json({ error: err.code, message: err.message }, err.status);
      console.error(err);
      const detail = String(err && err.message || err).replace(/https?:\/\/\S+/g, '').slice(0, 160);
      return json({ error: 'server_error', message: `Server problem: ${detail}` }, 500);
    }
  };
}

function checkPin(request) {
  const given = String(request.headers.get('x-mc-pin') || '');
  const a = Buffer.from(given);
  const b = Buffer.from(MC_PIN);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    throw new HttpError(401, 'bad_pin', 'That PIN is not right.');
  }
}

const redisOn = () => storageKind() !== 'none';

/* ------------------------------ Blob backup ------------------------------ */

const b64 = (s) => Buffer.from(s, 'utf8').toString('base64url');
const unb64 = (s) => Buffer.from(s, 'base64url').toString('utf8');

async function blobPut(pathname) {
  const { put } = await import('@vercel/blob');
  const opts = { addRandomSuffix: false, allowOverwrite: true, contentType: 'text/plain', token: BLOB_TOKEN };
  try {
    await put(pathname, '1', { ...opts, access: 'public' });
  } catch {
    await put(pathname, '1', { ...opts, access: 'private' });
  }
}

async function blobListAll() {
  const { list } = await import('@vercel/blob');
  const out = [];
  let cursor;
  do {
    const page = await list({ prefix: BLOB_ROOT, cursor, limit: 1000, token: BLOB_TOKEN });
    out.push(...page.blobs);
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  return out;
}

async function blobSave(item) {
  let text = item.text;
  let path;
  for (;;) {
    path = `${BLOB_ROOT}q/${item.id}/${b64(JSON.stringify({ text, name: item.name, at: item.at }))}`;
    if (path.length < 900 || text.length < 10) break;
    text = text.slice(0, -10);
  }
  await blobPut(path);
}

async function blobLoad() {
  const blobs = await blobListAll();
  const items = {};
  const flags = {};
  const deleted = new Set();
  for (const b of blobs) {
    const parts = b.pathname.slice(BLOB_ROOT.length).split('/');
    if (parts[0] === 'q' && parts.length >= 3) {
      const data = parseJson(unb64(parts[2]));
      if (data) items[parts[1]] = { id: parts[1], text: data.text, name: data.name || '', at: data.at, asked: false, starred: false };
    } else if (parts[0] === 'f' && parts.length >= 3) {
      const [flagStr, ts] = parts[2].split('-');
      const prev = flags[parts[1]];
      if (!prev || Number(ts) > prev.ts) flags[parts[1]] = { ts: Number(ts), asked: flagStr[0] === '1', starred: flagStr[1] === '1' };
    } else if (parts[0] === 'd' && parts[1]) {
      deleted.add(parts[1]);
    }
  }
  return Object.values(items)
    .filter((q) => !deleted.has(q.id))
    .map((q) => (flags[q.id] ? { ...q, asked: flags[q.id].asked, starred: flags[q.id].starred } : q));
}

/* -------------------------------- Loading -------------------------------- */

async function loadAll() {
  const errors = [];
  const byId = {};
  if (redisOn()) {
    try {
      const [flat] = await pipeline([['HGETALL', KEY]]);
      for (const v of Object.values(hashToObject(flat))) {
        const q = parseJson(v);
        if (q) byId[q.id] = q;
      }
    } catch (err) {
      errors.push(`database: ${err.message}`);
    }
  }
  if (HAS_BLOB) {
    try {
      for (const q of await blobLoad()) if (!byId[q.id]) byId[q.id] = q;
    } catch (err) {
      errors.push(`backup: ${err.message}`);
    }
  }
  const active = (redisOn() ? 1 : 0) + (HAS_BLOB ? 1 : 0);
  if (!active) throw new HttpError(503, 'storage_missing', 'The question box is not connected to a database yet.');
  if (errors.length >= active) throw new Error(errors.join(' | '));
  return Object.values(byId).sort((x, y) => x.at - y.at);
}

/* -------------------------------- Handlers ------------------------------- */

export const GET = handle(async (request) => {
  const q = queryParams(request);
  if (!q.get('list')) return json({ ok: true, siteUrl: publicSiteUrl(), redis: redisOn(), blob: HAS_BLOB });
  checkPin(request);
  return json({ ok: true, questions: await loadAll(), siteUrl: publicSiteUrl() });
});

export const POST = handle(async (request) => {
  const body = await readJson(request, 5000);
  let text = str(body.text, 200)
    .replace(/\s+/g, ' ')
    .replace(/^\.+\s*/, '')
    .replace(/^(who('|’)?s|who is)\s+(the\s+)?(most\s+)?likely\s+to\s*/i, '')
    .replace(/^\.+\s*/, '')
    .trim();
  const name = str(body.name, 60).replace(/\s+/g, ' ');
  if (text.length < 3) throw new HttpError(400, 'too_short', 'Write a question first.');
  if (!/[?.!]$/.test(text)) text += '?';

  const item = { id: crypto.randomBytes(6).toString('hex'), text, name, at: Date.now(), asked: false, starred: false };
  const errors = [];
  if (redisOn()) {
    try {
      await pipeline([['HSET', KEY, item.id, JSON.stringify(item)]]);
      return json({ ok: true });
    } catch (err) {
      console.error('wedding redis write failed', err);
      errors.push(`database: ${err.message}`);
    }
  }
  if (!HAS_BLOB) errors.push('no backup storage connected');
  if (HAS_BLOB) {
    try {
      await blobSave(item);
      return json({ ok: true, backup: true });
    } catch (err) {
      console.error('wedding blob write failed', err);
      errors.push(`backup: ${err.message}`);
    }
  }
  if (!errors.length) throw new HttpError(503, 'storage_missing', 'The question box is not connected to a database yet.');
  throw new Error(errors.join(' | '));
});

export const PUT = handle(async (request) => {
  checkPin(request);
  const body = await readJson(request, 5000);
  const id = str(body.id, 40).replace(/[^a-f0-9]/g, '');
  if (redisOn()) {
    try {
      const [raw] = await pipeline([['HGET', KEY, id]]);
      const item = parseJson(raw);
      if (item) {
        if (typeof body.asked === 'boolean') item.asked = body.asked;
        if (typeof body.starred === 'boolean') item.starred = body.starred;
        await pipeline([['HSET', KEY, id, JSON.stringify(item)]]);
        return json({ ok: true, question: item });
      }
    } catch (err) {
      if (!HAS_BLOB) throw err;
    }
  }
  if (!HAS_BLOB) throw new HttpError(404, 'not_found', 'That question has gone.');
  const current = (await blobLoad()).find((q) => q.id === id);
  if (!current) throw new HttpError(404, 'not_found', 'That question has gone.');
  const asked = typeof body.asked === 'boolean' ? body.asked : current.asked;
  const starred = typeof body.starred === 'boolean' ? body.starred : current.starred;
  await blobPut(`${BLOB_ROOT}f/${id}/${asked ? 1 : 0}${starred ? 1 : 0}-${Date.now()}`);
  return json({ ok: true, question: { ...current, asked, starred } });
});

export const DELETE = handle(async (request) => {
  checkPin(request);
  const id = str(queryParams(request).get('id'), 40).replace(/[^a-f0-9]/g, '');
  let done = false;
  if (redisOn()) {
    try {
      await pipeline([['HDEL', KEY, id]]);
      done = true;
    } catch (err) {
      if (!HAS_BLOB) throw err;
    }
  }
  if (HAS_BLOB) {
    try {
      await blobPut(`${BLOB_ROOT}d/${id}`);
      done = true;
    } catch (err) {
      if (!done) throw err;
    }
  }
  return json({ ok: true });
});
