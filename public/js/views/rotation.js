import { html } from '../lib.js';
import { useApp, teamById, tz, myTeamId } from '../store.js';
import { FireText, PageTitle, TeamChip, NightPill, TeamDot, useNow, Icon } from '../components.js';
import { currentNight, nightStatus } from '../shared/core.js';
import { fmt, fmtTime, googleCalendarUrl, memberNames } from '../util.js';

function NightCard({ night, now }) {
  const a = useApp();
  const zone = tz();
  const host = teamById(night.hostTeamId);
  const status = nightStatus(night, now);
  const mine = myTeamId();
  const gcal = night.startsAt
    ? googleCalendarUrl({
        title: `${a.state.event.name}: Night ${night.number} at ${host?.name}`,
        startsAt: night.startsAt,
        details: `Hosted by ${host?.name} (${memberNames(host)}). Address and menu: ${location.origin}/#/night/${night.id}`,
        location: night.suburb,
      })
    : null;
  return html`<article class="panel night-card" style=${`border-left:10px solid ${host?.color || 'var(--ink)'}`}>
    <div class="num-col">
      <${FireText} text=${String(night.number)} class="big-num" />
      <div class="date">
        ${night.startsAt
          ? html`${fmt(night.startsAt, zone, { weekday: 'short' })}<br />${fmt(night.startsAt, zone, { day: 'numeric', month: 'short' })}<br />${fmtTime(night.startsAt, zone)}`
          : 'TBC'}
      </div>
    </div>
    <div style="min-width:0">
      <div class="row between wrap" style="margin-bottom:8px">
        <span class="kicker">Night ${night.number}${night.hostTeamId === mine ? ' · you host' : ''}</span>
        <${NightPill} night=${night} now=${now} />
      </div>
      <${TeamChip} team=${host} size=${42} sub=${`Hosts: ${memberNames(host)}`} />
      ${(night.theme || night.suburb) && html`<p class="small" style="margin-top:8px">
        ${night.theme && html`<span>🎭 ${night.theme}</span>`}${night.theme && night.suburb ? ' · ' : ''}${night.suburb && html`<span>📍 ${night.suburb}</span>`}
      </p>`}
      <div class="guests" aria-label="Guests">
        ${night.guests.map((id) => {
          const t = teamById(id);
          const done = night.submitted.includes(id);
          return html`<span class="guest" key=${id}>
            <${TeamDot} team=${t} size=${16} />${t?.name}${status !== 'upcoming' && html`<span class=${done ? 'tick' : 'faint'}>${done ? '✓' : '…'}</span>`}
          </span>`;
        })}
      </div>
      <div class="row wrap" style="margin-top:12px">
        <a class="btn sm" href=${`#/night/${night.id}`}>Details</a>
        ${night.startsAt && html`<a class="btn sm dark" href=${`/api/calendar?night=${night.id}`}><${Icon} name="cal" size="18" />Apple / Outlook</a>`}
        ${gcal && html`<a class="btn sm dark" href=${gcal} target="_blank" rel="noopener">Google Cal</a>`}
      </div>
    </div>
  </article>`;
}

function Matrix({ now }) {
  const a = useApp();
  const s = a.state;
  const current = currentNight(s.nights, now);
  return html`<div class="table-wrap">
    <table class="matrix">
      <thead>
        <tr>
          <th class="team-cell" scope="col">Team</th>
          ${s.nights.map((n) => html`<th key=${n.id} scope="col" class=${current?.id === n.id ? 'now' : ''}>N${n.number}</th>`)}
        </tr>
      </thead>
      <tbody>
        ${s.teams.map((t) => html`<tr key=${t.id}>
          <th class="team-cell" scope="row"><span class="row" style="gap:8px"><${TeamDot} team=${t} />${t.name}</span></th>
          ${s.nights.map((n) => n.hostTeamId === t.id
            ? html`<td key=${n.id} class=${`cell-host ${current?.id === n.id ? 'now' : ''}`}>HOST</td>`
            : html`<td key=${n.id} class=${`cell-guest ${current?.id === n.id ? 'now' : ''}`}>${n.submitted.includes(t.id) ? '✓' : '🍽️'}</td>`)}
        </tr>`)}
      </tbody>
    </table>
  </div>`;
}

export function RotationView() {
  const a = useApp();
  const now = useNow(30000);
  return html`<div class="page stack-lg">
    <${PageTitle} kicker="The schedule" title="The rotation">
      Every team hosts one dinner. The other ${a.state.teams.length - 1} teams come round, eat, and score the hosts at the end of the night.
    <//>
    <div class="row wrap">
      <a class="btn sm" href="/api/calendar"><${Icon} name="cal" size="18" />Add every night to my calendar</a>
    </div>
    <div class="stack">${a.state.nights.map((n) => html`<${NightCard} key=${n.id} night=${n} now=${now} />`)}</div>
    <section class="stack">
      <${FireText} tag="h2" text="Who's where" style="font-size:2rem" />
      <p class="muted small">HOST means cooking. 🍽️ means eating and judging. A tick means that team's scorecard is in.</p>
      <${Matrix} now=${now} />
    </section>
  </div>`;
}
