// End-to-end API test. Spins up the dev server against a throwaway local
// database and plays through a whole event: setup, logins, hosting details,
// scorecards, cheating attempts, the Grand Reveal and photos.
//
//   npm test
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cdwm-test-'));
const port = 4100 + Math.floor(Math.random() * 500);
const base = `http://127.0.0.1:${port}`;

const env = { ...process.env, PORT: String(port), LOCAL_DATA_DIR: dataDir, AVATAR_AI: 'mock', AVATAR_LIMIT: '2' };
for (const k of ['KV_REST_API_URL', 'KV_REST_API_TOKEN', 'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN', 'VERCEL', 'ADMIN_PIN', 'AI_GATEWAY_API_KEY', 'AVATAR_MODEL']) delete env[k];
const server = spawn(process.execPath, [path.join(root, 'scripts/dev.mjs')], { env, stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise((resolve) => server.stdout.on('data', (d) => String(d).includes('running at') && resolve()));

let passed = 0;
async function step(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ok  ${name}`);
  } catch (err) {
    console.error(`  FAIL ${name}\n`, err);
    server.kill();
    process.exit(1);
  }
}

async function api(method, url, { token, body, raw, headers = {} } = {}) {
  const res = await fetch(base + url, {
    method,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(body ? { 'content-type': 'application/json' } : {}),
      ...headers,
    },
    body: raw ?? (body ? JSON.stringify(body) : undefined),
    redirect: 'manual',
  });
  const text = await res.text();
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  return { status: res.status, data, headers: res.headers };
}

const state = async () => (await api('GET', `/api/state?v=${(await api('GET', '/api/version')).data.v}`)).data;

let admin;
let codes;
const teamTokens = {};

console.log('Come Dine portal API test');

await step('fresh portal reports not set up', async () => {
  const r = await api('GET', '/api/auth');
  assert.equal(r.status, 200);
  assert.equal(r.data.setup, false);
  assert.equal(r.data.claimed, false);
  const s = await api('GET', '/api/state');
  assert.equal(s.data.setup, false);
});

await step('setup rejects a bad PIN', async () => {
  const r = await api('POST', '/api/auth', { body: { action: 'setup', pin: '12' } });
  assert.equal(r.status, 400);
});

await step('organiser claims the portal', async () => {
  const r = await api('POST', '/api/auth', {
    body: {
      action: 'setup',
      pin: '4242',
      eventName: 'Come Dine With The Traphouse',
      teams: [
        { name: 'Alpha', members: ['Ana', 'Ari'] },
        { name: 'Bravo', members: ['Ben', 'Bea'] },
        { name: 'Charlie', members: ['Cam', 'Cat'] },
        { name: 'Delta', members: ['Dan', 'Dee'] },
        { name: 'Echo', members: ['Eli', 'Eve'] },
      ],
      firstDate: '2026-10-03',
      time: '18:30',
      every: 7,
      hostOrder: [2, 0, 1, 3, 4],
    },
  });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  admin = r.data.token;
  assert.ok(admin);
});

await step('second setup is refused', async () => {
  const r = await api('POST', '/api/auth', { body: { action: 'setup', pin: '9999' } });
  assert.equal(r.status, 409);
});

await step('admin login works and wrong PIN fails', async () => {
  assert.equal((await api('POST', '/api/auth', { body: { action: 'admin', pin: '0000' } })).status, 401);
  const r = await api('POST', '/api/auth', { body: { action: 'admin', pin: '4242' } });
  assert.equal(r.status, 200);
  admin = r.data.token;
});

await step('admin view has codes, schedule in NZ time and no spoilers', async () => {
  const r = await api('GET', '/api/admin', { token: admin });
  assert.equal(r.status, 200);
  codes = r.data.codes;
  assert.equal(Object.keys(codes).length, 5);
  assert.equal(r.data.config.nights[0].hostTeamId, 't3');
  assert.equal(r.data.config.nights[0].startsAt, '2026-10-03T05:30:00.000Z');
  assert.equal(r.data.config.nights[0].locksAt, '2026-10-03T23:00:00.000Z');
  assert.equal(r.data.teams[0].members[0].name, 'Ana');
});

await step('team codes log in, junk codes do not', async () => {
  assert.equal((await api('POST', '/api/auth', { body: { action: 'team', code: 'NOPE99' } })).status, 401);
  for (const [teamId, code] of Object.entries(codes)) {
    const r = await api('POST', '/api/auth', { body: { action: 'team', code: code.toLowerCase().split('').join(' ') } });
    assert.equal(r.status, 200);
    assert.equal(r.data.teamId, teamId);
    teamTokens[teamId] = r.data.token;
  }
});

await step('team tokens cannot use admin routes', async () => {
  assert.equal((await api('GET', '/api/admin', { token: teamTokens.t1 })).status, 401);
});

await step('scoring is closed before the dinner starts', async () => {
  const r = await api('POST', '/api/team', { token: teamTokens.t1, body: { action: 'score', nightId: 'n1', overall: 8, stars: {} } });
  assert.equal(r.status, 409);
});

await step('host edits their night, others cannot', async () => {
  const r = await api('POST', '/api/team', {
    token: teamTokens.t3,
    body: { action: 'host', nightId: 'n1', theme: 'Sopranos Sunday', suburb: 'Westgate', address: '1 Westgate Dr', menu: { starter: 'Arancini', main: 'Lasagne', dessert: 'Tiramisu', drinks: 'Negronis' } },
  });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal((await api('POST', '/api/team', { token: teamTokens.t1, body: { action: 'host', nightId: 'n1', theme: 'hacked' } })).status, 403);
  const s = await state();
  const n1 = s.nights.find((n) => n.id === 'n1');
  assert.equal(n1.theme, 'Sopranos Sunday');
  assert.equal(n1.menu, null, 'menu hidden until revealed');
  assert.equal(n1.hasMenu, true);
  assert.ok(!JSON.stringify(s).includes('1 Westgate Dr'), 'address must not be public');
});

await step('host reveals menu; guests see the address privately', async () => {
  await api('POST', '/api/team', { token: teamTokens.t3, body: { action: 'host', nightId: 'n1', menuRevealed: true } });
  const s = await state();
  assert.equal(s.nights.find((n) => n.id === 'n1').menu.main, 'Lasagne');
  const me = await api('GET', '/api/team', { token: teamTokens.t1 });
  assert.equal(me.data.nights.find((n) => n.id === 'n1').address, '1 Westgate Dr');
});

await step('team edits profile and dietary needs', async () => {
  const r = await api('POST', '/api/team', {
    token: teamTokens.t1,
    body: { action: 'profile', name: 'Alpha Kitchen', motto: 'We cook, you judge', members: [{ id: 't1a', dietary: 'No mushrooms', avatar: 'crew-3' }] },
  });
  assert.equal(r.status, 200);
  const s = await state();
  const t1 = s.teams.find((t) => t.id === 't1');
  assert.equal(t1.name, 'Alpha Kitchen');
  assert.equal(t1.members[0].avatar, 'crew-3');
  assert.ok(!JSON.stringify(s).includes('No mushrooms'), 'dietary is private');
  const me = await api('GET', '/api/team', { token: teamTokens.t3 });
  assert.equal(me.data.dietary.find((d) => d.teamId === 't1').members[0].dietary, 'No mushrooms');
});

const JPEG = Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==', 'base64');

await step('AI portraits: generate, keep, serve, limit and remove', async () => {
  const me = await api('GET', '/api/team', { token: teamTokens.t2 });
  assert.equal(me.data.ai.mode, 'mock');
  assert.equal(me.data.ai.left, 2);

  const gen = await fetch(`${base}/api/avatar?action=generate&target=team`, { method: 'POST', headers: { authorization: `Bearer ${teamTokens.t2}`, 'content-type': 'image/jpeg' }, body: JPEG });
  assert.equal(gen.status, 200);
  assert.equal(gen.headers.get('x-ai-goes-left'), '1');
  assert.ok((await gen.arrayBuffer()).byteLength > 0);

  const save = await fetch(`${base}/api/avatar?action=save&target=team`, { method: 'POST', headers: { authorization: `Bearer ${teamTokens.t2}`, 'content-type': 'image/jpeg' }, body: JPEG });
  assert.equal(save.status, 200);
  const { url } = await save.json();
  let s = await state();
  assert.equal(s.teams.find((t) => t.id === 't2').portrait, url);
  const img = await fetch(base + url);
  assert.equal(img.status, 200);
  assert.equal(img.headers.get('content-type'), 'image/jpeg');
  assert.match(img.headers.get('cache-control'), /immutable/);

  const solo = await fetch(`${base}/api/avatar?action=save&target=t2a`, { method: 'POST', headers: { authorization: `Bearer ${teamTokens.t2}`, 'content-type': 'image/jpeg' }, body: JPEG });
  assert.equal(solo.status, 200);
  s = await state();
  const member = s.teams.find((t) => t.id === 't2').members.find((m) => m.id === 't2a');
  assert.equal(member.avatar, 'custom');
  assert.ok(member.avatarUrl.startsWith('/api/avatar?id=member%3At2a'));

  // Another team's player, junk bytes and a used-up allowance are all refused.
  const other = await fetch(`${base}/api/avatar?action=save&target=t3a`, { method: 'POST', headers: { authorization: `Bearer ${teamTokens.t2}` }, body: JPEG });
  assert.equal(other.status, 400);
  const junk = await fetch(`${base}/api/avatar?action=save&target=team`, { method: 'POST', headers: { authorization: `Bearer ${teamTokens.t2}` }, body: Buffer.from('not an image') });
  assert.equal(junk.status, 415);
  await fetch(`${base}/api/avatar?action=generate&target=t2b`, { method: 'POST', headers: { authorization: `Bearer ${teamTokens.t2}` }, body: JPEG });
  const capped = await fetch(`${base}/api/avatar?action=generate&target=t2b`, { method: 'POST', headers: { authorization: `Bearer ${teamTokens.t2}` }, body: JPEG });
  assert.equal(capped.status, 429);

  // The organiser can reset a team's goes, and can make portraits for any team.
  assert.equal((await api('POST', '/api/admin', { token: admin, body: { action: 'resetAiGoes', teamId: 't2' } })).status, 200);
  assert.equal((await api('GET', '/api/team', { token: teamTokens.t2 })).data.ai.left, 2);
  const forT5 = await fetch(`${base}/api/avatar?action=save&target=team&teamId=t5`, { method: 'POST', headers: { authorization: `Bearer ${admin}` }, body: JPEG });
  assert.equal(forT5.status, 200);

  // Picking a poster character is still allowed afterwards, and removal works.
  await api('POST', '/api/team', { token: teamTokens.t2, body: { action: 'profile', members: [{ id: 't2a', avatar: 'crew-1' }] } });
  s = await state();
  assert.equal(s.teams.find((t) => t.id === 't2').members.find((m) => m.id === 't2a').avatar, 'crew-1');
  const del = await fetch(`${base}/api/avatar?target=t2a`, { method: 'DELETE', headers: { authorization: `Bearer ${teamTokens.t2}` } });
  assert.equal(del.status, 200);
  s = await state();
  assert.equal(s.teams.find((t) => t.id === 't2').members.find((m) => m.id === 't2a').avatarUrl, '');
  assert.equal(s.features.aiPortraits, true);
});

await step('organiser opens scoring for every night', async () => {
  const a = await api('GET', '/api/admin', { token: admin });
  const r = await api('POST', '/api/admin', { token: admin, body: { action: 'nights', nights: a.data.config.nights.map((n) => ({ id: n.id, scoring: 'open' })) } });
  assert.equal(r.status, 200);
});

// Scores given: guest team -> host team. Host order n1..n5: t3, t1, t2, t4, t5
const given = {
  t1: { t3: 7, t2: 8, t4: 6, t5: 9 },
  t2: { t3: 6, t1: 9, t4: 5, t5: 8 },
  t3: { t1: 8, t2: 7, t4: 4, t5: 9 },
  t4: { t3: 8, t1: 9, t2: 6, t5: 7 },
  t5: { t3: 5, t1: 3, t2: 7, t4: 6 },
};
const hostNight = { t3: 'n1', t1: 'n2', t2: 'n3', t4: 'n4', t5: 'n5' };

await step('cannot score your own dinner', async () => {
  const r = await api('POST', '/api/team', { token: teamTokens.t3, body: { action: 'score', nightId: 'n1', overall: 10, stars: {} } });
  assert.equal(r.status, 403);
});

await step('invalid scorecards are rejected', async () => {
  const bad = await api('POST', '/api/team', { token: teamTokens.t1, body: { action: 'score', nightId: 'n1', overall: 11, stars: {} } });
  assert.equal(bad.status, 400);
  const noStars = await api('POST', '/api/team', { token: teamTokens.t1, body: { action: 'score', nightId: 'n1', overall: 7, stars: { starter: 3 } } });
  assert.equal(noStars.status, 400);
});

await step('every guest team submits a scorecard for every night', async () => {
  for (const [from, scores] of Object.entries(given)) {
    for (const [host, overall] of Object.entries(scores)) {
      const stars = { starter: 3, main: 4, dessert: overall > 7 ? 5 : 3, drinks: 4, vibe: host === 't5' ? 5 : 3 };
      const r = await api('POST', '/api/team', {
        token: teamTokens[from],
        body: { action: 'score', nightId: hostNight[host], overall, stars, comment: `${from} on ${host}: secret thoughts` },
      });
      assert.equal(r.status, 200, `${from}->${host}: ${JSON.stringify(r.data)}`);
    }
  }
});

await step('editing a scorecard keeps one card per team', async () => {
  const r = await api('POST', '/api/team', {
    token: teamTokens.t1,
    body: { action: 'score', nightId: 'n1', overall: 7, stars: { starter: 3, main: 4, dessert: 3, drinks: 4, vibe: 3 }, comment: 't1 on t3: secret thoughts' },
  });
  assert.equal(r.data.updated, true);
  const s = await state();
  assert.equal(s.counts.submitted, 20);
  assert.equal(s.counts.expected, 20);
});

await step('public state leaks no scores or comments before the reveal', async () => {
  const s = await state();
  const text = JSON.stringify(s);
  assert.equal(s.results, null);
  assert.ok(!text.includes('secret thoughts'));
  assert.ok(!text.includes('"overall"'));
  const a = await api('GET', '/api/admin', { token: admin });
  assert.ok(!JSON.stringify(a.data.cards).includes('overall'), 'admin view hides scores without spoilers');
  const spoil = await api('GET', '/api/admin?spoilers=1', { token: admin });
  assert.ok(JSON.stringify(spoil.data.cards).includes('overall'));
});

await step('the Grand Reveal steps through from last place to the winner', async () => {
  const r = await api('POST', '/api/admin', { token: admin, body: { action: 'show', op: 'start' } });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  let s = await state();
  assert.equal(s.show.status, 'live');
  assert.equal(s.show.steps.length, 1);
  assert.equal(s.show.steps[0].kind, 'intro');
  assert.equal(s.results, null, 'leaderboard stays sealed while live');

  // Expected averages: t5 = (9+8+9+7)/4 = 8.25 wins; t1 = (9+8+9+3)/4 = 7.25
  const scripts = [];
  for (let i = 0; i < 20; i++) {
    const n = await api('POST', '/api/admin', { token: admin, body: { action: 'show', op: 'next' } });
    assert.equal(n.status, 200);
    s = await state();
    scripts.push(s.show.steps[s.show.steps.length - 1]);
    if (s.show.status === 'done') break;
  }
  const kinds = scripts.map((x) => x.kind);
  assert.deepEqual(kinds.slice(0, 4), ['team', 'team', 'team', 'team']);
  assert.equal(scripts[0].last, true, 'first team revealed is last place');
  assert.ok(kinds.includes('drumroll'));
  const winner = scripts.find((x) => x.kind === 'winner');
  assert.equal(winner.winners[0].teamId, 't5');
  assert.equal(winner.winners[0].avg, 8.25);
  assert.equal(winner.winners[0].quotes.length, 4);
  assert.equal(s.show.status, 'done');
  assert.equal(s.results.ranking[0].teamId, 't5');
  assert.equal(s.results.ranking[0].place, 1);
});

await step('awards are computed', async () => {
  const s = await state();
  const ids = s.results.awards.map((a) => a.id);
  for (const id of ['best-dessert', 'best-vibe', 'harshest', 'generous', 'top-score', 'low-score', 'beef']) {
    assert.ok(ids.includes(id), `missing award ${id}`);
  }
  // Every team got the same starter, main and drinks stars, so nobody wins those.
  for (const id of ['best-starter', 'best-main', 'best-drinks']) {
    assert.ok(!ids.includes(id), `award everyone tied on should be skipped: ${id}`);
  }
  const harsh = s.results.awards.find((a) => a.id === 'harshest');
  assert.deepEqual(harsh.teamIds, ['t5']);
  const vibe = s.results.awards.find((a) => a.id === 'best-vibe');
  assert.deepEqual(vibe.teamIds, ['t5']);
});

await step('scorecards are frozen once the reveal has happened', async () => {
  const r = await api('POST', '/api/team', {
    token: teamTokens.t1,
    body: { action: 'score', nightId: 'n1', overall: 1, stars: { starter: 1, main: 1, dessert: 1, drinks: 1, vibe: 1 } },
  });
  assert.equal(r.status, 409);
});

await step('photos upload, show up and delete', async () => {
  // Smallest valid JPEG header is enough for the type sniffing.
  const jpeg = Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==', 'base64');
  const up = await api('POST', '/api/photos?nightId=n2&caption=Lasagne%20time&w=1&h=1', { token: teamTokens.t2, raw: jpeg, headers: { 'content-type': 'image/jpeg' } });
  assert.equal(up.status, 200, JSON.stringify(up.data));
  let s = await state();
  assert.equal(s.photos.length, 1);
  const img = await fetch(base + s.photos[0].url);
  assert.equal(img.status, 200);
  assert.equal(img.headers.get('content-type'), 'image/jpeg');
  assert.equal((await api('DELETE', `/api/photos?id=${up.data.photo.id}`, { token: teamTokens.t1 })).status, 403);
  assert.equal((await api('DELETE', `/api/photos?id=${up.data.photo.id}`, { token: teamTokens.t2 })).status, 200);
  s = await state();
  assert.equal(s.photos.length, 0);
  const notImage = await api('POST', '/api/photos?nightId=n2', { token: teamTokens.t2, raw: Buffer.from('hello'), headers: { 'content-type': 'image/jpeg' } });
  assert.equal(notImage.status, 415);
});

await step('nightly mode reveals one night at a time', async () => {
  await api('POST', '/api/admin', { token: admin, body: { action: 'show', op: 'reset' } });
  await api('POST', '/api/admin', { token: admin, body: { action: 'event', revealMode: 'nightly' } });
  let s = await state();
  assert.equal(s.results, null);
  await api('POST', '/api/admin', { token: admin, body: { action: 'revealNight', nightId: 'n1', revealed: true } });
  s = await state();
  assert.equal(s.results.partial, true);
  const ranked = s.results.ranking.filter((r) => r.place != null);
  assert.equal(ranked.length, 1);
  assert.equal(ranked[0].teamId, 't3');
  assert.equal(s.nights.find((n) => n.id === 'n1').scoring, 'locked');
});

await step('regenerating a code logs the old session out', async () => {
  await api('POST', '/api/admin', { token: admin, body: { action: 'regenCode', teamId: 't4' } });
  assert.equal((await api('GET', '/api/team', { token: teamTokens.t4 })).status, 401);
});

await step('backup exports and imports cleanly', async () => {
  const b = await api('GET', '/api/admin?backup=1', { token: admin });
  assert.equal(b.data.kind, 'cdwm-backup');
  const r = await api('POST', '/api/admin', { token: admin, body: { action: 'import', backup: b.data } });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const s = await state();
  assert.equal(s.counts.submitted, 20);
});

await step('reset scores wipes cards but keeps the event', async () => {
  assert.equal((await api('POST', '/api/admin', { token: admin, body: { action: 'resetScores' } })).status, 400);
  assert.equal((await api('POST', '/api/admin', { token: admin, body: { action: 'resetScores', confirm: 'RESET' } })).status, 200);
  const s = await state();
  assert.equal(s.counts.submitted, 0);
  assert.equal(s.teams.length, 5);
});

await step('calendar invites download with public details only', async () => {
  const res = await fetch(`${base}/api/calendar`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /text\/calendar/);
  const ics = await res.text();
  assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, 5);
  assert.ok(ics.includes('DTSTART:20261003T053000Z'));
  assert.ok(!ics.includes('1 Westgate Dr'), 'full address must not be in invites');
  const one = await (await fetch(`${base}/api/calendar?night=n2`)).text();
  assert.equal((one.match(/BEGIN:VEVENT/g) || []).length, 1);
});

await step('version responses are cacheable, admin responses are not', async () => {
  const v = await api('GET', '/api/version');
  assert.match(v.headers.get('cache-control'), /s-maxage=2/);
  const st = await api('GET', `/api/state?v=${v.data.v}`);
  assert.match(st.headers.get('cache-control'), /s-maxage=86400/);
  const future = await api('GET', `/api/state?v=${v.data.v + 50}`);
  assert.equal(future.headers.get('cache-control'), 'no-store');
  const a = await api('GET', '/api/admin', { token: admin });
  assert.equal(a.headers.get('cache-control'), 'no-store');
});

console.log(`\n${passed} checks passed`);
server.kill();
fs.rmSync(dataDir, { recursive: true, force: true });
