import { html } from '../lib.js';
import { useApp, teamById, myTeamId, myCard, hostNightOf, tz } from '../store.js';
import {
  FireText,
  TeamChip,
  TeamBadge,
  NightPill,
  Countdown,
  Progress,
  Dots,
  useNow,
  WhenLine,
  Icon,
} from '../components.js';
import { currentNight, nightStatus } from '../shared/core.js';
import { fmtDay, fmtTime, memberNames, isToday, plural } from '../util.js';

function LiveBanner() {
  return html`<a class="panel tone-red halftone" href="#/reveal" style="display:block;text-decoration:none;color:#fff">
    <div class="row between">
      <div>
        <span class="pill live">Live now</span>
        <div class="panel-title" style="margin:8px 0 0">The Grand Reveal is happening</div>
        <p class="small">Tap to follow along on your phone.</p>
      </div>
    </div>
  </a>`;
}

function Hero({ s }) {
  return html`<section class="hero">
    <div class="hero-poster">
      <img src="/img/poster.webp" alt="Come Dine With The Traphouse poster" width="912" height="1173" fetchpriority="high" />
      <span class="pill hot hero-sticker">${plural(s.teams.length, 'team')} · ${plural(s.nights.length, 'night')}</span>
    </div>
    <div class="hero-copy stack">
      <h1 class="sr-only">${s.event.name}</h1>
      <div class="hero-title" aria-hidden="true">
        <div><${FireText} text="come dine" tone="cream" /></div>
        <div><${FireText} text="with the" tone="sky" /></div>
        <div><${FireText} text="traphouse" tone="flame" /></div>
      </div>
      <p class="lede" style="font-size:1.15rem;color:var(--text)">${s.event.tagline}</p>
      ${s.event.prize && html`<p><span class="pill paper">Prize</span> <strong>${s.event.prize}</strong></p>`}
      <div class="cta-row">
        <a class="btn" href="#/rotation"><${Icon} name="rotation" />The rotation</a>
        <a class="btn dark" href="#/rules"><${Icon} name="rules" />House rules</a>
      </div>
    </div>
  </section>`;
}

function NextUp({ night, now }) {
  const a = useApp();
  if (!night) return null;
  const zone = tz();
  const host = teamById(night.hostTeamId);
  const status = nightStatus(night, now);
  const mine = myTeamId();
  const hosting = mine && night.hostTeamId === mine;
  const card = mine && !hosting ? myCard(night.id) : null;
  const tonight = isToday(night.startsAt, zone, now);
  const allDone = a.state.nights.every((n) => nightStatus(n, now) === 'closed');

  let cta;
  if (status === 'open' && mine && !hosting) {
    cta = card
      ? html`<a class="btn paper block" href=${`#/score/${night.id}`}>Scorecard in. Edit it</a>`
      : html`<a class="btn lg block" href=${`#/score/${night.id}`}>Score Night ${night.number}</a>`;
  } else if (hosting) {
    cta = html`<a class="btn block" href="#/me"><${Icon} name="edit" />Edit your menu & details</a>`;
  } else if (status === 'open' && !mine) {
    cta = html`<a class="btn block" href="#/me">Log in to score</a>`;
  } else {
    cta = html`<a class="btn paper block" href=${`#/night/${night.id}`}>Night details</a>`;
  }

  const heading = allDone ? 'All dinners done' : status === 'open' ? (tonight ? 'Tonight' : 'Scoring open') : 'Next up';
  return html`<section class="panel tone-orange halftone next-up has-flames">
    <div class="row between wrap">
      <span class="kicker" style="color:#fff">${heading}</span>
      <${NightPill} night=${night} now=${now} />
    </div>
    <${FireText} tag="h2" text=${`Night ${night.number}`} tone="cream" style="font-size:clamp(2.6rem,11vw,3.6rem);margin-top:6px" />
    <div class="host-line">
      <${TeamChip} team=${host} size=${50} sub=${`Hosting · ${memberNames(host)}`} />
    </div>
    <dl class="kv" style="margin:0 0 14px">
      <dt>When</dt><dd><${WhenLine} night=${night} /></dd>
      ${night.theme && html`<dt>Theme</dt><dd>${night.theme}</dd>`}
      ${night.suburb && html`<dt>Where</dt><dd>${night.suburb}</dd>`}
      ${night.dressCode && html`<dt>Dress</dt><dd>${night.dressCode}</dd>`}
    </dl>
    ${status === 'upcoming' && night.startsAt && html`<div style="margin-bottom:14px"><${Countdown} to=${night.startsAt} /></div>`}
    ${status === 'open' && html`<p class="small" style="margin-bottom:12px">
      ${night.submitted.length} of ${night.guests.length} guest teams have handed in a scorecard.
      ${night.locksAt && ` Locks ${fmtDay(night.locksAt, zone)}, ${fmtTime(night.locksAt, zone)}.`}
    </p>`}
    ${cta}
    <div class="flames" aria-hidden="true"></div>
  </section>`;
}

function YourTeam({ now }) {
  const a = useApp();
  const mine = myTeamId();
  const team = teamById(mine);
  if (!team) return null;
  const zone = tz();
  const hosting = hostNightOf(mine);
  const guestNights = a.state.nights.filter((n) => n.hostTeamId !== mine);
  return html`<section class="panel">
    <div class="row between wrap">
      <div class="row">
        <${TeamBadge} team=${team} size=${46} />
        <div>
          <div class="kicker">You're playing as</div>
          <div class="panel-title" style="margin:0">${team.name}</div>
        </div>
      </div>
      <a class="btn sm dark" href="#/me">My team</a>
    </div>
    <hr class="divider" />
    ${hosting && html`<p style="margin-bottom:10px">You host <a href=${`#/night/${hosting.id}`}><strong>Night ${hosting.number}</strong></a>
      ${hosting.startsAt ? ` on ${fmtDay(hosting.startsAt, zone)}` : ''}.
      ${!hosting.theme || !hosting.hasMenu ? html` <a href="#/me">Add your theme and menu</a>.` : ''}</p>`}
    <div class="stack" style="--gap:8px">
      ${guestNights.map((n) => {
        const status = nightStatus(n, now);
        const card = myCard(n.id);
        let right;
        if (card) right = html`<span class="pill ok">Scored ${card.overall}/10</span>`;
        else if (status === 'open') right = html`<a class="btn sm" href=${`#/score/${n.id}`}>Score now</a>`;
        else if (status === 'closed') right = html`<span class="pill lock">Missed</span>`;
        else right = html`<span class="pill">${n.startsAt ? fmtDay(n.startsAt, zone) : 'TBC'}</span>`;
        return html`<div class="row between" key=${n.id}>
          <span class="row" style="min-width:0"><span class="night-num">N${n.number}</span>
            <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${teamById(n.hostTeamId)?.name}</span></span>
          ${right}
        </div>`;
      })}
    </div>
  </section>`;
}

function SealedStrip() {
  const a = useApp();
  const s = a.state;
  if (s.results && !s.results.partial) {
    const top = s.results.ranking[0];
    const winner = teamById(top?.teamId);
    return html`<a class="panel tone-purple halftone" href="#/board" style="display:block;text-decoration:none;color:inherit">
      <div class="kicker" style="color:var(--flame-1)">The results are in</div>
      <div class="row between" style="margin-top:6px">
        <${FireText} tag="h2" text=${winner?.name || ''} style="font-size:2rem" />
        <span class="btn sm">Leaderboard</span>
      </div>
    </a>`;
  }
  return html`<section class="panel tone-blue halftone">
    <div class="row between wrap">
      <div>
        <div class="kicker" style="color:var(--flame-1)">Scores are sealed</div>
        <p class="small" style="margin-top:4px">${`${s.counts.submitted} of ${s.counts.expected} scorecards handed in. `}${s.event.revealMode === 'nightly' ? 'Each night is revealed once the organiser opens it up.' : 'Nobody sees a thing until the Grand Reveal.'}</p>
      </div>
      <a class="btn sm dark" href="#/board">Leaderboard</a>
    </div>
    <div style="margin-top:12px"><${Progress} value=${s.counts.submitted} max=${s.counts.expected} /></div>
  </section>`;
}

function RotationMini({ now }) {
  const a = useApp();
  const zone = tz();
  return html`<section class="stack">
    <div class="row between">
      <${FireText} tag="h2" text="The rotation" style="font-size:2rem" />
      <a class="link-btn" href="#/rotation">Full schedule</a>
    </div>
    <div class="stack">
      ${a.state.nights.map((n) => {
        const host = teamById(n.hostTeamId);
        return html`<a key=${n.id} class="panel tight" href=${`#/night/${n.id}`} style="display:block;text-decoration:none;color:inherit">
          <div class="row">
            <${FireText} text=${String(n.number)} style="font-size:2.3rem;width:40px;text-align:center" />
            <span class="team-bar" style=${`--team:${host?.color}`}></span>
            <div style="flex:1;min-width:0">
              <div class="team-name display" style="font-size:1.15rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${host?.name}</div>
              <div class="small muted">${n.startsAt ? `${fmtDay(n.startsAt, zone)} · ${fmtTime(n.startsAt, zone)}` : 'Date TBC'}${n.theme ? ` · ${n.theme}` : ''}</div>
            </div>
            <div class="center" style="display:grid;gap:6px;justify-items:end">
              <${NightPill} night=${n} now=${now} />
              ${nightStatus(n, now) !== 'upcoming' && html`<${Dots} on=${n.submitted.length} total=${n.guests.length} />`}
            </div>
          </div>
        </a>`;
      })}
    </div>
  </section>`;
}

function CrewStrip() {
  const a = useApp();
  return html`<section class="stack">
    <div class="row between">
      <${FireText} tag="h2" text="The crews" style="font-size:2rem" />
      <a class="link-btn" href="#/crews">Meet them</a>
    </div>
    <div class="scroll-x">
      ${a.state.teams.map((t) => html`<a key=${t.id} class="panel tight" href=${`#/crews/${t.id}`}
        style=${`width:220px;text-decoration:none;color:inherit;border-top:8px solid ${t.color}`}>
        <${TeamBadge} team=${t} size=${58} />
        <div class="display" style="font-size:1.3rem;margin-top:10px;line-height:1.05">${t.name}</div>
        <div class="small muted">${memberNames(t)}</div>
        ${t.motto && html`<div class="small" style="margin-top:6px;font-style:italic">"${t.motto}"</div>`}
      </a>`)}
    </div>
  </section>`;
}

export function HomeView() {
  const a = useApp();
  const now = useNow(30000);
  const s = a.state;
  const night = currentNight(s.nights, now);
  return html`<div class="page stack-lg">
    ${s.show.status === 'live' && html`<${LiveBanner} />`}
    <${Hero} s=${s} />
    <${NextUp} night=${night} now=${now} />
    ${a.team && html`<${YourTeam} now=${now} />`}
    <${SealedStrip} />
    <${RotationMini} now=${now} />
    <${CrewStrip} />
  </div>`;
}
