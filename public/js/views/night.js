import { html } from '../lib.js';
import { useApp, teamById, nightById, tz, myTeamId, myCard, addressOf } from '../store.js';
import {
  FireText,
  AvatarPair,
  NightPill,
  Countdown,
  Stars,
  TeamDot,
  useNow,
  Icon,
  Empty,
} from '../components.js';
import { nightStatus } from '../shared/core.js';
import { fmtDayLong, fmtTime, fmtDay, memberNames, mapsUrl, num, googleCalendarUrl } from '../util.js';
import { NotFound } from './misc.js';

const TONES = ['orange', 'blue', 'purple', 'teal', 'green', 'red'];
export const toneFor = (n) => `tone-${TONES[(n - 1) % TONES.length]}`;

const COURSES = [
  ['starter', 'Starter', '🥟'],
  ['main', 'Main', '🍗'],
  ['dessert', 'Dessert', '🍰'],
  ['drinks', 'Drinks', '🍷'],
];

function Menu({ night }) {
  const hasMenu = night.menu && COURSES.some(([k]) => night.menu[k]);
  if (!hasMenu) {
    return html`<section class="panel paper center">
      <div style="font-size:2.4rem" aria-hidden="true">🤫</div>
      <div class="panel-title">The menu is top secret</div>
      <p class="muted">${night.hasMenu ? 'The hosts have it planned. They will reveal it when they are ready.' : 'The hosts have not announced anything yet.'}</p>
    </section>`;
  }
  return html`<section class="panel paper">
    <div class="center" style="margin-bottom:10px">
      <div class="kicker" style="color:#b33a12">Tonight's menu</div>
      ${night.theme && html`<div class="display" style="font-size:1.6rem">${night.theme}</div>`}
    </div>
    <div class="stack">
      ${COURSES.filter(([k]) => night.menu[k]).map(([k, label, emoji]) => html`<div key=${k} class="center">
        <div class="hud" style="color:#8a6d4c;font-size:.9rem">${emoji} ${label}</div>
        <div style="font-size:1.12rem;font-weight:600">${night.menu[k]}</div>
      </div>`)}
    </div>
  </section>`;
}

function Guests({ night, status }) {
  const a = useApp();
  const dietary = a.team?.dietary || [];
  const people = night.guests.flatMap((id) => (dietary.find((d) => d.teamId === id)?.members || []).map((m) => ({ ...m, teamId: id })));
  const needs = people.filter((p) => p.dietary);
  return html`<section class="panel">
    <div class="panel-head">
      <div class="panel-title" style="margin:0">Guests</div>
      ${status !== 'upcoming' && html`<span class="pill">${night.submitted.length}/${night.guests.length} scorecards</span>`}
    </div>
    <div class="stack">
      ${night.guests.map((id) => {
        const t = teamById(id);
        const done = night.submitted.includes(id);
        return html`<div class="row between" key=${id}>
          <span class="row" style="min-width:0">
            <${AvatarPair} team=${t} size=${34} />
            <span style="min-width:0"><strong>${t?.name}</strong><br /><span class="small muted">${memberNames(t)}</span></span>
          </span>
          ${status !== 'upcoming' && (done ? html`<span class="pill ok">Scored</span>` : html`<span class="pill">Waiting</span>`)}
        </div>`;
      })}
    </div>
    ${a.team &&
    html`<hr class="divider" />
      <div class="kicker" style="margin-bottom:6px">Dietary requirements</div>
      ${needs.length
        ? html`<ul style="margin:0;padding-left:1.1em">${needs.map((p) => html`<li key=${p.id}><strong>${p.name}</strong> (${teamById(p.teamId)?.name}): ${p.dietary}</li>`)}</ul>`
        : html`<p class="small muted">No guests have listed any. Teams can add theirs under My team.</p>`}`}
  </section>`;
}

function NightResults({ night }) {
  const a = useApp();
  const r = a.state.results;
  if (!r) return null;
  if (r.partial && !r.nightIds.includes(night.id)) return null;
  const row = r.ranking.find((x) => x.nightIds.includes(night.id));
  if (!row || !row.count) return null;
  const cats = a.state.categories;
  const cards = row.cards.filter((c) => c.nightId === night.id);
  return html`<section class="stack">
    <${FireText} tag="h2" text="The verdict" style="font-size:2rem" />
    <div class="panel tone-purple halftone">
      <div class="row between wrap">
        <div>
          <div class="kicker" style="color:var(--flame-1)">Average score</div>
          <${FireText} text=${num(row.avg)} tone="money" style="font-size:3.2rem" />
        </div>
        <div class="center">
          <div class="kicker" style="color:var(--flame-1)">Total</div>
          <div class="display" style="font-size:2rem">${row.total} / ${row.count * 10}</div>
        </div>
        ${row.place && html`<div class="center"><div class="kicker" style="color:var(--flame-1)">Place</div><div class="display" style="font-size:2rem">#${row.place}</div></div>`}
      </div>
    </div>
    <div class="grid-2">
      ${cards.map((c) => {
        const from = teamById(c.fromTeamId);
        return html`<div class="panel tight" key=${c.fromTeamId}>
          <div class="row between">
            <span class="row"><${TeamDot} team=${from} /><strong>${from?.name}</strong></span>
            <${FireText} text=${`${c.overall}/10`} style="font-size:1.8rem" />
          </div>
          <div style="margin-top:8px;display:grid;gap:4px">
            ${cats.map((cat) => html`<div class="row between small" key=${cat.id}><span>${cat.emoji} ${cat.label}</span><${Stars} value=${c.stars?.[cat.id]} size=${18} /></div>`)}
          </div>
        </div>`;
      })}
    </div>
    ${row.quotes?.length > 0 && html`<div class="quotes" style="margin-top:8px">
      ${row.quotes.map((q, i) => html`<div class="quote" key=${i} style=${`animation-delay:${i * 0.1}s`}>“${q}”</div>`)}
      <p class="small muted">Taxi confessionals are anonymous.</p>
    </div>`}
  </section>`;
}

export function NightView({ id }) {
  const a = useApp();
  const now = useNow(30000);
  const night = nightById(id);
  if (!night) return html`<${NotFound} />`;
  const zone = tz();
  const host = teamById(night.hostTeamId);
  const status = nightStatus(night, now);
  const mine = myTeamId();
  const hosting = mine === night.hostTeamId;
  const card = mine && !hosting ? myCard(night.id) : null;
  const address = addressOf(night.id);
  const photos = a.state.photos.filter((p) => p.nightId === night.id);
  const gcal = night.startsAt
    ? googleCalendarUrl({
        title: `${a.state.event.name}: Night ${night.number} at ${host?.name}`,
        startsAt: night.startsAt,
        details: `Hosted by ${host?.name}. ${location.origin}/#/night/${night.id}`,
        location: address || night.suburb,
      })
    : null;

  return html`<div class="page stack-lg">
    <a class="link-btn" href="#/rotation">← The rotation</a>
    <section class=${`panel ${toneFor(night.number)} halftone has-flames`}>
      <div class="row between wrap">
        <span class="kicker" style="color:#fff">Night ${night.number}${hosting ? ' · you are hosting' : ''}</span>
        <${NightPill} night=${night} now=${now} />
      </div>
      <${FireText} tag="h1" text=${host?.name || 'TBC'} tone="cream" style="font-size:clamp(2.2rem,10vw,3.4rem);margin:10px 0 8px" />
      <div class="row" style="margin-bottom:14px">
        <${AvatarPair} team=${host} size=${52} />
        <span style="font-weight:600">${memberNames(host)}</span>
      </div>
      <dl class="kv" style="margin-bottom:14px">
        <dt>When</dt><dd>${night.startsAt ? `${fmtDayLong(night.startsAt, zone)}, ${fmtTime(night.startsAt, zone)}` : 'Date TBC'}</dd>
        ${night.arrival && html`<dt>Arrive</dt><dd>${night.arrival}</dd>`}
        ${night.theme && html`<dt>Theme</dt><dd>${night.theme}</dd>`}
        ${night.dressCode && html`<dt>Dress</dt><dd>${night.dressCode}</dd>`}
        ${night.suburb && html`<dt>Suburb</dt><dd>${night.suburb}</dd>`}
        <dt>Address</dt>
        <dd>
          ${address
            ? html`<a href=${mapsUrl(address)} target="_blank" rel="noopener" style="color:#fff">${address} ↗</a>`
            : a.team
              ? html`<span class="muted" style="color:rgba(255,255,255,.75)">Not added yet</span>`
              : html`<a href="#/me" style="color:#fff">Log in to see it</a>`}
        </dd>
      </dl>
      ${status === 'upcoming' && night.startsAt && html`<div style="margin-bottom:14px"><${Countdown} to=${night.startsAt} /></div>`}
      ${status === 'open' && night.locksAt && html`<p class="small" style="margin-bottom:12px">Scorecards lock ${fmtDay(night.locksAt, zone)} at ${fmtTime(night.locksAt, zone)}.</p>`}
      <div class="cta-row" style="margin-top:0">
        ${status === 'open' && mine && !hosting && html`<a class=${`btn ${card ? 'paper' : 'lg'}`} href=${`#/score/${night.id}`}>${card ? `Your score: ${card.overall}/10. Edit` : '📝 Score this dinner'}</a>`}
        ${hosting && html`<a class="btn" href="#/me"><${Icon} name="edit" />Edit your night</a>`}
        ${night.startsAt && html`<a class="btn sm dark" href=${`/api/calendar?night=${night.id}`}><${Icon} name="cal" size="18" />Apple / Outlook</a>`}
        ${gcal && html`<a class="btn sm dark" href=${gcal} target="_blank" rel="noopener">Google Cal</a>`}
      </div>
      <div class="flames" aria-hidden="true"></div>
    </section>

    ${night.message && html`<section class="panel paper">
      <div class="kicker" style="color:#b33a12">A word from the hosts</div>
      <p style="white-space:pre-line;margin-top:6px">${night.message}</p>
    </section>`}

    <${Menu} night=${night} />
    <${Guests} night=${night} status=${status} />
    <${NightResults} night=${night} />

    <section class="stack">
      <div class="row between">
        <${FireText} tag="h2" text="Food pics" style="font-size:2rem" />
        <a class="link-btn" href=${`#/photos?night=${night.id}`}>${a.state.features.photos && a.team ? 'Add photos' : 'All photos'}</a>
      </div>
      ${photos.length
        ? html`<div class="photo-grid">${photos.slice(0, 8).map((p) => html`<a key=${p.id} href=${`#/photos?night=${night.id}`} class="panel flush" style="aspect-ratio:1"><img src=${p.url} alt=${p.caption || 'Food photo'} loading="lazy" style="width:100%;height:100%;object-fit:cover" /></a>`)}</div>`
        : html`<div class="panel"><${Empty} icon="📸" title="No photos yet">Snap the courses on the night.<//></div>`}
    </section>
  </div>`;
}
