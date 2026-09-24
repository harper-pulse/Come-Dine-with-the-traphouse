// App state: the public event state, the logged-in team's private view and
// (on the organiser page) the admin view. Polls /api/version and only pulls
// the full state when something actually changed.
import { useEffect, useReducer } from './lib.js';
import { request } from './api.js';
import { toast } from './fx.js';
import { nightStatus } from './shared/core.js';

const TEAM_KEY = 'cdwm.teamToken';
const ADMIN_KEY = 'cdwm.adminToken';

function readLS(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeLS(key, value) {
  try {
    if (value == null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {}
}

export const app = {
  ready: false,
  error: null, // 'storage_missing' | 'offline' | null
  state: null,
  v: -1,
  teamToken: readLS(TEAM_KEY),
  team: null,
  adminToken: readLS(ADMIN_KEY),
  admin: null,
  adminWanted: false,
  fastPoll: false,
  spoilers: false,
};

const listeners = new Set();
export function emit() {
  listeners.forEach((fn) => fn());
}

export function useApp() {
  const [, force] = useReducer((x) => x + 1, 0);
  useEffect(() => {
    listeners.add(force);
    return () => listeners.delete(force);
  }, []);
  return app;
}

/* ------------------------------------------------------------------ */
/* Loading                                                             */
/* ------------------------------------------------------------------ */

export async function loadTeam() {
  if (!app.teamToken) {
    app.team = null;
    return;
  }
  try {
    app.team = await request('GET', '/api/team', { token: app.teamToken });
  } catch (err) {
    if (err.status === 401) {
      setTeamToken(null);
      toast(err.message, 'error', 5000);
    }
  }
}

export async function loadAdmin() {
  if (!app.adminToken) {
    app.admin = null;
    return;
  }
  try {
    app.admin = await request('GET', `/api/admin${app.spoilers ? '?spoilers=1' : ''}`, { token: app.adminToken });
  } catch (err) {
    if (err.status === 401) {
      setAdminToken(null);
    } else if (err.status === 409) {
      app.admin = null;
    }
  }
}

function applyState(s) {
  if (s && (s.v >= app.v || !app.state)) {
    app.state = s;
    app.v = s.v;
  }
}

let timer = null;
let inflight = null;

export function refresh({ force = false } = {}) {
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const res = await fetch('/api/version', { cache: 'no-store' });
      if (res.status === 503) {
        app.error = 'storage_missing';
        return;
      }
      const { v } = await res.json();
      if (force || v > app.v || !app.state) {
        applyState(await request('GET', `/api/state?v=${v}`));
        await Promise.all([loadTeam(), app.adminWanted ? loadAdmin() : null]);
      }
      app.error = null;
    } catch (err) {
      app.error = err.code === 'storage_missing' ? 'storage_missing' : 'offline';
    } finally {
      app.ready = true;
      inflight = null;
      emit();
      schedule();
    }
  })();
  return inflight;
}

// After a write we know the new version, so fetch it straight away.
export async function syncTo(v) {
  try {
    applyState(await request('GET', `/api/state?v=${v}`));
    await Promise.all([loadTeam(), app.adminWanted ? loadAdmin() : null]);
  } catch {}
  emit();
}

function schedule() {
  clearTimeout(timer);
  if (document.hidden) return;
  const s = app.state;
  let ms = 20000;
  if (app.error) ms = 8000;
  else if (s?.show?.status === 'live') ms = 2000;
  else if (app.fastPoll) ms = 2500;
  else if (s?.nights?.some((n) => nightStatus(n) === 'open')) ms = 6000;
  timer = setTimeout(() => refresh(), ms);
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) clearTimeout(timer);
  else refresh();
});
window.addEventListener('online', () => refresh());

/* ------------------------------------------------------------------ */
/* Sessions                                                            */
/* ------------------------------------------------------------------ */

export function setTeamToken(token) {
  app.teamToken = token;
  if (!token) app.team = null;
  writeLS(TEAM_KEY, token);
}

export function setAdminToken(token) {
  app.adminToken = token;
  if (!token) app.admin = null;
  writeLS(ADMIN_KEY, token);
}

export async function loginTeam(code) {
  const r = await request('POST', '/api/auth', { body: { action: 'team', code } });
  setTeamToken(r.token);
  await loadTeam();
  emit();
  return r;
}

export async function loginAdmin(pin) {
  const r = await request('POST', '/api/auth', { body: { action: 'admin', pin } });
  setAdminToken(r.token);
  await loadAdmin();
  emit();
  return r;
}

export function logoutTeam() {
  setTeamToken(null);
  emit();
}

export function logoutAdmin() {
  setAdminToken(null);
  emit();
}

/* ------------------------------------------------------------------ */
/* Writes                                                              */
/* ------------------------------------------------------------------ */

export async function teamAction(body) {
  try {
    const r = await request('POST', '/api/team', { token: app.teamToken, body });
    if (r.v) await syncTo(r.v);
    return r;
  } catch (err) {
    if (err.status === 401) {
      setTeamToken(null);
      emit();
    }
    throw err;
  }
}

export async function adminAction(body) {
  try {
    const r = await request('POST', '/api/admin', { token: app.adminToken, body });
    if (r.token) setAdminToken(r.token);
    if (r.v) await syncTo(r.v);
    return r;
  } catch (err) {
    if (err.status === 401) {
      setAdminToken(null);
      emit();
    }
    throw err;
  }
}

export async function setSpoilers(on) {
  app.spoilers = on;
  await loadAdmin();
  emit();
}

/* ------------------------------------------------------------------ */
/* Selectors                                                           */
/* ------------------------------------------------------------------ */

export const teamById = (id) => app.state?.teams?.find((t) => t.id === id) || null;
export const nightById = (id) => app.state?.nights?.find((n) => n.id === id) || null;
export const myTeamId = () => app.team?.teamId || null;
export const myTeam = () => teamById(myTeamId());
export const tz = () => app.state?.event?.timezone || 'Pacific/Auckland';
export const hostNightOf = (teamId) => app.state?.nights?.find((n) => n.hostTeamId === teamId) || null;
export const myCard = (nightId) => app.team?.cards?.find((c) => c.nightId === nightId) || null;
export const addressOf = (nightId) => app.team?.nights?.find((n) => n.id === nightId)?.address || '';
