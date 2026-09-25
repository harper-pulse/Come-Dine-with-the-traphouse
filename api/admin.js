// GET  /api/admin[?spoilers=1][&backup=1] -> everything the organiser needs
// POST /api/admin {action}                -> organiser actions
import { handle, json, readJson, HttpError, str, queryParams } from '../lib/http.js';
import {
  loadAll,
  commit,
  mergeTeam,
  toJson,
  K,
  emptyReveal,
  hostInfoFull,
  cleanHostInfo,
  cleanProfile,
  publicPhoto,
  cardList,
} from '../lib/data.js';
import { requireAdmin, adminToken, hashPin, newTeamCode, envAdminPin, newId } from '../lib/auth.js';
import { storageKind } from '../lib/store.js';
import { aiMode, aiLimit } from '../lib/ai-mode.js';
import { photosEnabled, removePhoto } from '../lib/photos.js';
import {
  AVATARS,
  TEAM_COLORS,
  DEFAULT_TIMEZONE,
  buildRevealScript,
  cardKey,
  defaultLockISO,
} from '../public/js/shared/core.js';

async function loadForAdmin(request, { needSetup = true } = {}) {
  if (storageKind() === 'none') throw new HttpError(503, 'storage_missing', 'No database connected yet.');
  const data = await loadAll();
  requireAdmin(request, data.secrets);
  if (needSetup && !data.config) throw new HttpError(409, 'not_setup', 'Run setup first.');
  return data;
}

function isoOrNull(value) {
  if (!value) return null;
  const t = Date.parse(value);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

function adminView(data, { spoilers }) {
  const { config } = data;
  const teams = config.teams.map((t) => mergeTeam(t, data.profiles[t.id], { includePrivate: true }));
  const hostinfo = Object.fromEntries(config.nights.map((n) => [n.id, hostInfoFull(data.hostinfo[n.id])]));
  const cards = cardList(data.cards).map((c) =>
    spoilers ? c : { nightId: c.nightId, teamId: c.teamId, submittedAt: c.submittedAt, updatedAt: c.updatedAt },
  );
  const show = data.reveal?.show || { status: 'idle' };
  return {
    v: data.version,
    storage: storageKind(),
    features: { photos: photosEnabled() },
    envPin: Boolean(envAdminPin()),
    config,
    teams,
    hostinfo,
    codes: data.secrets?.teamCodes || {},
    cards,
    spoilers: Boolean(spoilers),
    reveal: {
      nightly: data.reveal?.nightly || {},
      show: { status: show.status || 'idle', step: show.step || 0, total: show.script?.length || 0, startedAt: show.startedAt || null },
    },
    photos: Object.values(data.photos || {}).map(publicPhoto),
    ai: { mode: aiMode(), limit: aiLimit(), used: data.avatarUsage || {} },
  };
}

export const GET = handle(async (request) => {
  const params = queryParams(request);
  const data = await loadForAdmin(request);
  if (params.get('backup') === '1') {
    return json({
      kind: 'cdwm-backup',
      exportedAt: new Date().toISOString(),
      config: data.config,
      profiles: data.profiles,
      hostinfo: data.hostinfo,
      cards: data.cards,
      reveal: data.reveal,
      photos: data.photos,
      teamCodes: data.secrets?.teamCodes || {},
    });
  }
  return json(adminView(data, { spoilers: params.get('spoilers') === '1' }));
});

function saveConfig(config) {
  return ['SET', K.config, toJson(config)];
}

function saveReveal(reveal) {
  return ['SET', K.reveal, toJson(reveal)];
}

export const POST = handle(async (request) => {
  const body = await readJson(request, 2_000_000);
  const action = body.action;
  const data = await loadForAdmin(request, { needSetup: action !== 'import' });
  const config = data.config;
  const reveal = data.reveal || emptyReveal();
  let commands = [];

  switch (action) {
    case 'event': {
      const e = config.event;
      const rules = Array.isArray(body.rules) ? body.rules.map((r) => str(r, 400)).filter(Boolean).slice(0, 20) : e.rules;
      let timezone = str(body.timezone, 60) || e.timezone || DEFAULT_TIMEZONE;
      try {
        new Intl.DateTimeFormat('en', { timeZone: timezone });
      } catch {
        throw new HttpError(400, 'bad_timezone', 'That time zone is not valid.');
      }
      config.event = {
        ...e,
        name: str(body.name ?? e.name, 60) || e.name,
        tagline: str(body.tagline ?? e.tagline, 90),
        prize: str(body.prize ?? e.prize, 90),
        timezone,
        revealMode: body.revealMode === 'nightly' ? 'nightly' : body.revealMode === 'final' ? 'final' : e.revealMode,
        rules,
      };
      commands.push(saveConfig(config));
      break;
    }

    case 'categories': {
      if (!Array.isArray(body.categories) || !body.categories.length) throw new HttpError(400, 'bad_categories', 'Add at least one category.');
      const seen = new Set();
      config.categories = body.categories.slice(0, 8).map((c) => {
        let id = str(c.id, 24).toLowerCase().replace(/[^a-z0-9]/g, '') || str(c.label, 24).toLowerCase().replace(/[^a-z0-9]/g, '') || newId('c');
        while (seen.has(id)) id = `${id}x`;
        seen.add(id);
        return { id, label: str(c.label, 24) || id, emoji: str(c.emoji, 8) || '⭐' };
      });
      commands.push(saveConfig(config));
      break;
    }

    case 'teams': {
      if (!Array.isArray(body.teams)) throw new HttpError(400, 'bad_teams', 'Missing teams.');
      for (const input of body.teams) {
        const team = config.teams.find((t) => t.id === input.id);
        if (!team) continue;
        if (typeof input.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(input.color)) team.color = input.color;
        const profile = cleanProfile(input, data.profiles[team.id] || { members: [] });
        commands.push(['HSET', K.profiles, team.id, toJson(profile)]);
      }
      commands.push(saveConfig(config));
      break;
    }

    case 'addTeam': {
      if (config.teams.length >= 8) throw new HttpError(400, 'too_many', 'Eight teams is the limit.');
      const id = newId('t');
      const index = config.teams.length;
      config.teams.push({ id, color: TEAM_COLORS[index % TEAM_COLORS.length] });
      const number = Math.max(0, ...config.nights.map((n) => n.number)) + 1;
      config.nights.push({ id: newId('n'), number, hostTeamId: id, startsAt: null, locksAt: null, scoring: 'auto' });
      const profile = {
        name: `Team ${index + 1}`,
        motto: '',
        members: ['a', 'b'].map((s, i) => ({ id: `${id}${s}`, name: `Player ${index * 2 + i + 1}`, avatar: AVATARS[(index * 2 + i) % AVATARS.length], dietary: '' })),
      };
      const secrets = { ...data.secrets, teamCodes: { ...(data.secrets?.teamCodes || {}), [id]: newTeamCode() } };
      commands.push(saveConfig(config), ['HSET', K.profiles, id, toJson(profile)], ['SET', K.secrets, toJson(secrets)]);
      break;
    }

    case 'removeTeam': {
      const id = body.teamId;
      if (!config.teams.some((t) => t.id === id)) throw new HttpError(404, 'no_team', 'No such team.');
      if (config.teams.length <= 2) throw new HttpError(400, 'too_few', 'You need at least two teams.');
      const removedNights = config.nights.filter((n) => n.hostTeamId === id).map((n) => n.id);
      config.teams = config.teams.filter((t) => t.id !== id);
      config.nights = config.nights.filter((n) => n.hostTeamId !== id).sort((a, b) => a.number - b.number).map((n, i) => ({ ...n, number: i + 1 }));
      const secrets = { ...data.secrets, teamCodes: { ...(data.secrets?.teamCodes || {}) } };
      delete secrets.teamCodes[id];
      const deadCards = cardList(data.cards)
        .filter((c) => c.teamId === id || removedNights.includes(c.nightId))
        .map((c) => cardKey(c.nightId, c.teamId));
      commands.push(saveConfig(config), ['SET', K.secrets, toJson(secrets)], ['HDEL', K.profiles, id]);
      if (deadCards.length) commands.push(['HDEL', K.cards, ...deadCards]);
      if (removedNights.length) commands.push(['HDEL', K.hostinfo, ...removedNights]);
      break;
    }

    case 'nights': {
      if (!Array.isArray(body.nights)) throw new HttpError(400, 'bad_nights', 'Missing nights.');
      const teamIds = new Set(config.teams.map((t) => t.id));
      for (const input of body.nights) {
        const night = config.nights.find((n) => n.id === input.id);
        if (!night) continue;
        if (input.hostTeamId !== undefined) {
          if (!teamIds.has(input.hostTeamId)) throw new HttpError(400, 'bad_host', 'Pick a host team for every night.');
          night.hostTeamId = input.hostTeamId;
        }
        if (input.startsAt !== undefined) night.startsAt = isoOrNull(input.startsAt);
        if (input.locksAt !== undefined) night.locksAt = isoOrNull(input.locksAt) || defaultLockISO(night.startsAt, config.event.timezone);
        if (['auto', 'open', 'locked'].includes(input.scoring)) night.scoring = input.scoring;
      }
      commands.push(saveConfig(config));
      break;
    }

    case 'hostinfo': {
      const night = config.nights.find((n) => n.id === body.nightId);
      if (!night) throw new HttpError(404, 'no_night', 'No such night.');
      commands.push(['HSET', K.hostinfo, night.id, toJson(cleanHostInfo(body, data.hostinfo[night.id] || {}))]);
      break;
    }

    case 'scoring': {
      const night = config.nights.find((n) => n.id === body.nightId);
      if (!night) throw new HttpError(404, 'no_night', 'No such night.');
      if (!['auto', 'open', 'locked'].includes(body.scoring)) throw new HttpError(400, 'bad_scoring', 'Pick auto, open or locked.');
      night.scoring = body.scoring;
      commands.push(saveConfig(config));
      break;
    }

    case 'revealNight': {
      const night = config.nights.find((n) => n.id === body.nightId);
      if (!night) throw new HttpError(404, 'no_night', 'No such night.');
      reveal.nightly = { ...(reveal.nightly || {}), [night.id]: Boolean(body.revealed) };
      if (body.revealed) night.scoring = 'locked';
      commands.push(saveReveal(reveal), saveConfig(config));
      break;
    }

    case 'show': {
      const show = reveal.show || { status: 'idle', step: 0, script: [] };
      if (body.op === 'start') {
        const script = buildRevealScript({
          teams: config.teams,
          nights: config.nights,
          cards: cardList(data.cards),
          categories: config.categories,
        });
        if (!script.some((s) => s.kind === 'team' || s.kind === 'winner')) {
          throw new HttpError(409, 'no_scores', 'There are no scorecards to reveal yet.');
        }
        reveal.show = { status: 'live', step: 0, script, startedAt: new Date().toISOString() };
      } else if (body.op === 'goto' || body.op === 'next' || body.op === 'prev') {
        if (show.status === 'idle') throw new HttpError(409, 'not_live', 'Start the reveal first.');
        const last = show.script.length - 1;
        let step = show.step || 0;
        if (body.op === 'next') step += 1;
        if (body.op === 'prev') step -= 1;
        if (body.op === 'goto') step = Number(body.step);
        step = Math.max(0, Math.min(last, Number.isFinite(step) ? step : 0));
        reveal.show = { ...show, step, status: step >= last ? 'done' : 'live' };
      } else if (body.op === 'finish') {
        if (!show.script?.length) throw new HttpError(409, 'not_live', 'Start the reveal first.');
        reveal.show = { ...show, status: 'done', step: show.script.length - 1 };
      } else if (body.op === 'reset') {
        reveal.show = { status: 'idle', step: 0, script: [] };
      } else {
        throw new HttpError(400, 'bad_op', 'Unknown reveal action.');
      }
      reveal.show.updatedAt = new Date().toISOString();
      commands.push(saveReveal(reveal));
      break;
    }

    case 'resetAiGoes': {
      if (!config.teams.some((t) => t.id === body.teamId)) throw new HttpError(404, 'no_team', 'No such team.');
      commands.push(['HDEL', K.avatarUsage, body.teamId]);
      break;
    }

    case 'deleteCard': {
      const key = cardKey(body.nightId, body.teamId);
      if (!data.cards[key]) throw new HttpError(404, 'no_card', 'That scorecard does not exist.');
      commands.push(['HDEL', K.cards, key]);
      break;
    }

    case 'regenCode': {
      if (!config.teams.some((t) => t.id === body.teamId)) throw new HttpError(404, 'no_team', 'No such team.');
      const codes = { ...(data.secrets?.teamCodes || {}) };
      const taken = new Set(Object.values(codes));
      let code = newTeamCode();
      while (taken.has(code)) code = newTeamCode();
      codes[body.teamId] = code;
      commands.push(['SET', K.secrets, toJson({ ...data.secrets, teamCodes: codes })]);
      break;
    }

    case 'changePin': {
      if (envAdminPin()) throw new HttpError(400, 'env_pin', 'The PIN is set by ADMIN_PIN in Vercel. Change it there.');
      const pin = str(body.pin, 20);
      if (!/^\d{4,8}$/.test(pin)) throw new HttpError(400, 'bad_pin', 'Pick a PIN of 4 to 8 digits.');
      const { salt, hash } = hashPin(pin);
      const secrets = { ...data.secrets, adminSalt: salt, adminHash: hash };
      const v = await commit([['SET', K.secrets, toJson(secrets)]]);
      return json({ ok: true, v, token: adminToken(secrets) });
    }

    case 'resetScores': {
      if (body.confirm !== 'RESET') throw new HttpError(400, 'confirm', 'Type RESET to confirm.');
      commands.push(['DEL', K.cards], saveReveal(emptyReveal()));
      break;
    }

    case 'resetAll': {
      if (body.confirm !== 'DELETE EVERYTHING') throw new HttpError(400, 'confirm', 'Type DELETE EVERYTHING to confirm.');
      for (const photo of Object.values(data.photos || {})) {
        try {
          await removePhoto(photo);
        } catch (err) {
          console.error('photo delete failed', err);
        }
      }
      const secrets = { ...data.secrets, teamCodes: {} };
      commands.push(['DEL', K.config, K.reveal, K.profiles, K.hostinfo, K.cards, K.photos, K.avatars, K.avatarUsage], ['SET', K.secrets, toJson(secrets)]);
      break;
    }

    case 'import': {
      const b = body.backup;
      if (!b || b.kind !== 'cdwm-backup' || !b.config?.teams || !b.config?.nights) {
        throw new HttpError(400, 'bad_backup', 'That file is not a portal backup.');
      }
      const hashCmd = (key, obj) => {
        const entries = Object.entries(obj || {});
        return entries.length ? [['HSET', key, ...entries.flatMap(([k, v]) => [k, toJson(v)])]] : [];
      };
      const secrets = { ...data.secrets, teamCodes: b.teamCodes && Object.keys(b.teamCodes).length ? b.teamCodes : data.secrets?.teamCodes || {} };
      for (const t of b.config.teams) if (!secrets.teamCodes[t.id]) secrets.teamCodes[t.id] = newTeamCode();
      commands.push(
        ['DEL', K.config, K.reveal, K.profiles, K.hostinfo, K.cards, K.photos],
        ['SET', K.config, toJson(b.config)],
        ['SET', K.reveal, toJson(b.reveal || emptyReveal())],
        ['SET', K.secrets, toJson(secrets)],
        ...hashCmd(K.profiles, b.profiles),
        ...hashCmd(K.hostinfo, b.hostinfo),
        ...hashCmd(K.cards, b.cards),
        ...hashCmd(K.photos, b.photos),
      );
      break;
    }

    default:
      throw new HttpError(400, 'bad_action', 'Unknown action.');
  }

  const v = await commit(commands);
  return json({ ok: true, v });
});
