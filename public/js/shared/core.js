// Shared rules and maths for Come Dine With The Traphouse.
// Imported by the browser app AND by the API functions, so keep it free of
// dependencies and free of browser or Node specific APIs.

export const MAX_OVERALL = 10;
export const MIN_OVERALL = 0;
export const MAX_STARS = 5;
export const COMMENT_MAX = 280;

export const DEFAULT_TIMEZONE = 'Pacific/Auckland';

export const DEFAULT_CATEGORIES = [
  { id: 'starter', label: 'Starter', emoji: '🥟' },
  { id: 'main', label: 'Main', emoji: '🍗' },
  { id: 'dessert', label: 'Dessert', emoji: '🍰' },
  { id: 'drinks', label: 'Drinks', emoji: '🍷' },
  { id: 'vibe', label: 'Vibe', emoji: '🔥' },
];

export const TEAM_COLORS = ['#ff7a1a', '#27b5c4', '#a066f0', '#46b04f', '#ee3b2f', '#f4c21f', '#ff5fa2', '#8d99ae'];

// Portraits cropped from the poster, stored at /img/crew/<id>.webp
export const AVATARS = ['crew-1', 'crew-2', 'crew-3', 'crew-4', 'crew-5', 'crew-6', 'crew-7'];

export const DEFAULT_TEAM_NAMES = [
  'Westgate Vintage',
  'The Pizza Cartel',
  'Balaclava Bistro',
  'Red Hand Gang',
  'Roast Chicken Mafia',
];

export const DEFAULT_RULES = [
  'Five teams, five nights. Every team hosts one dinner and is a guest at the other four.',
  'Hosts serve a starter, a main and a dessert, plus drinks. The theme is up to the hosts.',
  'At the end of the night each guest team fills in ONE scorecard for the hosts: a secret overall score out of 10, plus a star rating for each course, the drinks and the vibe.',
  'No scoring your own dinner. The portal will not let you anyway.',
  'Scores are sealed. Nobody sees them, not even the organiser, until the Grand Reveal.',
  'Scorecards lock at midday the day after each dinner. A late scorecard doesn’t count.',
  'Highest average score wins. Ties are broken on stars. If it’s still tied, the title is shared.',
  'Tactical scoring gets noticed.',
];

// Labels for each overall score, shown on the scorecard and in the reveal.
export const SCORE_LABELS = {
  0: 'WASTED',
  1: 'CALL THE COPS',
  2: 'CRIME SCENE',
  3: 'BUSTED',
  4: 'SKETCHY',
  5: 'MID',
  6: 'DECENT HUSTLE',
  7: 'SOLID',
  8: 'RESPECT +',
  9: 'BIG TIME',
  10: 'KINGPIN',
};

export function scoreLabel(n) {
  return SCORE_LABELS[Math.round(n)] || '';
}

/* ------------------------------------------------------------------ */
/* Small helpers                                                       */
/* ------------------------------------------------------------------ */

export function sum(values) {
  let t = 0;
  for (const v of values) t += v;
  return t;
}

export function mean(values) {
  return values.length ? sum(values) / values.length : null;
}

export function round(n, dp = 2) {
  if (n == null || !Number.isFinite(n)) return n;
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}

export function byNumber(a, b) {
  return (a.number || 0) - (b.number || 0);
}

export function cardKey(nightId, teamId) {
  return `${nightId}:${teamId}`;
}

// Deterministic shuffle so everyone sees the same "random" order.
export function seededShuffle(list, seedText) {
  let seed = 2166136261;
  for (const ch of String(seedText)) {
    seed ^= ch.charCodeAt(0);
    seed = Math.imul(seed, 16777619) >>> 0;
  }
  const rand = () => {
    seed = (seed + 0x6d2b79f5) >>> 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const out = list.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Time zones                                                          */
/* ------------------------------------------------------------------ */

function zoneParts(ts, timeZone) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts = {};
  for (const p of dtf.formatToParts(new Date(ts))) parts[p.type] = p.value;
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour) % 24,
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
}

function zoneOffsetMs(ts, timeZone) {
  const p = zoneParts(ts, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(ts / 1000) * 1000;
}

// "2026-10-03" + "18:30" in Pacific/Auckland -> ISO string in UTC.
export function zonedToUtcISO(dateStr, timeStr, timeZone = DEFAULT_TIMEZONE) {
  if (!dateStr) return null;
  const [y, m, d] = String(dateStr).split('-').map(Number);
  const [hh, mm] = String(timeStr || '00:00').split(':').map(Number);
  if (![y, m, d, hh, mm].every(Number.isFinite)) return null;
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  const first = zoneOffsetMs(guess, timeZone);
  let ts = guess - first;
  const second = zoneOffsetMs(ts, timeZone);
  if (second !== first) ts = guess - second;
  return new Date(ts).toISOString();
}

// ISO string -> { date: "2026-10-03", time: "18:30" } in the given zone.
export function utcToZoned(iso, timeZone = DEFAULT_TIMEZONE) {
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return { date: '', time: '' };
  const p = zoneParts(ts, timeZone);
  const pad = (n) => String(n).padStart(2, '0');
  return { date: `${p.year}-${pad(p.month)}-${pad(p.day)}`, time: `${pad(p.hour)}:${pad(p.minute)}` };
}

export function addDays(dateStr, days) {
  const [y, m, d] = String(dateStr).split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

// Default scorecard lock: midday the day after the dinner, in the event zone.
export function defaultLockISO(startsAtISO, timeZone = DEFAULT_TIMEZONE) {
  if (!startsAtISO) return null;
  const { date } = utcToZoned(startsAtISO, timeZone);
  return zonedToUtcISO(addDays(date, 1), '12:00', timeZone);
}

/* ------------------------------------------------------------------ */
/* Nights                                                              */
/* ------------------------------------------------------------------ */

// 'upcoming' | 'open' | 'closed'. Scoring opens when the dinner starts and
// closes at locksAt, unless the organiser has forced it open or locked.
export function nightStatus(night, now = Date.now()) {
  if (!night) return 'upcoming';
  if (night.scoring === 'open') return 'open';
  if (night.scoring === 'locked') return 'closed';
  const start = Date.parse(night.startsAt);
  if (!Number.isFinite(start) || now < start) return 'upcoming';
  const lock = Date.parse(night.locksAt);
  if (Number.isFinite(lock) && now >= lock) return 'closed';
  return 'open';
}

export function guestTeamIds(night, teams) {
  return teams.filter((t) => t.id !== night.hostTeamId).map((t) => t.id);
}

export function hostedNights(teamId, nights) {
  return nights.filter((n) => n.hostTeamId === teamId).sort(byNumber);
}

// The next night that hasn't finished scoring, or the last night.
export function currentNight(nights, now = Date.now()) {
  const sorted = nights.slice().sort(byNumber);
  const open = sorted.find((n) => nightStatus(n, now) === 'open');
  if (open) return open;
  const upcoming = sorted.find((n) => nightStatus(n, now) === 'upcoming');
  return upcoming || sorted[sorted.length - 1] || null;
}

/* ------------------------------------------------------------------ */
/* Scorecards                                                          */
/* ------------------------------------------------------------------ */

function toInt(v) {
  if (typeof v === 'number') return Number.isInteger(v) ? v : NaN;
  if (typeof v === 'string' && /^\d+$/.test(v.trim())) return Number(v.trim());
  return NaN;
}

// Validates a scorecard coming from a form. Returns a clean card or an error string.
export function cleanCard(input, categories) {
  const overall = toInt(input?.overall);
  if (!Number.isInteger(overall) || overall < MIN_OVERALL || overall > MAX_OVERALL) {
    return { error: `Pick an overall score from ${MIN_OVERALL} to ${MAX_OVERALL}.` };
  }
  const stars = {};
  for (const cat of categories) {
    const v = toInt(input?.stars?.[cat.id]);
    if (!Number.isInteger(v) || v < 1 || v > MAX_STARS) {
      return { error: `Give ${cat.label} a rating from 1 to ${MAX_STARS} stars.` };
    }
    stars[cat.id] = v;
  }
  let comment = typeof input?.comment === 'string' ? input.comment.trim() : '';
  comment = comment.replace(/\s+\n/g, '\n').slice(0, COMMENT_MAX);
  return { card: { overall, stars, comment } };
}

export function starsTotal(card, categories) {
  let t = 0;
  for (const cat of categories) {
    const v = card?.stars?.[cat.id];
    if (Number.isFinite(v)) t += v;
  }
  return t;
}

/* ------------------------------------------------------------------ */
/* Results                                                             */
/* ------------------------------------------------------------------ */

// cards: [{ nightId, teamId (the scoring team), overall, stars, comment }]
export function computeResults({ teams, nights, cards, categories }) {
  const teamIds = new Set(teams.map((t) => t.id));
  const nightById = new Map(nights.map((n) => [n.id, n]));
  const valid = cards.filter((c) => {
    const n = nightById.get(c.nightId);
    return n && n.hostTeamId && teamIds.has(c.teamId) && teamIds.has(n.hostTeamId) && c.teamId !== n.hostTeamId;
  });

  const hosts = teams.map((team) => {
    const hosted = hostedNights(team.id, nights);
    const hostedIds = new Set(hosted.map((n) => n.id));
    const received = valid
      .filter((c) => hostedIds.has(c.nightId))
      .sort((a, b) => teams.findIndex((t) => t.id === a.teamId) - teams.findIndex((t) => t.id === b.teamId));
    const count = received.length;
    const total = sum(received.map((c) => c.overall));
    const stars = received.map((c) => starsTotal(c, categories));
    const catAvg = {};
    for (const cat of categories) {
      const vals = received.map((c) => c.stars?.[cat.id]).filter(Number.isFinite);
      catAvg[cat.id] = vals.length ? mean(vals) : null;
    }
    return {
      teamId: team.id,
      nightIds: hosted.map((n) => n.id),
      count,
      total,
      avg: count ? total / count : null,
      starsTotal: sum(stars),
      starsAvg: count ? sum(stars) / count : null,
      catAvg,
      cards: received,
      place: null,
    };
  });

  const ranked = hosts
    .filter((h) => h.count > 0)
    .sort((a, b) => b.avg - a.avg || b.starsAvg - a.starsAvg);
  let place = 0;
  let prev = null;
  ranked.forEach((h, i) => {
    if (!prev || h.avg !== prev.avg || h.starsAvg !== prev.starsAvg) place = i + 1;
    h.place = place;
    prev = h;
  });
  const ranking = [...ranked, ...hosts.filter((h) => h.count === 0)];

  const critics = teams.map((team) => {
    const given = valid.filter((c) => c.teamId === team.id);
    return {
      teamId: team.id,
      count: given.length,
      avgGiven: given.length ? mean(given.map((c) => c.overall)) : null,
      starsAvgGiven: given.length ? mean(given.map((c) => starsTotal(c, categories))) : null,
    };
  });

  const awards = computeAwards({ hosts, critics, valid, categories, nights });
  return { ranking, critics, awards, cardsCount: valid.length };
}

function computeAwards({ hosts, critics, valid, categories, nights }) {
  const awards = [];
  const nightById = new Map(nights.map((n) => [n.id, n]));

  for (const cat of categories) {
    const scored = hosts.filter((h) => h.catAvg[cat.id] != null);
    if (!scored.length) continue;
    const best = Math.max(...scored.map((h) => h.catAvg[cat.id]));
    const winners = scored.filter((h) => h.catAvg[cat.id] === best);
    // An award everyone wins isn't an award.
    if (scored.length > 1 && winners.length === scored.length) continue;
    awards.push({
      id: `best-${cat.id}`,
      emoji: cat.emoji,
      title: `Best ${cat.label}`,
      teamIds: winners.map((h) => h.teamId),
      value: round(best),
      detail: `${round(best, 2)} stars on average`,
    });
  }

  const judged = critics.filter((c) => c.count > 0);
  if (judged.length > 1) {
    const low = Math.min(...judged.map((c) => c.avgGiven));
    const high = Math.max(...judged.map((c) => c.avgGiven));
    if (low !== high) {
      awards.push({
        id: 'harshest',
        emoji: '🧊',
        title: 'Harshest Critic',
        teamIds: judged.filter((c) => c.avgGiven === low).map((c) => c.teamId),
        value: round(low),
        detail: `Handed out ${round(low, 2)} / 10 on average`,
      });
      awards.push({
        id: 'generous',
        emoji: '💸',
        title: 'Most Generous',
        teamIds: judged.filter((c) => c.avgGiven === high).map((c) => c.teamId),
        value: round(high),
        detail: `Handed out ${round(high, 2)} / 10 on average`,
      });
    }
  }

  if (valid.length) {
    const top = Math.max(...valid.map((c) => c.overall));
    const topCards = valid.filter((c) => c.overall === top);
    awards.push({
      id: 'top-score',
      emoji: '👑',
      title: 'Highest Single Score',
      pairs: topCards.map((c) => ({ from: c.teamId, to: nightById.get(c.nightId)?.hostTeamId })),
      value: top,
      detail: `${top} / 10`,
    });
    const bottom = Math.min(...valid.map((c) => c.overall));
    if (bottom !== top) {
      awards.push({
        id: 'low-score',
        emoji: '💀',
        title: 'Lowest Blow',
        pairs: valid.filter((c) => c.overall === bottom).map((c) => ({ from: c.teamId, to: nightById.get(c.nightId)?.hostTeamId })),
        value: bottom,
        detail: `${bottom} / 10`,
      });
    }
  }

  // Biggest beef: the largest gap between what two teams gave each other.
  const given = new Map(); // "from>to" -> [scores]
  for (const c of valid) {
    const to = nightById.get(c.nightId)?.hostTeamId;
    const key = `${c.teamId}>${to}`;
    if (!given.has(key)) given.set(key, []);
    given.get(key).push(c.overall);
  }
  let beef = null;
  for (const [key, scores] of given) {
    const [a, b] = key.split('>');
    if (a > b) continue;
    const back = given.get(`${b}>${a}`);
    if (!back) continue;
    const ab = mean(scores);
    const ba = mean(back);
    const gap = Math.abs(ab - ba);
    if (gap >= 3 && (!beef || gap > beef.gap)) beef = { a, b, ab, ba, gap };
  }
  if (beef) {
    awards.push({
      id: 'beef',
      emoji: '🥩',
      title: 'Biggest Beef',
      pairs: [
        { from: beef.a, to: beef.b, score: round(beef.ab, 1) },
        { from: beef.b, to: beef.a, score: round(beef.ba, 1) },
      ],
      value: round(beef.gap, 1),
      detail: `A ${round(beef.gap, 1)} point grudge`,
    });
  }

  return awards;
}

/* ------------------------------------------------------------------ */
/* Grand Reveal                                                        */
/* ------------------------------------------------------------------ */

function hostSummary(h, nights) {
  const nightIds = h.nightIds;
  // Comments are shown anonymously, so shuffle them away from the card order.
  const quotes = seededShuffle(
    h.cards.filter((c) => c.comment).map((c) => c.comment),
    `${h.teamId}:${nightIds.join(',')}`,
  );
  return {
    teamId: h.teamId,
    place: h.place,
    nightIds,
    nightNumbers: nights.filter((n) => nightIds.includes(n.id)).map((n) => n.number),
    count: h.count,
    total: h.total,
    avg: round(h.avg, 2),
    starsAvg: round(h.starsAvg, 2),
    catAvg: Object.fromEntries(Object.entries(h.catAvg).map(([k, v]) => [k, round(v, 2)])),
    cards: h.cards.map((c) => ({ fromTeamId: c.teamId, nightId: c.nightId, overall: c.overall, stars: c.stars })),
    quotes,
  };
}

// Builds the sequence of screens for the Grand Reveal, from last place up.
export function buildRevealScript({ teams, nights, cards, categories }) {
  const results = computeResults({ teams, nights, cards, categories });
  const ranked = results.ranking.filter((h) => h.place != null);
  const winners = ranked.filter((h) => h.place === 1);
  const others = ranked.filter((h) => h.place !== 1).reverse();
  const lastPlace = ranked.length ? ranked[ranked.length - 1].place : null;

  const steps = [{ kind: 'intro', teams: ranked.length, cards: results.cardsCount, nights: nights.length }];
  for (const h of others) {
    steps.push({ kind: 'team', last: h.place === lastPlace && ranked.length > 1, ...hostSummary(h, nights) });
  }
  if (winners.length) {
    steps.push({ kind: 'drumroll', tie: winners.length > 1 });
    steps.push({ kind: 'winner', winners: winners.map((h) => hostSummary(h, nights)) });
  }
  if (results.awards.length) steps.push({ kind: 'awards', awards: results.awards });
  steps.push({
    kind: 'final',
    ranking: results.ranking.map((h) => ({
      teamId: h.teamId,
      place: h.place,
      count: h.count,
      total: h.total,
      avg: round(h.avg, 2),
      starsAvg: round(h.starsAvg, 2),
    })),
  });
  return steps;
}

/* ------------------------------------------------------------------ */
/* Public results (what the leaderboard shows once scores are out)     */
/* ------------------------------------------------------------------ */

export function publicResults({ teams, nights, cards, categories }) {
  const results = computeResults({ teams, nights, cards, categories });
  return {
    cardsCount: results.cardsCount,
    awards: results.awards,
    critics: results.critics.map((c) => ({ ...c, avgGiven: round(c.avgGiven, 2), starsAvgGiven: round(c.starsAvgGiven, 2) })),
    ranking: results.ranking.map((h) => hostSummary(h, nights)),
  };
}
