// Wedding "Who's most likely to" questions for Adil & Aziza.
//
//   GET    /api/wedding            -> { siteUrl } (public, for the QR code)
//   POST   /api/wedding            -> guest submits { text, name }
//   GET    /api/wedding?list=1     -> MC: every question (needs the MC PIN)
//   PUT    /api/wedding            -> MC: { id, asked, starred } (needs PIN)
//   DELETE /api/wedding?id=...     -> MC: remove a question (needs PIN)
//
// The MC PIN is the WEDDING_MC_PIN environment variable, or 2026 if unset.
// It is sent in the x-mc-pin header.
import crypto from 'node:crypto';
import { handle, json, readJson, HttpError, clientIp, queryParams, str } from '../lib/http.js';
import { pipeline, storageKind, hashToObject, parseJson, PREFIX } from '../lib/store.js';
import { publicSiteUrl } from '../lib/site.js';

const KEY = `${PREFIX}wedding:questions`;
const MC_PIN = String(process.env.WEDDING_MC_PIN || '2026');
const MAX_PER_HOUR = 30;

function needStorage() {
  if (storageKind() === 'none') {
    throw new HttpError(503, 'storage_missing', 'The question box is not connected to its database yet.');
  }
}

function checkPin(request) {
  const given = String(request.headers.get('x-mc-pin') || '');
  const a = Buffer.from(given);
  const b = Buffer.from(MC_PIN);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    throw new HttpError(401, 'bad_pin', 'That PIN is not right.');
  }
}

async function loadAll() {
  const [flat] = await pipeline([['HGETALL', KEY]]);
  return Object.values(hashToObject(flat))
    .map((v) => parseJson(v))
    .filter(Boolean)
    .sort((x, y) => x.at - y.at);
}

export const GET = handle(async (request) => {
  const q = queryParams(request);
  if (!q.get('list')) return json({ ok: true, siteUrl: publicSiteUrl() });
  needStorage();
  checkPin(request);
  return json({ ok: true, questions: await loadAll(), siteUrl: publicSiteUrl() });
});

export const POST = handle(async (request) => {
  needStorage();
  const body = await readJson(request, 5000);
  let text = str(body.text, 200)
    .replace(/\s+/g, ' ')
    .replace(/^\.+\s*/, '')
    .replace(/^(who('|\u2019)?s|who is)\s+(the\s+)?(most\s+)?likely\s+to\s*/i, '')
    .replace(/^\.+\s*/, '')
    .trim();
  const name = str(body.name, 60).replace(/\s+/g, ' ');
  if (text.length < 3) throw new HttpError(400, 'too_short', 'Write a question first.');
  if (!/[?.!]$/.test(text)) text += '?';

  const rateKey = `${PREFIX}wedding:rate:${clientIp(request)}`;
  const [count] = await pipeline([['INCR', rateKey], ['EXPIRE', rateKey, 3600]]);
  if (Number(count) > MAX_PER_HOUR) {
    throw new HttpError(429, 'slow_down', 'That is a lot of questions! Give the MC a chance to catch up.');
  }

  const item = { id: crypto.randomBytes(6).toString('hex'), text, name, at: Date.now(), asked: false, starred: false };
  await pipeline([['HSET', KEY, item.id, JSON.stringify(item)]]);
  return json({ ok: true });
});

export const PUT = handle(async (request) => {
  needStorage();
  checkPin(request);
  const body = await readJson(request, 5000);
  const id = str(body.id, 40);
  const [raw] = await pipeline([['HGET', KEY, id]]);
  const item = parseJson(raw);
  if (!item) throw new HttpError(404, 'not_found', 'That question has gone.');
  if (typeof body.asked === 'boolean') item.asked = body.asked;
  if (typeof body.starred === 'boolean') item.starred = body.starred;
  await pipeline([['HSET', KEY, id, JSON.stringify(item)]]);
  return json({ ok: true, question: item });
});

export const DELETE = handle(async (request) => {
  needStorage();
  checkPin(request);
  const id = str(queryParams(request).get('id'), 40);
  await pipeline([['HDEL', KEY, id]]);
  return json({ ok: true });
});
