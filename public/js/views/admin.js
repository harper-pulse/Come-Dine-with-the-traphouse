// Organiser area: first-run setup, PIN login, and the control room.
import { html, useState, useEffect, useMemo } from '../lib.js';
import {
  useApp,
  app,
  emit,
  loadAdmin,
  loginAdmin,
  logoutAdmin,
  adminAction,
  setAdminToken,
  refresh,
  setSpoilers,
  teamById,
  tz,
} from '../store.js';
import { request } from '../api.js';
import { go } from '../router.js';
import { FireText, PageTitle, Avatar, TeamBadge, Sheet, Dots, Icon, TeamDot, Progress } from '../components.js';
import { PortraitsSection } from '../portraits.js';
import { toast, sound, celebrate } from '../fx.js';
import {
  TEAM_COLORS,
  DEFAULT_TEAM_NAMES,
  DEFAULT_TIMEZONE,
  zonedToUtcISO,
  utcToZoned,
  defaultLockISO,
  nightStatus,
  addDays,
} from '../shared/core.js';
import { fmtDay, fmtTime, fmtDayLong, copyText, shareText, joinLink, download, csvCell, memberNames } from '../util.js';
import { ProfileForm, HostForm } from './me.js';

const TABS = [
  ['overview', 'Overview'],
  ['teams', 'Teams & invites'],
  ['nights', 'Nights'],
  ['scores', 'Scorecards'],
  ['reveal', 'Reveal'],
  ['settings', 'Settings'],
];

function useAsync() {
  const [busy, setBusy] = useState('');
  const run = async (key, fn, okMsg) => {
    setBusy(key);
    try {
      const r = await fn();
      if (okMsg) {
        sound.play('pop');
        toast(okMsg, 'ok');
      }
      return r;
    } catch (err) {
      toast(err.message, 'error', 5000);
      return null;
    } finally {
      setBusy('');
    }
  };
  return [busy, run];
}

/* ------------------------------------------------------------------ */
/* Setup wizard                                                        */
/* ------------------------------------------------------------------ */

function nextSaturday() {
  const today = utcToZoned(new Date().toISOString(), DEFAULT_TIMEZONE).date;
  const [y, m, d] = today.split('-').map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return addDays(today, ((6 - dow + 7) % 7) + 7);
}

function Setup({ auth }) {
  const [step, setStep] = useState(1);
  const [eventName, setEventName] = useState('Come Dine With The Traphouse');
  const [pin, setPin] = useState('');
  const [pin2, setPin2] = useState('');
  const [teams, setTeams] = useState(DEFAULT_TEAM_NAMES.map((name, i) => ({ name, members: [`Player ${i * 2 + 1}`, `Player ${i * 2 + 2}`] })));
  const [firstDate, setFirstDate] = useState(nextSaturday());
  const [time, setTime] = useState('18:30');
  const [every, setEvery] = useState('7');
  const [order, setOrder] = useState([0, 1, 2, 3, 4]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const existingPin = auth?.claimed || auth?.envPin;

  useEffect(() => {
    setOrder((o) => (o.length === teams.length ? o : teams.map((_, i) => i)));
  }, [teams.length]);

  const next = (e) => {
    e.preventDefault();
    setError('');
    if (step === 1) {
      if (!existingPin && !/^\d{4,8}$/.test(pin)) return setError('Pick a PIN of 4 to 8 digits.');
      if (!existingPin && pin !== pin2) return setError("The PINs don't match.");
      if (existingPin && !pin) return setError('Enter the organiser PIN.');
    }
    if (step === 2 && teams.some((t) => !t.name.trim())) return setError('Every team needs a name.');
    if (step < 3) return setStep(step + 1);
    finish();
  };

  const finish = async () => {
    if (new Set(order).size !== order.length) return setError('Each team should host exactly one night.');
    setBusy(true);
    try {
      const r = await request('POST', '/api/auth', {
        body: { action: 'setup', pin, eventName, teams, firstDate, time, every: Number(every), hostOrder: order, timezone: DEFAULT_TIMEZONE },
      });
      setAdminToken(r.token);
      await refresh({ force: true });
      await loadAdmin();
      emit();
      celebrate('passed', { title: "you're the boss", sub: 'PORTAL LIVE' });
      go('admin/teams');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const setTeam = (i, patch) => setTeams(teams.map((t, j) => (j === i ? { ...t, ...patch } : t)));

  return html`<div class="page narrow stack-lg">
    <${PageTitle} kicker=${`Organiser setup · step ${step} of 3`} title=${['Claim the portal', 'The crews', 'The schedule'][step - 1]}>
      ${step === 1 && (existingPin ? 'Enter the organiser PIN to set the portal up again.' : 'You are the first one here, so you become the organiser. Pick a PIN you will remember.')}
      ${step === 2 && 'Name the teams and who is in them. Teams can change their own name and pick characters later.'}
      ${step === 3 && 'When is the first dinner, and who hosts which night? You can fine-tune every date afterwards.'}
    <//>
    <form class="panel paper stack" onSubmit=${next}>
      ${step === 1 && html`
        <label class="field"><span class="label">Event name</span>
          <input class="input" maxlength="60" value=${eventName} onInput=${(e) => setEventName(e.target.value)} /></label>
        <label class="field"><span class="label">${existingPin ? 'Organiser PIN' : 'Organiser PIN (4 to 8 digits)'}</span>
          <input class="input code" inputmode="numeric" type="password" maxlength="8" value=${pin} onInput=${(e) => setPin(e.target.value.replace(/\D/g, ''))} /></label>
        ${!existingPin && html`<label class="field"><span class="label">PIN again</span>
          <input class="input code" inputmode="numeric" type="password" maxlength="8" value=${pin2} onInput=${(e) => setPin2(e.target.value.replace(/\D/g, ''))} /></label>
          <p class="hint">Only you should know this. It unlocks team codes, dates and the Grand Reveal.</p>`}`}
      ${step === 2 && html`
        ${teams.map((t, i) => html`<fieldset key=${i} class="panel paper tight" style=${`margin:0;border-left:8px solid ${TEAM_COLORS[i % TEAM_COLORS.length]}`}>
          <legend class="sr-only">Team ${i + 1}</legend>
          <label class="field"><span class="label">Team ${i + 1} name</span>
            <input class="input" maxlength="40" value=${t.name} onInput=${(e) => setTeam(i, { name: e.target.value })} /></label>
          <div class="grid-2" style="gap:10px;margin-top:10px">
            ${[0, 1].map((m) => html`<label class="field" key=${m}><span class="label">Player ${m + 1}</span>
              <input class="input" maxlength="40" value=${t.members[m]} onInput=${(e) => setTeam(i, { members: t.members.map((x, k) => (k === m ? e.target.value : x)) })} /></label>`)}
          </div>
        </fieldset>`)}
        <div class="row wrap">
          ${teams.length < 8 && html`<button type="button" class="btn sm dark" onClick=${() => setTeams([...teams, { name: `Team ${teams.length + 1}`, members: [`Player ${teams.length * 2 + 1}`, `Player ${teams.length * 2 + 2}`] }])}><${Icon} name="plus" size="18" />Add a team</button>`}
          ${teams.length > 2 && html`<button type="button" class="btn sm ghost" style="color:var(--paper-ink)" onClick=${() => setTeams(teams.slice(0, -1))}>Remove last team</button>`}
        </div>`}
      ${step === 3 && html`
        <div class="grid-2" style="gap:12px">
          <label class="field"><span class="label">First dinner</span>
            <input class="input" type="date" value=${firstDate} onInput=${(e) => setFirstDate(e.target.value)} /></label>
          <label class="field"><span class="label">Start time</span>
            <input class="input" type="time" value=${time} onInput=${(e) => setTime(e.target.value)} /></label>
        </div>
        <label class="field"><span class="label">Then every</span>
          <select class="select" value=${every} onChange=${(e) => setEvery(e.target.value)}>
            <option value="7">Week</option>
            <option value="14">Fortnight</option>
            <option value="28">Four weeks</option>
            <option value="1">Day (a dinner every night)</option>
            <option value="0">Dates to be confirmed</option>
          </select></label>
        <div class="stack">
          <span class="label">Who hosts which night?</span>
          ${order.map((teamIndex, n) => html`<div class="row" key=${n}>
            <span class="night-num nowrap" style="min-width:74px">Night ${n + 1}</span>
            <select class="select" value=${teamIndex} onChange=${(e) => setOrder(order.map((x, k) => (k === n ? Number(e.target.value) : x)))}>
              ${teams.map((t, i) => html`<option key=${i} value=${i}>${t.name}</option>`)}
            </select>
            ${every !== '0' && html`<span class="small muted nowrap">${fmtDay(zonedToUtcISO(addDays(firstDate, n * Number(every)), time, DEFAULT_TIMEZONE), DEFAULT_TIMEZONE)}</span>`}
          </div>`)}
        </div>`}
      ${error && html`<p class="error-text" role="alert">${error}</p>`}
      <div class="row">
        ${step > 1 && html`<button type="button" class="btn ghost" style="color:var(--paper-ink)" onClick=${() => setStep(step - 1)}>Back</button>`}
        <button class="btn" style="flex:1" disabled=${busy}>${step < 3 ? 'Next' : busy ? 'Building…' : '🔥 Open the portal'}</button>
      </div>
    </form>
  </div>`;
}

function AdminLogin() {
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await loginAdmin(pin);
      sound.play('pop');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };
  return html`<div class="page narrow stack-lg">
    <${PageTitle} kicker="Organiser" title="Staff only">Enter the organiser PIN.<//>
    <form class="panel paper stack" onSubmit=${submit}>
      <label class="field"><span class="label">PIN</span>
        <input class="input code" type="password" inputmode="numeric" maxlength="8" value=${pin} onInput=${(e) => setPin(e.target.value.replace(/\D/g, ''))} autofocus /></label>
      ${error && html`<p class="error-text" role="alert">${error}</p>`}
      <button class="btn block" disabled=${busy || !pin}>${busy ? 'Checking…' : 'Unlock'}</button>
      <p class="hint">Forgot it? Set an ADMIN_PIN environment variable in Vercel and redeploy. That PIN then works instead.</p>
    </form>
  </div>`;
}

/* ------------------------------------------------------------------ */
/* Overview                                                            */
/* ------------------------------------------------------------------ */

function SubmissionMatrix({ showTimes = false }) {
  const a = useApp();
  const s = a.state;
  const cards = a.admin?.cards || [];
  const zone = tz();
  return html`<div class="table-wrap">
    <table class="matrix">
      <thead><tr><th class="team-cell">Guest team</th>${s.nights.map((n) => html`<th key=${n.id}>N${n.number}</th>`)}</tr></thead>
      <tbody>
        ${s.teams.map((t) => html`<tr key=${t.id}>
          <th class="team-cell"><span class="row" style="gap:6px"><${TeamDot} team=${t} />${t.name}</span></th>
          ${s.nights.map((n) => {
            if (n.hostTeamId === t.id) return html`<td key=${n.id} class="cell-host">HOST</td>`;
            const card = cards.find((c) => c.nightId === n.id && c.teamId === t.id);
            return html`<td key=${n.id} class="cell-guest">${card
              ? html`<span style="color:var(--ok);font-weight:800">${a.spoilers && card.overall != null ? `${card.overall}` : '✓'}</span>${showTimes && html`<div class="tiny faint">${fmtDay(card.updatedAt, zone)}</div>`}`
              : html`<span class="faint">·</span>`}</td>`;
          })}
        </tr>`)}
      </tbody>
    </table>
  </div>`;
}

function Overview() {
  const a = useApp();
  const s = a.state;
  const ad = a.admin;
  const zone = tz();
  const open = s.nights.filter((n) => nightStatus(n) === 'open');
  return html`<div class="stack-lg">
    <div class="grid-3">
      <div class="panel tight">
        <div class="kicker">Database</div>
        <div class="panel-title" style="margin:4px 0 0">${ad.storage === 'redis' ? '✅ Upstash Redis' : ad.storage === 'file' ? '🧪 Local test file' : '❌ Missing'}</div>
      </div>
      <div class="panel tight">
        <div class="kicker">Photos</div>
        <div class="panel-title" style="margin:4px 0 0">${ad.features.photos ? '✅ On' : '⏸️ Off'}</div>
        ${!ad.features.photos && html`<p class="small muted">Add a Blob store in Vercel Storage, then redeploy.</p>`}
      </div>
      <div class="panel tight">
        <div class="kicker">Scorecards in</div>
        <div class="panel-title" style="margin:4px 0 6px">${s.counts.submitted} / ${s.counts.expected}</div>
        <${Progress} value=${s.counts.submitted} max=${s.counts.expected} />
      </div>
    </div>
    ${open.length > 0 && html`<div class="panel tone-red halftone">
      <div class="kicker" style="color:#fff">Scoring open now</div>
      ${open.map((n) => html`<p key=${n.id}><strong>Night ${n.number}</strong> at ${teamById(n.hostTeamId)?.name}: ${n.submitted.length}/${n.guests.length} in.
        ${n.locksAt ? ` Locks ${fmtDay(n.locksAt, zone)} ${fmtTime(n.locksAt, zone)}.` : ''}</p>`)}
    </div>`}
    <section class="panel stack">
      <div class="panel-head"><div class="panel-title" style="margin:0">Who has scored</div>
        <label class="check small"><input type="checkbox" checked=${a.spoilers} onChange=${async (e) => {
          if (e.target.checked && !confirm('Show the actual scores? This spoils the surprise for you.')) {
            e.target.checked = false;
            return;
          }
          await setSpoilers(e.target.checked);
        }} />Show scores (spoilers)</label>
      </div>
      <${SubmissionMatrix} showTimes />
    </section>
    <section class="panel stack">
      <div class="panel-title">Launch checklist</div>
      <ol style="margin:0;padding-left:1.2em;line-height:1.8">
        <li><a href="#/admin/teams">Check team names and send each team its invite link</a></li>
        <li><a href="#/admin/nights">Confirm dates, times and hosts</a></li>
        <li>Hosts add their theme, address and menu from their own team page</li>
        <li>On the night: guests score from their phones before they leave</li>
        <li><a href="#/admin/reveal">After the last dinner, run the Grand Reveal</a></li>
      </ol>
      <p class="small muted">Playing too? Log in to your own team on this phone with your team's link. Organiser and team logins work side by side.</p>
    </section>
  </div>`;
}

/* ------------------------------------------------------------------ */
/* Teams & invites                                                     */
/* ------------------------------------------------------------------ */

let qrLoader = null;
function loadQr() {
  if (window.qrcode) return Promise.resolve(window.qrcode);
  qrLoader ||= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = '/vendor/qrcode.js';
    s.onload = () => resolve(window.qrcode);
    s.onerror = reject;
    document.head.appendChild(s);
  });
  return qrLoader;
}

function QrCode({ text }) {
  const [svg, setSvg] = useState('');
  useEffect(() => {
    loadQr().then((qrcode) => {
      const qr = qrcode(0, 'M');
      qr.addData(text);
      qr.make();
      setSvg(qr.createSvgTag({ cellSize: 6, margin: 2, scalable: true }));
    });
  }, [text]);
  return html`<div class="qr" dangerouslySetInnerHTML=${{ __html: svg }}></div>`;
}

function inviteText(team, code) {
  const s = app.state;
  const zone = tz();
  const night = s.nights.find((n) => n.hostTeamId === team.id);
  return [
    `🔥 ${s.event.name} 🔥`,
    `You're ${team.name} (${memberNames(team)}).`,
    night ? `You host Night ${night.number}${night.startsAt ? ` on ${fmtDayLong(night.startsAt, zone)}` : ''}.` : '',
    `Your secret team link (keep it in the team): ${joinLink(code)}`,
    `Team code: ${code}`,
  ].filter(Boolean).join('\n');
}

function TeamAdmin({ team, code }) {
  const a = useApp();
  const [busy, run] = useAsync();
  const [qr, setQr] = useState(false);
  const [edit, setEdit] = useState(false);
  const full = a.admin.teams.find((t) => t.id === team.id) || team;
  const link = joinLink(code);
  return html`<article class="panel stack" style=${`border-top:10px solid ${full.color}`}>
    <div class="row between wrap">
      <div class="row"><${TeamBadge} team=${full} size=${46} /><div><div class="panel-title" style="margin:0">${full.name}</div><div class="small muted">${memberNames(full)}</div></div></div>
      <button class="btn sm dark" onClick=${() => setEdit(!edit)}><${Icon} name="edit" size="18" />${edit ? 'Close' : 'Edit'}</button>
    </div>
    <div class="row wrap">
      <span class="code-box" aria-label="Team code">${code || '------'}</span>
      <button class="btn sm" onClick=${async () => {
        const r = await shareText({ title: a.state.event.name, text: inviteText(full, code) });
        if (r === 'copied') toast('Invite copied. Paste it into the chat.', 'ok');
      }}><${Icon} name="share" size="18" />Send invite</button>
      <button class="btn sm dark" onClick=${async () => (await copyText(link)) && toast('Link copied.', 'ok')}><${Icon} name="copy" size="18" />Copy link</button>
      <button class="btn sm dark" onClick=${() => setQr(true)}><${Icon} name="qr" size="18" />QR</button>
    </div>
    ${edit && html`<div class="stack">
      <div>
        <span class="label">Team colour</span>
        <div class="row wrap">${TEAM_COLORS.map((c) => html`<button key=${c} type="button" aria-label=${`Colour ${c}`} aria-pressed=${full.color === c}
          onClick=${() => run('color', () => adminAction({ action: 'teams', teams: [{ id: full.id, color: c }] }))}
          style=${`width:34px;height:34px;border-radius:50%;background:${c};border:3px solid ${full.color === c ? '#fff' : 'var(--ink)'};cursor:pointer`}></button>`)}</div>
      </div>
      <${ProfileForm} team=${full} saving=${busy === 'profile'} onSave=${(p) => run('profile', () => adminAction({ action: 'teams', teams: [{ id: full.id, ...p }] }), 'Team saved.')} />
      <${PortraitsSection} team=${full} ai=${{ mode: a.admin.ai?.mode }} teamId=${full.id} />
      ${a.admin.ai?.mode !== 'off' && html`<div class="row between wrap">
        <span class="small muted">AI portrait goes used by this team: ${Number(a.admin.ai?.used?.[full.id] || 0)} of ${a.admin.ai?.limit}</span>
        <button class="btn sm dark" disabled=${busy === 'goes'} onClick=${() => run('goes', () => adminAction({ action: 'resetAiGoes', teamId: full.id }), 'AI goes reset.')}>Reset goes</button>
      </div>`}
      <div class="row wrap">
        <button class="btn sm dark" disabled=${busy === 'regen'} onClick=${() => confirm(`Make a new code for ${full.name}? Their old link stops working and they'll need the new one.`) && run('regen', () => adminAction({ action: 'regenCode', teamId: full.id }), 'New code made. Send them the new invite.')}>New code</button>
        <button class="btn sm red" disabled=${busy === 'remove'} onClick=${() => confirm(`Remove ${full.name} completely? Their night and every scorecard they gave or got will be deleted.`) && run('remove', () => adminAction({ action: 'removeTeam', teamId: full.id }), 'Team removed.')}>Remove team</button>
      </div>
    </div>`}
    <${Sheet} open=${qr} onClose=${() => setQr(false)} label="QR code">
      <div class="stack center">
        <div class="panel-title">${full.name}</div>
        <p class="small muted">Scan with the phone camera to log in as this team.</p>
        <${QrCode} text=${link} />
        <span class="code-box">${code}</span>
        <button class="btn dark block" onClick=${() => setQr(false)}>Done</button>
      </div>
    <//>
  </article>`;
}

function TeamsTab() {
  const a = useApp();
  const [busy, run] = useAsync();
  const codes = a.admin.codes;
  const all = a.state.teams.map((t) => inviteText(t, codes[t.id])).join('\n\n');
  return html`<div class="stack-lg">
    <div class="panel stack">
      <div class="panel-title">Invites</div>
      <p class="small">Send each team its own link. Tapping it logs their phones in as that team. Codes are the backup if a link gets lost.</p>
      <div class="row wrap">
        <button class="btn sm" onClick=${async () => (await copyText(all)) && toast('All invites copied.', 'ok')}><${Icon} name="copy" size="18" />Copy all invites</button>
        ${a.state.teams.length < 8 && html`<button class="btn sm dark" disabled=${busy === 'add'} onClick=${() => run('add', () => adminAction({ action: 'addTeam' }), 'Team added, with its own night.')}><${Icon} name="plus" size="18" />Add a team</button>`}
      </div>
    </div>
    ${a.state.teams.map((t) => html`<${TeamAdmin} key=${t.id} team=${t} code=${codes[t.id]} />`)}
  </div>`;
}

/* ------------------------------------------------------------------ */
/* Nights                                                              */
/* ------------------------------------------------------------------ */

function NightAdmin({ night, draft, onDraft }) {
  const a = useApp();
  const [busy, run] = useAsync();
  const [open, setOpen] = useState(false);
  const zone = tz();
  const status = nightStatus(night);
  const info = a.admin.hostinfo[night.id];
  return html`<article class="panel stack" style=${`border-left:10px solid ${teamById(draft.hostTeamId)?.color || 'var(--ink)'}`}>
    <div class="row between wrap">
      <${FireText} text=${`Night ${night.number}`} style="font-size:1.8rem" />
      <span class=${`pill ${status === 'open' ? 'live' : status === 'closed' ? 'lock' : ''}`}>${status === 'open' ? 'Scoring open' : status === 'closed' ? 'Locked' : 'Upcoming'}</span>
    </div>
    <label class="field"><span class="label">Host team</span>
      <select class="select" value=${draft.hostTeamId} onChange=${(e) => onDraft({ hostTeamId: e.target.value })}>
        ${a.state.teams.map((t) => html`<option key=${t.id} value=${t.id}>${t.name}</option>`)}
      </select></label>
    <div class="grid-2" style="gap:12px">
      <label class="field"><span class="label">Date</span><input class="input" type="date" value=${draft.date} onInput=${(e) => onDraft({ date: e.target.value })} /></label>
      <label class="field"><span class="label">Start time</span><input class="input" type="time" value=${draft.time} onInput=${(e) => onDraft({ time: e.target.value })} /></label>
    </div>
    <details>
      <summary class="small" style="cursor:pointer;color:var(--muted)">Scorecards lock ${draft.lockDate ? `${fmtDay(zonedToUtcISO(draft.lockDate, draft.lockTime, zone), zone)} at ${draft.lockTime}` : 'midday the next day'}. Change</summary>
      <div class="grid-2" style="gap:12px;margin-top:10px">
        <label class="field"><span class="label">Lock date</span><input class="input" type="date" value=${draft.lockDate} onInput=${(e) => onDraft({ lockDate: e.target.value, lockTouched: true })} /></label>
        <label class="field"><span class="label">Lock time</span><input class="input" type="time" value=${draft.lockTime} onInput=${(e) => onDraft({ lockTime: e.target.value, lockTouched: true })} /></label>
      </div>
    </details>
    <div>
      <span class="label">Scoring</span>
      <div class="seg" role="group" aria-label="Scoring override">
        ${[['auto', 'Automatic'], ['open', 'Force open'], ['locked', 'Force locked']].map(([v, label]) => html`<button type="button" key=${v} aria-pressed=${night.scoring === v}
          disabled=${busy === 'scoring'} onClick=${() => run('scoring', () => adminAction({ action: 'scoring', nightId: night.id, scoring: v }), `Scoring set to ${label.toLowerCase()}.`)}>${label}</button>`)}
      </div>
      <p class="hint">Automatic opens scoring when the dinner starts and locks it at the lock time.</p>
    </div>
    <button type="button" class="btn sm dark" onClick=${() => setOpen(!open)}><${Icon} name="edit" size="18" />${open ? 'Hide' : 'Edit'} theme, address & menu</button>
    ${open && html`<div class="panel tight" style="background:var(--bg-3)">
      <${HostForm} info=${info} saving=${busy === 'host'} onSave=${(form) => run('host', () => adminAction({ action: 'hostinfo', nightId: night.id, ...form }), 'Night details saved.')} />
    </div>`}
  </article>`;
}

function NightsTab() {
  const a = useApp();
  const zone = tz();
  const [busy, run] = useAsync();
  const fromNight = (n) => {
    const start = utcToZoned(n.startsAt, zone);
    const lock = utcToZoned(n.locksAt, zone);
    return { id: n.id, hostTeamId: n.hostTeamId, date: start.date, time: start.time || '18:30', lockDate: lock.date, lockTime: lock.time || '12:00', lockTouched: false };
  };
  const [drafts, setDrafts] = useState(() => a.admin.config.nights.map(fromNight));
  const key = a.admin.config.nights.map((n) => `${n.id}${n.startsAt}${n.locksAt}${n.hostTeamId}`).join('|');
  useEffect(() => setDrafts(a.admin.config.nights.map(fromNight)), [key]);

  const update = (id, patch) => setDrafts(drafts.map((d) => {
    if (d.id !== id) return d;
    const next = { ...d, ...patch };
    if ((patch.date !== undefined || patch.time !== undefined) && !next.lockTouched && next.date) {
      const lock = utcToZoned(defaultLockISO(zonedToUtcISO(next.date, next.time, zone), zone), zone);
      next.lockDate = lock.date;
      next.lockTime = lock.time;
    }
    return next;
  }));

  const save = () => {
    const hosts = drafts.map((d) => d.hostTeamId);
    if (new Set(hosts).size !== hosts.length && !confirm('Some teams host more than once. Save anyway?')) return;
    const nights = drafts.map((d) => ({
      id: d.id,
      hostTeamId: d.hostTeamId,
      startsAt: d.date ? zonedToUtcISO(d.date, d.time || '18:30', zone) : null,
      locksAt: d.date && d.lockDate ? zonedToUtcISO(d.lockDate, d.lockTime || '12:00', zone) : null,
    }));
    run('save', () => adminAction({ action: 'nights', nights }), 'Schedule saved.');
  };

  const nights = a.state.nights;
  return html`<div class="stack-lg">
    <p class="muted small">Times are ${zone.replace('_', ' ')} time. Change dates and hosts, then hit save at the bottom.</p>
    ${nights.map((n) => {
      const d = drafts.find((x) => x.id === n.id);
      return d ? html`<${NightAdmin} key=${n.id} night=${n} draft=${d} onDraft=${(p) => update(n.id, p)} />` : null;
    })}
    <div style="position:sticky;bottom:calc(var(--nav-h) + var(--safe-b) + 10px);z-index:5">
      <button class="btn lg block" disabled=${busy === 'save'} onClick=${save}>${busy === 'save' ? 'Saving…' : 'Save schedule'}</button>
    </div>
  </div>`;
}

/* ------------------------------------------------------------------ */
/* Scorecards                                                          */
/* ------------------------------------------------------------------ */

function ScoresTab() {
  const a = useApp();
  const s = a.state;
  const [busy, run] = useAsync();
  const cards = a.admin.cards;
  const nightly = s.event.revealMode === 'nightly';

  const exportCsv = async () => {
    const data = await request('GET', '/api/admin?spoilers=1', { token: app.adminToken });
    const cats = data.config.categories;
    const rows = [['Night', 'Host team', 'Scoring team', 'Overall', ...cats.map((c) => c.label), 'Comment', 'Submitted', 'Updated']];
    for (const c of data.cards) {
      const night = data.config.nights.find((n) => n.id === c.nightId);
      rows.push([
        night?.number,
        teamById(night?.hostTeamId)?.name,
        teamById(c.teamId)?.name,
        c.overall,
        ...cats.map((cat) => c.stars?.[cat.id]),
        c.comment,
        c.submittedAt,
        c.updatedAt,
      ]);
    }
    download('come-dine-scorecards.csv', rows.map((r) => r.map(csvCell).join(',')).join('\n'), 'text/csv');
  };

  return html`<div class="stack-lg">
    <section class="panel stack">
      <div class="panel-head"><div class="panel-title" style="margin:0">Scorecards</div>
        <label class="check small"><input type="checkbox" checked=${a.spoilers} onChange=${async (e) => {
          if (e.target.checked && !confirm('Show the actual scores? This spoils the surprise for you.')) {
            e.target.checked = false;
            return;
          }
          await setSpoilers(e.target.checked);
        }} />Show scores</label>
      </div>
      <${SubmissionMatrix} showTimes />
      <p class="small muted">A tick means that team has handed in a scorecard. Scores stay hidden unless you tick "Show scores".</p>
    </section>

    ${nightly && html`<section class="panel stack">
      <div class="panel-title">Reveal nights</div>
      <p class="small muted">You're in night-by-night mode. Revealing a night publishes its scores and locks its scorecards.</p>
      ${s.nights.map((n) => html`<div class="row between" key=${n.id}>
        <span>Night ${n.number}: ${teamById(n.hostTeamId)?.name} <${Dots} on=${n.submitted.length} total=${n.guests.length} /></span>
        ${n.revealed
          ? html`<button class="btn sm dark" disabled=${busy === n.id} onClick=${() => run(n.id, () => adminAction({ action: 'revealNight', nightId: n.id, revealed: false }), 'Hidden again.')}>Hide</button>`
          : html`<button class="btn sm" disabled=${busy === n.id || !n.submitted.length} onClick=${() => confirm(`Reveal the scores for night ${n.number}?`) && run(n.id, () => adminAction({ action: 'revealNight', nightId: n.id, revealed: true }), `Night ${n.number} revealed.`)}>Reveal</button>`}
      </div>`)}
    </section>`}

    <section class="panel stack">
      <div class="panel-title">Fix a mistake</div>
      <p class="small muted">Delete a scorecard if a team submitted for the wrong night. They can hand in a new one while scoring is open.</p>
      ${cards.length === 0
        ? html`<p class="small">No scorecards yet.</p>`
        : cards.map((c) => {
            const night = s.nights.find((n) => n.id === c.nightId);
            return html`<div class="row between" key=${`${c.nightId}:${c.teamId}`}>
              <span class="small">N${night?.number}: <strong>${teamById(c.teamId)?.name}</strong> scored ${teamById(night?.hostTeamId)?.name}${a.spoilers && c.overall != null ? ` (${c.overall}/10)` : ''}</span>
              <button class="btn sm ghost" aria-label="Delete scorecard" disabled=${busy === c.nightId + c.teamId}
                onClick=${() => confirm('Delete this scorecard?') && run(c.nightId + c.teamId, () => adminAction({ action: 'deleteCard', nightId: c.nightId, teamId: c.teamId }), 'Scorecard deleted.')}><${Icon} name="trash" size="18" /></button>
            </div>`;
          })}
    </section>

    <section class="panel stack">
      <div class="panel-title">Export</div>
      <p class="small muted">Spreadsheet of every scorecard, including comments. Contains spoilers.</p>
      <button class="btn sm dark" onClick=${() => confirm('The spreadsheet shows every score. Download it?') && exportCsv().catch((e) => toast(e.message, 'error'))}>Download CSV</button>
    </section>
  </div>`;
}

/* ------------------------------------------------------------------ */
/* Reveal                                                              */
/* ------------------------------------------------------------------ */

function RevealTab() {
  const a = useApp();
  const [busy, run] = useAsync();
  const show = a.admin.reveal.show;
  const s = a.state;
  return html`<div class="stack-lg">
    <section class="panel tone-purple halftone stack">
      <div class="kicker" style="color:var(--flame-1)">The Grand Reveal</div>
      <div class="panel-title" style="margin:0">${show.status === 'idle' ? 'Not started' : show.status === 'live' ? `Live: screen ${show.step + 1} of ${show.total}` : 'Finished. Results are public.'}</div>
      <p class="small">Scores go from last place up to the winner, with each guest team's score flipping in, the taxi confessionals, then the awards. Put it on the TV and click through. Everyone else can follow on their phones.</p>
      <div class="row wrap">
        <a class="btn" href="#/reveal">🎬 ${show.status === 'idle' ? 'Open presenter screen' : 'Go to the reveal'}</a>
      </div>
    </section>
    <section class="panel stack">
      <div class="panel-title">Before you start</div>
      <p class="small">${s.counts.submitted} of ${s.counts.expected} scorecards are in. Starting locks every scorecard.</p>
      <p class="small muted">Keyboard and presentation clickers work too: right arrow or Page Down for next, left arrow for back.</p>
    </section>
    ${show.status !== 'idle' && html`<section class="panel stack danger-zone">
      <div class="panel-title">Reset the reveal</div>
      <p class="small muted">Hides the results again and unlocks scorecards (if their nights are still open). Use it if you started too early.</p>
      <button class="btn sm red" disabled=${busy === 'reset'} onClick=${() => confirm('Reset the Grand Reveal? Results will be hidden again.') && run('reset', () => adminAction({ action: 'show', op: 'reset' }), 'Reveal reset.')}>Reset reveal</button>
    </section>`}
  </div>`;
}

/* ------------------------------------------------------------------ */
/* Settings                                                            */
/* ------------------------------------------------------------------ */

function SettingsTab() {
  const a = useApp();
  const ev = a.admin.config.event;
  const [busy, run] = useAsync();
  const [form, setForm] = useState({ name: ev.name, tagline: ev.tagline, prize: ev.prize, timezone: ev.timezone, revealMode: ev.revealMode, rules: (ev.rules || []).join('\n') });
  const [cats, setCats] = useState(a.admin.config.categories.map((c) => ({ ...c })));
  const [pin, setPin] = useState('');
  const [confirmText, setConfirmText] = useState('');
  const set = (patch) => setForm({ ...form, ...patch });

  const saveEvent = (e) => {
    e.preventDefault();
    run('event', () => adminAction({ action: 'event', ...form, rules: form.rules.split('\n').map((r) => r.trim()).filter(Boolean) }), 'Settings saved.');
  };

  const restore = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const backup = JSON.parse(await file.text());
      if (!confirm('Replace EVERYTHING in the portal with this backup?')) return;
      await run('import', () => adminAction({ action: 'import', backup }), 'Backup restored.');
    } catch {
      toast('That file is not a portal backup.', 'error');
    }
  };

  const backup = async () => {
    const data = await request('GET', '/api/admin?backup=1', { token: app.adminToken });
    download(`come-dine-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(data, null, 2), 'application/json');
  };

  return html`<div class="stack-lg">
    <form class="panel stack" onSubmit=${saveEvent}>
      <div class="panel-title">The event</div>
      <label class="field"><span class="label">Name</span><input class="input" maxlength="60" value=${form.name} onInput=${(e) => set({ name: e.target.value })} /></label>
      <label class="field"><span class="label">Tagline</span><input class="input" maxlength="90" value=${form.tagline} onInput=${(e) => set({ tagline: e.target.value })} /></label>
      <label class="field"><span class="label">Prize</span><input class="input" maxlength="90" value=${form.prize} onInput=${(e) => set({ prize: e.target.value })} placeholder="The Golden Spatula and $200 bar tab" /></label>
      <label class="field"><span class="label">Time zone</span><input class="input" value=${form.timezone} onInput=${(e) => set({ timezone: e.target.value })} /></label>
      <div>
        <span class="label">When do scores come out?</span>
        <div class="seg" role="group">
          <button type="button" aria-pressed=${form.revealMode === 'final'} onClick=${() => set({ revealMode: 'final' })}>All at the Grand Reveal</button>
          <button type="button" aria-pressed=${form.revealMode === 'nightly'} onClick=${() => set({ revealMode: 'nightly' })}>Night by night</button>
        </div>
        <p class="hint">${form.revealMode === 'final' ? 'Like the show: everything stays sealed until the final reveal.' : 'You reveal each night from the Scorecards tab, so there is a running leaderboard.'}</p>
      </div>
      <label class="field"><span class="label">House rules (one per line)</span>
        <textarea class="textarea" style="min-height:200px" value=${form.rules} onInput=${(e) => set({ rules: e.target.value })}></textarea></label>
      <button class="btn" disabled=${busy === 'event'}>${busy === 'event' ? 'Saving…' : 'Save'}</button>
    </form>

    <section class="panel stack">
      <div class="panel-title">Star categories</div>
      <p class="small muted">Rated 1 to 5 stars on every scorecard. Change these before the first dinner: scorecards already handed in keep their old categories.</p>
      ${cats.map((c, i) => html`<div class="row" key=${i}>
        <input class="input" style="width:64px;text-align:center" maxlength="8" value=${c.emoji} aria-label="Emoji" onInput=${(e) => setCats(cats.map((x, j) => (j === i ? { ...x, emoji: e.target.value } : x)))} />
        <input class="input" maxlength="24" value=${c.label} aria-label="Category name" onInput=${(e) => setCats(cats.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
        <button class="btn sm ghost" aria-label="Remove" disabled=${cats.length <= 1} onClick=${() => setCats(cats.filter((_, j) => j !== i))}><${Icon} name="trash" size="18" /></button>
      </div>`)}
      <div class="row wrap">
        ${cats.length < 8 && html`<button class="btn sm dark" onClick=${() => setCats([...cats, { id: '', label: 'New category', emoji: '⭐' }])}><${Icon} name="plus" size="18" />Add</button>`}
        <button class="btn sm" disabled=${busy === 'cats'} onClick=${() => run('cats', () => adminAction({ action: 'categories', categories: cats }), 'Categories saved.')}>Save categories</button>
      </div>
    </section>

    ${!a.admin.envPin && html`<section class="panel stack">
      <div class="panel-title">Change organiser PIN</div>
      <div class="row">
        <input class="input code" type="password" inputmode="numeric" maxlength="8" value=${pin} onInput=${(e) => setPin(e.target.value.replace(/\D/g, ''))} aria-label="New PIN" />
        <button class="btn" disabled=${busy === 'pin' || pin.length < 4} onClick=${() => run('pin', () => adminAction({ action: 'changePin', pin }), 'PIN changed.').then(() => setPin(''))}>Change</button>
      </div>
    </section>`}

    <section class="panel stack">
      <div class="panel-title">Backup</div>
      <p class="small muted">Download everything (teams, nights, scorecards) as a file. Contains spoilers.</p>
      <div class="row wrap">
        <button class="btn sm dark" onClick=${() => backup().catch((e) => toast(e.message, 'error'))}>Download backup</button>
        <label class="btn sm dark" style="cursor:pointer">Restore from file<input type="file" accept="application/json,.json" class="sr-only" onChange=${restore} /></label>
      </div>
    </section>

    <section class="panel stack danger-zone">
      <div class="panel-title">Danger zone</div>
      <label class="field"><span class="label">Type RESET or DELETE EVERYTHING to unlock</span>
        <input class="input" value=${confirmText} onInput=${(e) => setConfirmText(e.target.value)} /></label>
      <div class="row wrap">
        <button class="btn sm red" disabled=${confirmText !== 'RESET' || busy === 'rs'} onClick=${() => run('rs', () => adminAction({ action: 'resetScores', confirm: 'RESET' }), 'All scorecards deleted.').then(() => setConfirmText(''))}>Delete all scorecards</button>
        <button class="btn sm red" disabled=${confirmText !== 'DELETE EVERYTHING' || busy === 'ra'} onClick=${() => run('ra', () => adminAction({ action: 'resetAll', confirm: 'DELETE EVERYTHING' }), 'Portal wiped. Run setup again.').then(() => refresh({ force: true }))}>Factory reset</button>
      </div>
    </section>

    <section class="panel stack">
      <button class="btn dark" onClick=${() => {
        logoutAdmin();
        go('');
      }}><${Icon} name="logout" />Log out of organiser mode</button>
    </section>
  </div>`;
}

/* ------------------------------------------------------------------ */
/* Shell                                                               */
/* ------------------------------------------------------------------ */

export function AdminView({ tab }) {
  const a = useApp();
  const [auth, setAuth] = useState(null);

  useEffect(() => {
    app.adminWanted = true;
    if (app.adminToken) loadAdmin().then(emit);
    return () => {
      app.adminWanted = false;
    };
  }, []);

  useEffect(() => {
    request('GET', '/api/auth').then(setAuth).catch(() => setAuth({ setup: false, claimed: false }));
  }, [a.v, a.adminToken]);

  if (!a.state?.setup) {
    if (!auth) return html`<div class="page narrow"><p class="hud" style="margin-top:30px">Loading…</p></div>`;
    return html`<${Setup} auth=${auth} />`;
  }
  if (!a.adminToken) return html`<${AdminLogin} />`;
  if (!a.admin) return html`<div class="page narrow"><p class="hud" style="margin-top:30px">Opening the control room…</p></div>`;

  const body = {
    overview: html`<${Overview} />`,
    teams: html`<${TeamsTab} />`,
    nights: html`<${NightsTab} />`,
    scores: html`<${ScoresTab} />`,
    reveal: html`<${RevealTab} />`,
    settings: html`<${SettingsTab} />`,
  }[tab] || html`<${Overview} />`;

  return html`<div class="page stack-lg">
    <${PageTitle} kicker="Organiser" title="Control room" />
    <nav class="tabs" aria-label="Organiser sections">
      ${TABS.map(([id, label]) => html`<a key=${id} href=${`#/admin/${id}`} aria-current=${tab === id ? 'page' : undefined}>${label}</a>`)}
    </nav>
    ${body}
  </div>`;
}
