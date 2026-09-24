// Data model, defaults and the public view of the event.

import { pipeline, parseJson, parseHashJson, storageKind, PREFIX } from './store.js';
import { photosEnabled } from './photos.js';
import { str } from './http.js';
import {
  DEFAULT_CATEGORIES,
  DEFAULT_RULES,
  DEFAULT_TEAM_NAMES,
  DEFAULT_TIMEZONE,
  TEAM_COLORS,
  AVATARS,
  byNumber,
  cardKey,
  zonedToUtcISO,
  addDays,
  defaultLockISO,
  publicResults,
} from '../public/js/shared/core.js';

export const K = {
  config: `${PREFIX}config`,
  secrets: `${PREFIX}secrets`,
  reveal: `${PREFIX}reveal`,
  version: `${PREFIX}version`,
  profiles: `${PREFIX}profiles`,
  hostinfo: `${PREFIX}hostinfo`,
  cards: `${PREFIX}cards`,
  photos: `${PREFIX}photos`,
  rateLimit: (ip) => `${PREFIX}rl:${ip}`,
};

export const MENU_FIELDS = ['starter', 'main', 'dessert', 'drinks'];

/* ------------------------------- Loading ------------------------------- */

export async function loadAll() {
  const [strings, profiles, hostinfo, cards, photos] = await pipeline([
    ['MGET', K.config, K.reveal, K.secrets, K.version],
    ['HGETALL', K.profiles],
    ['HGETALL', K.hostinfo],
    ['HGETALL', K.cards],
    ['HGETALL', K.photos],
  ]);
  const [config, reveal, secrets, version] = strings;
  return {
    config: parseJson(config),
    reveal: parseJson(reveal) || emptyReveal(),
    secrets: parseJson(secrets),
    version: Number(version || 0),
    profiles: parseHashJson(profiles),
    hostinfo: parseHashJson(hostinfo),
    cards: parseHashJson(cards),
    photos: parseHashJson(photos),
  };
}

export async function loadVersion() {
  const [v] = await pipeline([['GET', K.version]]);
  return Number(v || 0);
}

// Runs the write commands, then bumps the version so every phone refreshes.
export async function commit(commands) {
  const results = await pipeline([...commands, ['INCR', K.version]]);
  return Number(results[results.length - 1]);
}

export const toJson = (value) => JSON.stringify(value);

export function emptyReveal() {
  return { nightly: {}, show: { status: 'idle', step: 0, script: [] } };
}

/* ------------------------------- Defaults ------------------------------ */

function nextSaturday(timeZone) {
  const now = new Date();
  const today = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  const [y, m, d] = today.split('-').map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  let ahead = (6 - dow + 7) % 7;
  if (ahead < 7) ahead += 7;
  return addDays(today, ahead);
}

// Builds the first version of the event from the setup wizard answers.
export function buildInitialEvent(input = {}) {
  const timeZone = str(input.timezone, 60) || DEFAULT_TIMEZONE;
  const teamInputs = Array.isArray(input.teams) ? input.teams.slice(0, 8) : [];
  const teamCount = Math.max(2, Math.min(8, teamInputs.length || 5));
  const teams = [];
  const profiles = {};
  for (let i = 0; i < teamCount; i++) {
    const id = `t${i + 1}`;
    const t = teamInputs[i] || {};
    teams.push({ id, color: TEAM_COLORS[i % TEAM_COLORS.length] });
    const memberNames = Array.isArray(t.members) ? t.members : [];
    profiles[id] = {
      name: str(t.name, 40) || DEFAULT_TEAM_NAMES[i] || `Team ${i + 1}`,
      motto: '',
      members: [0, 1].map((m) => ({
        id: `${id}${m === 0 ? 'a' : 'b'}`,
        name: str(memberNames[m], 40) || `Player ${i * 2 + m + 1}`,
        avatar: AVATARS[(i * 2 + m) % AVATARS.length] || '',
        dietary: '',
      })),
    };
  }

  const firstDate = /^\d{4}-\d{2}-\d{2}$/.test(input.firstDate || '') ? input.firstDate : nextSaturday(timeZone);
  const time = /^\d{2}:\d{2}$/.test(input.time || '') ? input.time : '18:30';
  const every = [0, 1, 7, 14, 28].includes(Number(input.every)) ? Number(input.every) : 7;
  const order = Array.isArray(input.hostOrder) && input.hostOrder.length === teamCount ? input.hostOrder : teams.map((_, i) => i);

  const nights = teams.map((_, i) => {
    const hostIndex = Number(order[i]);
    const date = every === 0 ? null : addDays(firstDate, i * every);
    const startsAt = date ? zonedToUtcISO(date, time, timeZone) : null;
    return {
      id: `n${i + 1}`,
      number: i + 1,
      hostTeamId: teams[Number.isInteger(hostIndex) && teams[hostIndex] ? hostIndex : i].id,
      startsAt,
      locksAt: defaultLockISO(startsAt, timeZone),
      scoring: 'auto',
    };
  });

  const config = {
    schema: 1,
    event: {
      name: str(input.eventName, 60) || 'Come Dine With The Traphouse',
      tagline: '5 teams. 5 nights. 1 champion.',
      prize: 'Eternal bragging rights',
      timezone: timeZone,
      revealMode: 'final',
      rules: DEFAULT_RULES.slice(),
      createdAt: new Date().toISOString(),
    },
    categories: DEFAULT_CATEGORIES.map((c) => ({ ...c })),
    teams,
    nights,
  };
  return { config, profiles };
}

/* ----------------------------- Public view ----------------------------- */

export function mergeTeam(team, profile = {}, { includePrivate = false } = {}) {
  const members = Array.isArray(profile.members) ? profile.members : [];
  return {
    id: team.id,
    color: team.color,
    name: profile.name || team.id.toUpperCase(),
    motto: profile.motto || '',
    members: members.map((m) => ({
      id: m.id,
      name: m.name || '',
      avatar: m.avatar || '',
      ...(includePrivate ? { dietary: m.dietary || '' } : {}),
    })),
  };
}

function cleanMenu(menu) {
  const out = {};
  for (const f of MENU_FIELDS) out[f] = str(menu?.[f], 200);
  return out;
}

export function cardList(cards) {
  return Object.values(cards || {}).filter((c) => c && c.nightId && c.teamId);
}

export function publicPhoto(p) {
  return {
    id: p.id,
    url: p.access === 'private' ? `/api/photos?id=${encodeURIComponent(p.id)}` : p.url,
    nightId: p.nightId,
    teamId: p.teamId,
    caption: p.caption || '',
    w: p.w || null,
    h: p.h || null,
    createdAt: p.createdAt,
  };
}

// Everything anyone with the link can see. No addresses, no dietary info,
// no codes, and no scores until they have been revealed.
export function buildPublicState(data) {
  const base = {
    v: data.version,
    storage: storageKind(),
    features: { photos: photosEnabled() },
  };
  const { config } = data;
  if (!config) return { ...base, setup: false };

  const reveal = data.reveal || emptyReveal();
  const teams = config.teams.map((t) => mergeTeam(t, data.profiles[t.id]));
  const allCards = cardList(data.cards);
  const nightsSorted = config.nights.slice().sort(byNumber);

  const nights = nightsSorted.map((n) => {
    const info = data.hostinfo[n.id] || {};
    const guests = teams.filter((t) => t.id !== n.hostTeamId).map((t) => t.id);
    const menu = cleanMenu(info.menu);
    return {
      id: n.id,
      number: n.number,
      hostTeamId: n.hostTeamId,
      startsAt: n.startsAt || null,
      locksAt: n.locksAt || null,
      scoring: n.scoring || 'auto',
      theme: info.theme || '',
      dressCode: info.dressCode || '',
      suburb: info.suburb || '',
      arrival: info.arrival || '',
      message: info.message || '',
      hasMenu: MENU_FIELDS.some((f) => menu[f]),
      menuRevealed: Boolean(info.menuRevealed),
      menu: info.menuRevealed ? menu : null,
      guests,
      submitted: guests.filter((tid) => data.cards[cardKey(n.id, tid)]),
      revealed: config.event.revealMode === 'nightly' && Boolean(reveal.nightly?.[n.id]),
    };
  });

  const show = reveal.show || { status: 'idle' };
  let results = null;
  if (show.status === 'done') {
    results = { partial: false, ...publicResults({ teams, nights: config.nights, cards: allCards, categories: config.categories }) };
  } else if (config.event.revealMode === 'nightly') {
    const ids = new Set(Object.keys(reveal.nightly || {}).filter((id) => reveal.nightly[id]));
    if (ids.size) {
      results = {
        partial: true,
        nightIds: [...ids],
        ...publicResults({
          teams,
          nights: config.nights.filter((n) => ids.has(n.id)),
          cards: allCards.filter((c) => ids.has(c.nightId)),
          categories: config.categories,
        }),
      };
    }
  }

  let showPublic = { status: 'idle' };
  if (show.status === 'live' && Array.isArray(show.script)) {
    const step = Math.max(0, Math.min(show.step || 0, show.script.length - 1));
    showPublic = { status: 'live', step, total: show.script.length, steps: show.script.slice(0, step + 1), startedAt: show.startedAt };
  } else if (show.status === 'done' && Array.isArray(show.script)) {
    showPublic = { status: 'done', step: show.script.length - 1, total: show.script.length, steps: show.script, startedAt: show.startedAt };
  }

  const expected = nights.reduce((n, night) => n + night.guests.length, 0);
  const submitted = nights.reduce((n, night) => n + night.submitted.length, 0);

  return {
    ...base,
    setup: true,
    event: {
      name: config.event.name,
      tagline: config.event.tagline,
      prize: config.event.prize,
      timezone: config.event.timezone || DEFAULT_TIMEZONE,
      revealMode: config.event.revealMode,
      rules: config.event.rules || [],
    },
    categories: config.categories,
    teams,
    nights,
    results,
    show: showPublic,
    photos: Object.values(data.photos || {})
      .map(publicPhoto)
      .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt))),
    counts: { submitted, expected },
  };
}

/* --------------------------- Form cleaning ---------------------------- */

export function hostInfoFull(info = {}) {
  const menu = {};
  for (const f of MENU_FIELDS) menu[f] = info.menu?.[f] || '';
  return {
    theme: info.theme || '',
    dressCode: info.dressCode || '',
    suburb: info.suburb || '',
    address: info.address || '',
    arrival: info.arrival || '',
    message: info.message || '',
    menu,
    menuRevealed: Boolean(info.menuRevealed),
    updatedAt: info.updatedAt || null,
  };
}

export function cleanHostInfo(body, existing = {}) {
  const pick = (key, max) => (body[key] === undefined ? existing[key] || '' : str(body[key], max));
  const menu = {};
  for (const f of MENU_FIELDS) {
    menu[f] = body.menu?.[f] === undefined ? existing.menu?.[f] || '' : str(body.menu[f], 200);
  }
  return {
    theme: pick('theme', 60),
    dressCode: pick('dressCode', 80),
    suburb: pick('suburb', 60),
    address: pick('address', 160),
    arrival: pick('arrival', 80),
    message: pick('message', 600),
    menu,
    menuRevealed: body.menuRevealed === undefined ? Boolean(existing.menuRevealed) : Boolean(body.menuRevealed),
    updatedAt: new Date().toISOString(),
  };
}

export function cleanProfile(body, existing) {
  const members = (existing.members || []).map((m) => {
    const input = Array.isArray(body.members) ? body.members.find((x) => x && x.id === m.id) || {} : {};
    const avatar = input.avatar === undefined ? m.avatar : input.avatar === '' || AVATARS.includes(input.avatar) ? input.avatar : m.avatar;
    return {
      ...m,
      name: input.name === undefined ? m.name : str(input.name, 40) || m.name,
      avatar,
      dietary: input.dietary === undefined ? m.dietary || '' : str(input.dietary, 200),
    };
  });
  return {
    ...existing,
    name: body.name === undefined ? existing.name : str(body.name, 40) || existing.name,
    motto: body.motto === undefined ? existing.motto || '' : str(body.motto, 90),
    members,
  };
}
