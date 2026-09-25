// GET  /api/team          -> the logged-in team's private view
// POST /api/team {action} -> score | profile | host
import { handle, json, readJson, HttpError, str } from '../lib/http.js';
import { loadAll, commit, mergeTeam, toJson, K, hostInfoFull, cleanHostInfo, cleanProfile } from '../lib/data.js';
import { requireTeam } from '../lib/auth.js';
import { storageKind } from '../lib/store.js';
import { aiMode, aiLimit } from '../lib/ai-mode.js';
import { cardKey, cleanCard, nightStatus } from '../public/js/shared/core.js';

async function loadForTeam(request) {
  if (storageKind() === 'none') throw new HttpError(503, 'storage_missing', 'No database connected yet.');
  const data = await loadAll();
  if (!data.config) throw new HttpError(409, 'not_setup', 'The portal has not been set up yet.');
  const teamId = requireTeam(request, data.secrets);
  if (!data.config.teams.some((t) => t.id === teamId)) {
    throw new HttpError(401, 'not_team', 'Your team no longer exists. Ask the organiser.');
  }
  return { data, teamId };
}

function teamView(data, teamId) {
  const { config } = data;
  const team = mergeTeam(config.teams.find((t) => t.id === teamId), data.profiles[teamId], { includePrivate: true });
  const cards = Object.values(data.cards).filter((c) => c.teamId === teamId);
  const nights = config.nights.map((n) => {
    const info = data.hostinfo[n.id] || {};
    const out = { id: n.id, address: info.address || '' };
    if (n.hostTeamId === teamId) out.hostinfo = hostInfoFull(info);
    return out;
  });
  const dietary = config.teams.map((t) => {
    const p = mergeTeam(t, data.profiles[t.id], { includePrivate: true });
    return { teamId: t.id, members: p.members.map((m) => ({ id: m.id, name: m.name, dietary: m.dietary })) };
  });
  const used = Number(data.avatarUsage?.[teamId] || 0);
  const ai = { mode: aiMode(), limit: aiLimit(), left: Math.max(0, aiLimit() - used) };
  return { v: data.version, teamId, team, cards, nights, dietary, ai };
}

export const GET = handle(async (request) => {
  const { data, teamId } = await loadForTeam(request);
  return json(teamView(data, teamId));
});

export const POST = handle(async (request) => {
  const { data, teamId } = await loadForTeam(request);
  const body = await readJson(request);
  const { config } = data;

  if (body.action === 'score') {
    const night = config.nights.find((n) => n.id === body.nightId);
    if (!night) throw new HttpError(404, 'no_night', 'That night does not exist.');
    if (night.hostTeamId === teamId) throw new HttpError(403, 'own_night', 'Nice try. You cannot score your own dinner.');
    const status = nightStatus(night);
    if (status === 'upcoming') throw new HttpError(409, 'not_open', 'Scoring opens when the dinner starts.');
    if (status === 'closed') throw new HttpError(409, 'locked', 'Scorecards for this night are locked.');
    if (data.reveal?.show?.status && data.reveal.show.status !== 'idle') {
      throw new HttpError(409, 'reveal_started', 'The Grand Reveal has started, so scorecards are locked.');
    }
    if (config.event.revealMode === 'nightly' && data.reveal?.nightly?.[night.id]) {
      throw new HttpError(409, 'revealed', 'Scores for this night have already been revealed.');
    }
    const { card, error } = cleanCard(body, config.categories);
    if (error) throw new HttpError(400, 'bad_card', error);
    const key = cardKey(night.id, teamId);
    const existing = data.cards[key];
    const now = new Date().toISOString();
    const saved = { nightId: night.id, teamId, ...card, submittedAt: existing?.submittedAt || now, updatedAt: now };
    const v = await commit([['HSET', K.cards, key, toJson(saved)]]);
    return json({ ok: true, v, card: saved, updated: Boolean(existing) });
  }

  if (body.action === 'profile') {
    const existing = data.profiles[teamId] || { members: [] };
    const profile = cleanProfile(body, existing);
    const v = await commit([['HSET', K.profiles, teamId, toJson(profile)]]);
    return json({ ok: true, v });
  }

  if (body.action === 'host') {
    const night = config.nights.find((n) => n.id === body.nightId);
    if (!night || night.hostTeamId !== teamId) {
      throw new HttpError(403, 'not_host', 'You can only edit the night your team is hosting.');
    }
    const info = cleanHostInfo(body, data.hostinfo[night.id] || {});
    const v = await commit([['HSET', K.hostinfo, night.id, toJson(info)]]);
    return json({ ok: true, v });
  }

  throw new HttpError(400, 'bad_action', 'Unknown action.');
});
