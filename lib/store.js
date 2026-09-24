// Storage layer. In production this talks to Upstash Redis over its REST API
// (added from the Vercel Storage tab, which injects KV_REST_API_URL and
// KV_REST_API_TOKEN). Locally, with no Redis configured, it falls back to a
// JSON file in .data/ so the whole portal can run with `npm run dev`.

import fs from 'node:fs';
import path from 'node:path';

const REDIS_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || '';
const REDIS_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || '';

export const PREFIX = process.env.KEY_PREFIX || 'cdwm:';

export function storageKind() {
  if (REDIS_URL && REDIS_TOKEN) return 'redis';
  if (process.env.VERCEL) return 'none';
  return 'file';
}

export function storageSecret() {
  return process.env.SESSION_SECRET || REDIS_TOKEN || 'local-dev-only-secret';
}

/* ---------------------------- Upstash REST ---------------------------- */

async function redisPipeline(commands) {
  const res = await fetch(`${REDIS_URL.replace(/\/$/, '')}/pipeline`, {
    method: 'POST',
    headers: { authorization: `Bearer ${REDIS_TOKEN}`, 'content-type': 'application/json' },
    body: JSON.stringify(commands),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Redis request failed (${res.status}): ${text.slice(0, 200)}`);
  }
  const out = await res.json();
  return out.map((r) => {
    if (r && r.error) throw new Error(`Redis error: ${r.error}`);
    return r ? r.result : null;
  });
}

/* ------------------------- Local JSON file store ---------------------- */

const DATA_DIR = process.env.LOCAL_DATA_DIR || path.join(process.cwd(), '.data');
const DATA_FILE = path.join(DATA_DIR, 'db.json');
let memory = null;

function loadFile() {
  if (memory) return memory;
  try {
    memory = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch {
    memory = {};
  }
  return memory;
}

function saveFile() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(memory, null, 2));
}

function fileCommand(db, [cmd, ...args]) {
  const op = String(cmd).toUpperCase();
  switch (op) {
    case 'GET':
      return typeof db[args[0]] === 'string' ? db[args[0]] : null;
    case 'MGET':
      return args.map((k) => (typeof db[k] === 'string' ? db[k] : null));
    case 'SET': {
      const [key, value, ...opts] = args;
      if (opts.map((o) => String(o).toUpperCase()).includes('NX') && db[key] != null) return null;
      db[key] = String(value);
      return 'OK';
    }
    case 'DEL': {
      let n = 0;
      for (const k of args) if (k in db) { delete db[k]; n++; }
      return n;
    }
    case 'INCR': {
      const next = Number(db[args[0]] || 0) + 1;
      db[args[0]] = String(next);
      return next;
    }
    case 'EXPIRE':
      return 1;
    case 'HGET':
      return db[args[0]]?.[args[1]] ?? null;
    case 'HSET': {
      const [key, ...pairs] = args;
      const h = (db[key] && typeof db[key] === 'object') ? db[key] : (db[key] = {});
      let added = 0;
      for (let i = 0; i < pairs.length; i += 2) {
        if (!(pairs[i] in h)) added++;
        h[pairs[i]] = String(pairs[i + 1]);
      }
      return added;
    }
    case 'HDEL': {
      const [key, ...fields] = args;
      let n = 0;
      for (const f of fields) if (db[key] && f in db[key]) { delete db[key][f]; n++; }
      return n;
    }
    case 'HGETALL': {
      const h = db[args[0]];
      if (!h || typeof h !== 'object') return [];
      return Object.entries(h).flat();
    }
    default:
      throw new Error(`Local store does not support ${op}`);
  }
}

/* ------------------------------ Public API ----------------------------- */

// Runs commands in order and returns their results.
export async function pipeline(commands) {
  const kind = storageKind();
  if (kind === 'redis') return redisPipeline(commands);
  if (kind === 'file') {
    const db = loadFile();
    const results = commands.map((c) => fileCommand(db, c));
    if (commands.some((c) => !['GET', 'MGET', 'HGET', 'HGETALL'].includes(String(c[0]).toUpperCase()))) saveFile();
    return results;
  }
  const err = new Error('No storage configured');
  err.code = 'storage_missing';
  throw err;
}

export function hashToObject(flat) {
  const out = {};
  if (!Array.isArray(flat)) return out;
  for (let i = 0; i < flat.length; i += 2) out[flat[i]] = flat[i + 1];
  return out;
}

export function parseJson(text, fallback = null) {
  if (text == null) return fallback;
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

export function parseHashJson(flat) {
  const out = {};
  for (const [k, v] of Object.entries(hashToObject(flat))) {
    const parsed = parseJson(v);
    if (parsed != null) out[k] = parsed;
  }
  return out;
}

// For local testing only.
export function resetLocalStore() {
  memory = {};
  if (storageKind() === 'file') saveFile();
}
