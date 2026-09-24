// Sessions for the organiser (admin PIN) and for teams (secret team codes).
// Tokens are HMAC signed and carry a fingerprint of the current PIN or code,
// so changing a PIN or regenerating a team code logs out old sessions.

import crypto from 'node:crypto';
import { storageSecret } from './store.js';
import { HttpError, bearer } from './http.js';

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function b64url(buf) {
  return Buffer.from(buf).toString('base64url');
}

function signingKey() {
  return crypto.createHash('sha256').update(`cdwm-session|${storageSecret()}`).digest();
}

function fingerprint(secret) {
  return crypto.createHash('sha256').update(`fp|${secret}`).digest('base64url').slice(0, 12);
}

export function signToken(payload) {
  const body = b64url(JSON.stringify(payload));
  const sig = crypto.createHmac('sha256', signingKey()).update(body).digest('base64url');
  return `${body}.${sig}`;
}

export function readToken(token) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return null;
  const [body, sig] = token.split('.');
  const expected = crypto.createHmac('sha256', signingKey()).update(body).digest('base64url');
  const a = Buffer.from(sig || '');
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    return JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

export function hashPin(pin, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(String(pin), salt, 32).toString('hex');
  return { salt, hash };
}

export function checkPin(pin, salt, hash) {
  if (!salt || !hash) return false;
  const test = crypto.scryptSync(String(pin), salt, 32);
  const known = Buffer.from(hash, 'hex');
  return test.length === known.length && crypto.timingSafeEqual(test, known);
}

export function safeEqual(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

export function newTeamCode() {
  const bytes = crypto.randomBytes(6);
  let out = '';
  for (const byte of bytes) out += CODE_ALPHABET[byte % CODE_ALPHABET.length];
  return out;
}

export function normaliseCode(code) {
  return String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
}

export function newId(prefix) {
  return `${prefix}${crypto.randomBytes(4).toString('hex')}`;
}

/* ------------------------------- Admin -------------------------------- */

export function envAdminPin() {
  return process.env.ADMIN_PIN ? String(process.env.ADMIN_PIN) : '';
}

function adminFingerprint(secrets) {
  const env = envAdminPin();
  return fingerprint(env ? `env:${env}` : `hash:${secrets?.adminHash || ''}`);
}

export function verifyAdminPin(pin, secrets) {
  const env = envAdminPin();
  if (env) return safeEqual(String(pin), env);
  return checkPin(pin, secrets?.adminSalt, secrets?.adminHash);
}

export function adminToken(secrets) {
  return signToken({ r: 'admin', k: adminFingerprint(secrets), iat: Date.now() });
}

export function requireAdmin(request, secrets) {
  const payload = readToken(bearer(request));
  if (!payload || payload.r !== 'admin' || payload.k !== adminFingerprint(secrets)) {
    throw new HttpError(401, 'not_admin', 'Organiser login needed. Log in again with the PIN.');
  }
  return payload;
}

/* ------------------------------- Teams -------------------------------- */

export function teamToken(teamId, code) {
  return signToken({ r: 'team', t: teamId, k: fingerprint(`team:${code}`), iat: Date.now() });
}

export function requireTeam(request, secrets) {
  const payload = readToken(bearer(request));
  const code = payload?.t ? secrets?.teamCodes?.[payload.t] : null;
  if (!payload || payload.r !== 'team' || !code || payload.k !== fingerprint(`team:${code}`)) {
    throw new HttpError(401, 'not_team', 'Your team login has expired. Use your team link or code again.');
  }
  return payload.t;
}

export function findTeamByCode(code, secrets) {
  const wanted = normaliseCode(code);
  if (!wanted) return null;
  let match = null;
  for (const [teamId, teamCode] of Object.entries(secrets?.teamCodes || {})) {
    if (safeEqual(normaliseCode(teamCode), wanted)) match = teamId;
  }
  return match;
}
