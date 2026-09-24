// Shared UI pieces.
import { html, useEffect, useState, useRef } from './lib.js';
import { app, useApp, teamById, loginTeam } from './store.js';
import { useFx, closeOverlay, sound, toast } from './fx.js';
import { initials, memberNames, fmtDay, fmtTime, isToday } from './util.js';
import { nightStatus, MAX_STARS } from './shared/core.js';

/* ------------------------------------------------------------------ */
/* Icons                                                               */
/* ------------------------------------------------------------------ */

const ICONS = {
  home: 'M3 11.5 12 4l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z',
  rotation: 'M4 7h13l-3-3M20 17H7l3 3M17 7a5 5 0 0 1 3 4.5M7 17a5 5 0 0 1-3-4.5',
  score: 'M9 4h6a1 1 0 0 1 1 1v1h2a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h2V5a1 1 0 0 1 1-1zM9 12l2 2 4-4',
  trophy: 'M8 4h8v5a4 4 0 0 1-8 0zM8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8 20h8M9 17h6',
  more: 'M4 7h16M4 12h16M4 17h16',
  crew: 'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 6.5M18 14.5a6.5 6.5 0 0 1 3.5 5.5',
  photo: 'M4 7h3l2-3h6l2 3h3a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  rules: 'M6 3h9l4 4v14H6zM14 3v5h5M9 12h7M9 16h7',
  me: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0',
  lock: 'M6 11h12v10H6zM8.5 11V7.5a3.5 3.5 0 0 1 7 0V11',
  star: 'M12 3.2l2.6 5.6 6.1.7-4.5 4.2 1.2 6.1L12 16.8l-5.4 3 1.2-6.1-4.5-4.2 6.1-.7z',
  cal: 'M5 5h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zM4 10h16M8 3v4M16 3v4',
  pin: 'M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21zM12 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
  share: 'M12 3v12M7 8l5-5 5 5M5 14v6h14v-6',
  sound: 'M4 9h4l5-4v14l-5-4H4zM16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11',
  mute: 'M4 9h4l5-4v14l-5-4H4zM17 9l5 5M22 9l-5 5',
  shield: 'M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6z',
  reveal: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  back: 'M15 5l-7 7 7 7',
  next: 'M9 5l7 7-7 7',
  close: 'M6 6l12 12M18 6L6 18',
  edit: 'M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4',
  logout: 'M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M10 8l-4 4 4 4M6 12h10',
  plus: 'M12 5v14M5 12h14',
  trash: 'M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13',
  copy: 'M8 8h11v12H8zM5 16V4h11',
  qr: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 14h2v2h-2zM16 16h2v2h-2zM14 18h2v2h-2zM18 18h2v2h-2z',
};

export function Icon({ name, size = 20, class: cls = '' }) {
  const d = ICONS[name] || ICONS.star;
  return html`<svg class=${cls} viewBox="0 0 24 24" width=${size} height=${size} fill="none" stroke="currentColor"
    stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d=${d} /></svg>`;
}

/* ------------------------------------------------------------------ */
/* Lettering                                                           */
/* ------------------------------------------------------------------ */

export function FireText({ text, tag = 'span', tone = '', class: cls = '', style }) {
  const T = tag;
  return html`<${T} class=${`fire ${tone} ${cls}`} style=${style}>
    <span class="fire-base">${text}</span><span class="fire-top" aria-hidden="true">${text}</span>
  </${T}>`;
}

export function PageTitle({ kicker, title, tone = '', children }) {
  return html`<header class="page-head">
    ${kicker && html`<div class="kicker">${kicker}</div>`}
    <${FireText} tag="h1" text=${title} tone=${tone} class="page-title" />
    ${children && html`<p class="lede">${children}</p>`}
  </header>`;
}

/* ------------------------------------------------------------------ */
/* People                                                              */
/* ------------------------------------------------------------------ */

export function Avatar({ member, team, size = 44 }) {
  const style = `--size:${size}px;--team:${team?.color || 'var(--flame-3)'}`;
  if (member?.avatar) {
    return html`<span class="avatar" style=${style}>
      <img src=${`/img/crew/${member.avatar}.webp`} alt="" loading="lazy" width=${size} height=${size} />
    </span>`;
  }
  return html`<span class="avatar" style=${style} aria-hidden="true">${initials(member?.name)}</span>`;
}

export function AvatarPair({ team, size = 44 }) {
  if (!team) return null;
  return html`<span class="avatar-pair" style=${`--size:${size}px`}>
    ${team.members.slice(0, 3).map((m) => html`<${Avatar} key=${m.id} member=${m} team=${team} size=${size} />`)}
  </span>`;
}

export function TeamChip({ team, size = 40, sub, link = true }) {
  if (!team) return html`<span class="muted">TBC</span>`;
  const inner = html`
    <${AvatarPair} team=${team} size=${size} />
    <span style="min-width:0">
      <span class="team-name" style="display:block">${team.name}</span>
      <span class="team-members" style="display:block">${sub ?? memberNames(team)}</span>
    </span>`;
  return link
    ? html`<a class="team-chip" href=${`#/crews/${team.id}`}>${inner}</a>`
    : html`<span class="team-chip">${inner}</span>`;
}

export function TeamDot({ team, size = 12 }) {
  return html`<span style=${`display:inline-block;width:${size}px;height:${size}px;border-radius:50%;background:${team?.color};border:2px solid var(--ink);flex:none`}></span>`;
}

/* ------------------------------------------------------------------ */
/* Ratings                                                             */
/* ------------------------------------------------------------------ */

const STAR_PATH = 'M12 2.6l2.9 6 6.6.8-4.9 4.5 1.3 6.5L12 17.2l-5.9 3.2 1.3-6.5L2.5 9.4l6.6-.8z';

export function Stars({ value = 0, max = MAX_STARS, onChange, size, label }) {
  const style = size ? `--star:${size}px` : undefined;
  const items = Array.from({ length: max }, (_, i) => i + 1);
  if (!onChange) {
    return html`<span class="stars" style=${style} role="img" aria-label=${`${value ?? 0} of ${max} stars`}>
      ${items.map((i) => html`<span key=${i} class=${i <= Math.round(value || 0) ? 'on' : 'off'}>
        <svg viewBox="0 0 24 24"><path d=${STAR_PATH} /></svg></span>`)}
    </span>`;
  }
  return html`<span class="stars" style=${style} role="radiogroup" aria-label=${label}>
    ${items.map((i) => html`<button key=${i} type="button" class=${i <= (value || 0) ? 'on' : 'off'}
      role="radio" aria-checked=${i === value} aria-label=${`${i} star${i > 1 ? 's' : ''}`}
      onClick=${() => {
        sound.play('tick');
        onChange(i);
      }}>
      <svg viewBox="0 0 24 24"><path d=${STAR_PATH} /></svg>
    </button>`)}
  </span>`;
}

/* ------------------------------------------------------------------ */
/* Status                                                              */
/* ------------------------------------------------------------------ */

export function useNow(ms = 1000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

export function NightPill({ night, now = Date.now() }) {
  const status = nightStatus(night, now);
  const tz = app.state?.event?.timezone;
  if (night.revealed) return html`<span class="pill cool">Revealed</span>`;
  if (status === 'open') return html`<span class="pill live">Scoring open</span>`;
  if (status === 'closed') return html`<span class="pill lock">Locked</span>`;
  if (!night.startsAt) return html`<span class="pill">Date TBC</span>`;
  if (isToday(night.startsAt, tz, now)) return html`<span class="pill hot">Tonight 🔥</span>`;
  return html`<span class="pill">Upcoming</span>`;
}

export function Countdown({ to, compact = false }) {
  const now = useNow(1000);
  const ms = Date.parse(to) - now;
  if (!Number.isFinite(ms)) return null;
  if (ms <= 0) return null;
  const s = Math.floor(ms / 1000);
  const parts = [
    ['days', Math.floor(s / 86400)],
    ['hrs', Math.floor((s % 86400) / 3600)],
    ['min', Math.floor((s % 3600) / 60)],
    ['sec', s % 60],
  ];
  if (compact) {
    const [d, h, m] = parts.map((p) => p[1]);
    return html`<span class="hud-num">${d ? `${d}d ` : ''}${h}h ${m}m</span>`;
  }
  return html`<div class="countdown" role="timer" aria-label="Time until the dinner">
    ${parts.map(([lbl, n]) => html`<div class="unit" key=${lbl}><span class="num">${String(n).padStart(2, '0')}</span><span class="lbl">${lbl}</span></div>`)}
  </div>`;
}

export function Progress({ value, max }) {
  const pct = max ? Math.round((value / max) * 100) : 0;
  return html`<div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax=${max} aria-valuenow=${value}><i style=${`width:${pct}%`}></i></div>`;
}

export function Dots({ on, total }) {
  return html`<span class="dots" aria-label=${`${on} of ${total}`}>
    ${Array.from({ length: total }, (_, i) => html`<i key=${i} class=${i < on ? 'on' : ''}></i>`)}
  </span>`;
}

export function Empty({ icon = '🍽️', title, children, action }) {
  return html`<div class="empty">
    <div class="big" aria-hidden="true">${icon}</div>
    <div class="panel-title">${title}</div>
    ${children && html`<p class="muted">${children}</p>`}
    ${action && html`<div style="margin-top:14px">${action}</div>`}
  </div>`;
}

/* ------------------------------------------------------------------ */
/* Sheet                                                               */
/* ------------------------------------------------------------------ */

export function Sheet({ open, onClose, children, paper = false, label }) {
  const ref = useRef();
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    document.addEventListener('keydown', onKey);
    const prev = document.activeElement;
    setTimeout(() => ref.current?.querySelector('input,button,textarea,select,a')?.focus(), 30);
    return () => {
      document.removeEventListener('keydown', onKey);
      prev?.focus?.();
    };
  }, [open]);
  if (!open) return null;
  return html`<div class="scrim" onClick=${(e) => e.target === e.currentTarget && onClose?.()}>
    <div class=${`sheet ${paper ? 'paper' : ''}`} role="dialog" aria-modal="true" aria-label=${label} ref=${ref}>
      <div class="sheet-grab"></div>
      ${children}
    </div>
  </div>`;
}

/* ------------------------------------------------------------------ */
/* Global layers                                                       */
/* ------------------------------------------------------------------ */

export function Toasts() {
  const fx = useFx();
  return html`<div class="toasts" aria-live="polite">
    ${fx.toasts.map((t) => html`<div key=${t.id} class=${`toast ${t.kind}`}>${t.text}</div>`)}
  </div>`;
}

export function OverlayLayer() {
  const fx = useFx();
  const o = fx.overlay;
  if (!o) return null;
  if (o.kind === 'wasted') {
    return html`<div class="wasted" onClick=${closeOverlay}><div class="center">
      <${FireText} text=${o.title || 'WASTED'} tone="blood" />
      ${o.sub && html`<div class="hud" style="font-size:1.4rem;margin-top:10px;color:#fff">${o.sub}</div>`}
    </div></div>`;
  }
  return html`<div class="overlay" onClick=${closeOverlay} role="status">
    <div class="card">
      <${FireText} text=${o.title || 'mission passed!'} class="title" />
      <div><${FireText} text=${o.sub || 'RESPECT +'} tone="white" class="sub" /></div>
    </div>
  </div>`;
}

/* ------------------------------------------------------------------ */
/* Team login                                                          */
/* ------------------------------------------------------------------ */

export function TeamLogin({ onDone, compact = false }) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async (e) => {
    e.preventDefault();
    if (!code.trim()) return;
    setBusy(true);
    setError('');
    try {
      const r = await loginTeam(code);
      const team = teamById(r.teamId);
      sound.play('pop');
      toast(`You're in, ${team?.name || 'team'}.`, 'ok');
      onDone?.(r.teamId);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };
  return html`<form onSubmit=${submit} class="stack">
    ${!compact && html`<div>
      <div class="panel-title">Team login</div>
      <p class="muted small">Your organiser sent each team a secret link or a 6 letter code. Use the link, or type the code here.</p>
    </div>`}
    <label class="field">
      <span class="label">Team code</span>
      <input class="input code" value=${code} onInput=${(e) => setCode(e.target.value.toUpperCase())}
        maxlength="12" autocomplete="one-time-code" autocapitalize="characters" spellcheck="false" placeholder="ABC123" />
    </label>
    ${error && html`<p class="error-text" role="alert">${error}</p>`}
    <button class="btn block" disabled=${busy}>${busy ? 'Checking…' : "Let's go"}</button>
  </form>`;
}

export function NeedTeam({ children }) {
  const a = useApp();
  if (a.team) return children;
  return html`<div class="panel paper">
    <${TeamLogin} />
  </div>`;
}

export function WhenLine({ night }) {
  const tz = app.state?.event?.timezone;
  if (!night?.startsAt) return html`<span>Date TBC</span>`;
  return html`<span>${fmtDay(night.startsAt, tz)} · ${fmtTime(night.startsAt, tz)}</span>`;
}

// "Team A & Team B" or "A → B, C → D (and 2 more)" for award cards.
export function awardWho(award, max = 3) {
  if (award.teamIds) return award.teamIds.map((id) => teamById(id)?.name).join(' & ');
  if (!award.pairs) return '';
  const fmt = (p) => `${teamById(p.from)?.name} → ${teamById(p.to)?.name}${p.score != null ? ` (${p.score})` : ''}`;
  if (award.id === 'beef') return award.pairs.map(fmt).join(' vs ');
  const shown = award.pairs.slice(0, max).map(fmt).join(', ');
  const more = award.pairs.length - max;
  return more > 0 ? `${shown} and ${more} more` : shown;
}
