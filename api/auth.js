// GET  /api/auth           -> is the portal set up? has an organiser claimed it?
// POST /api/auth {action}  -> setup | admin | team
import { handle, json, readJson, HttpError, clientIp, str } from '../lib/http.js';
import { loadAll, commit, buildInitialEvent, emptyReveal, toJson, K } from '../lib/data.js';
import { pipeline, storageKind, parseJson } from '../lib/store.js';
import {
  adminToken,
  teamToken,
  verifyAdminPin,
  hashPin,
  newTeamCode,
  envAdminPin,
  findTeamByCode,
} from '../lib/auth.js';

const MAX_FAILURES = 25;

function requireStorage() {
  if (storageKind() === 'none') {
    throw new HttpError(503, 'storage_missing', 'No database connected yet. Add Upstash Redis from the Vercel Storage tab.');
  }
}

async function checkRateLimit(ip) {
  const [count] = await pipeline([['GET', K.rateLimit(ip)]]);
  if (Number(count || 0) >= MAX_FAILURES) {
    throw new HttpError(429, 'slow_down', 'Too many wrong guesses. Have a drink and try again in 15 minutes.');
  }
}

async function recordFailure(ip) {
  await pipeline([
    ['INCR', K.rateLimit(ip)],
    ['EXPIRE', K.rateLimit(ip), 900],
  ]);
}

export const GET = handle(async () => {
  requireStorage();
  const [config, secrets] = await pipeline([['MGET', K.config, K.secrets]]).then((r) => r[0]);
  const s = parseJson(secrets);
  return json({
    setup: Boolean(config),
    claimed: Boolean(envAdminPin() || s?.adminHash),
    envPin: Boolean(envAdminPin()),
  });
});

export const POST = handle(async (request) => {
  requireStorage();
  const body = await readJson(request);
  const ip = clientIp(request);

  if (body.action === 'team') {
    await checkRateLimit(ip);
    const data = await loadAll();
    if (!data.config) throw new HttpError(409, 'not_setup', 'The organiser has not set the portal up yet.');
    const teamId = findTeamByCode(body.code, data.secrets);
    if (!teamId || !data.config.teams.some((t) => t.id === teamId)) {
      await recordFailure(ip);
      throw new HttpError(401, 'bad_code', 'That team code is not right. Check the message from your organiser.');
    }
    return json({ ok: true, teamId, token: teamToken(teamId, data.secrets.teamCodes[teamId]) });
  }

  if (body.action === 'admin') {
    await checkRateLimit(ip);
    const data = await loadAll();
    if (!envAdminPin() && !data.secrets?.adminHash) {
      throw new HttpError(409, 'not_claimed', 'Nobody has claimed the organiser role yet. Run setup first.');
    }
    if (!verifyAdminPin(str(body.pin, 20), data.secrets)) {
      await recordFailure(ip);
      throw new HttpError(401, 'bad_pin', 'Wrong PIN.');
    }
    return json({ ok: true, token: adminToken(data.secrets), setup: Boolean(data.config) });
  }

  if (body.action === 'setup') {
    const data = await loadAll();
    if (data.config) throw new HttpError(409, 'already_setup', 'The portal is already set up. Log in as organiser instead.');
    const pin = str(body.pin, 20);
    const env = envAdminPin();
    let secrets = data.secrets || {};

    if (env || secrets.adminHash) {
      // Re-running setup after a reset, or a PIN supplied by env var: must know the PIN.
      await checkRateLimit(ip);
      if (!verifyAdminPin(pin, secrets)) {
        await recordFailure(ip);
        throw new HttpError(401, 'bad_pin', env ? 'Use the ADMIN_PIN set in Vercel.' : 'Use the existing organiser PIN.');
      }
    } else {
      if (!/^\d{4,8}$/.test(pin)) throw new HttpError(400, 'bad_pin', 'Pick a PIN of 4 to 8 digits.');
      const { salt, hash } = hashPin(pin);
      secrets = { adminSalt: salt, adminHash: hash, teamCodes: {}, createdAt: new Date().toISOString() };
      // Claim atomically so two people cannot both become organiser.
      const [claimed] = await pipeline([['SET', K.secrets, toJson(secrets), 'NX']]);
      if (claimed !== 'OK') throw new HttpError(409, 'already_claimed', 'Someone just claimed the organiser role. Log in with their PIN.');
    }

    const { config, profiles } = buildInitialEvent(body);
    const used = new Set();
    const teamCodes = {};
    for (const team of config.teams) {
      let code = newTeamCode();
      while (used.has(code)) code = newTeamCode();
      used.add(code);
      teamCodes[team.id] = code;
    }
    secrets = { ...secrets, teamCodes };

    const commands = [
      ['SET', K.secrets, toJson(secrets)],
      ['SET', K.config, toJson(config)],
      ['SET', K.reveal, toJson(emptyReveal())],
      ['DEL', K.profiles, K.hostinfo, K.cards, K.photos],
      ['HSET', K.profiles, ...Object.entries(profiles).flatMap(([id, p]) => [id, toJson(p)])],
    ];
    const v = await commit(commands);
    return json({ ok: true, v, token: adminToken(secrets) });
  }

  throw new HttpError(400, 'bad_action', 'Unknown action.');
});
