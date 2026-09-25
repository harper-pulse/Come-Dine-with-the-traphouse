import { html, useState } from '../lib.js';
import { useApp, teamById } from '../store.js';
import { FireText, PageTitle, Avatar, TeamBadge, TeamPortrait, Progress, Stars, TeamDot, Dots, awardWho } from '../components.js';
import { num, ordinal } from '../util.js';

function Sealed() {
  const a = useApp();
  const s = a.state;
  return html`<div class="stack-lg">
    <section class="panel tone-blue halftone sealed">
      <div class="lock" aria-hidden="true">🔒</div>
      <${FireText} tag="h2" text="Scores sealed" tone="cream" style="font-size:clamp(2.4rem,10vw,3.4rem);margin-top:10px" />
      <p style="margin:10px auto 16px;max-width:40ch">
        ${s.event.revealMode === 'nightly'
          ? 'Scores for each night appear here once the organiser reveals them.'
          : 'Nobody sees any scores until the Grand Reveal, including the hosts and the organiser.'}
      </p>
      <div style="max-width:420px;margin:0 auto">
        <${Progress} value=${s.counts.submitted} max=${s.counts.expected} />
        <p class="small" style="margin-top:6px">${s.counts.submitted} of ${s.counts.expected} scorecards handed in</p>
      </div>
      ${s.show.status === 'live' && html`<a class="btn" href="#/reveal" style="margin-top:16px">Watch the Grand Reveal</a>`}
    </section>
    <section class="stack">
      ${s.nights.map((n) => {
        const host = teamById(n.hostTeamId);
        return html`<div class="panel tight" key=${n.id}>
          <div class="row between">
            <span class="row" style="min-width:0"><span class="night-num">N${n.number}</span>
              <${TeamDot} team=${host} /><strong style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${host?.name}</strong></span>
            <span class="row"><span class="hud-num" style="font-size:1.4rem;letter-spacing:.1em">??</span><${Dots} on=${n.submitted.length} total=${n.guests.length} /></span>
          </div>
        </div>`;
      })}
    </section>
  </div>`;
}

function Podium({ ranking }) {
  const top = [1, 2, 3].map((p) => ranking.find((r) => r.place === p));
  const order = [top[1], top[0], top[2]];
  const cls = ['p2', 'p1', 'p3'];
  return html`<div class="podium" aria-label="Podium">
    ${order.map((r, i) => {
      if (!r) return html`<div key=${i}></div>`;
      const t = teamById(r.teamId);
      return html`<div class=${`spot ${cls[i]}`} key=${r.teamId}>
        ${cls[i] === 'p1' && html`<span class="crown" aria-hidden="true">👑</span>`}
        <${TeamBadge} team=${t} size=${cls[i] === 'p1' ? 52 : 40} />
        <div class="name">${t?.name}</div>
        <div class="block">
          <span class="place">${r.place}</span>
          <span class="avg">${num(r.avg)}</span>
        </div>
      </div>`;
    })}
  </div>`;
}

function RankTable({ ranking }) {
  return html`<div class="table-wrap">
    <table class="board">
      <thead><tr><th>#</th><th>Team</th><th>Avg</th><th>Total</th><th>Stars</th></tr></thead>
      <tbody>
        ${ranking.map((r) => {
          const t = teamById(r.teamId);
          return html`<tr key=${r.teamId}>
            <td class="display" style="font-size:1.4rem">${r.place ?? '-'}</td>
            <td><span class="row"><${Avatar} member=${t?.members[0]} team=${t} size=${30} /><strong>${t?.name}</strong></span></td>
            <td class="display" style="font-size:1.3rem;color:var(--flame-1)">${r.count ? num(r.avg) : '-'}</td>
            <td class="hud-num">${r.count ? `${r.total}/${r.count * 10}` : 'no scores'}</td>
            <td class="hud-num">${r.count ? num(r.starsAvg, 1) : '-'}</td>
          </tr>`;
        })}
      </tbody>
    </table>
  </div>`;
}

function AwardCard({ award }) {
  const who = awardWho(award);
  return html`<div class="panel tight award">
    <span class="emoji" aria-hidden="true">${award.emoji}</span>
    <div style="min-width:0">
      <div class="award-title">${award.title}</div>
      <div style="font-weight:600">${who}</div>
      <div class="small muted">${award.detail}</div>
    </div>
  </div>`;
}

function Breakdown({ ranking }) {
  const a = useApp();
  const [open, setOpen] = useState(null);
  const cats = a.state.categories;
  return html`<div class="stack">
    ${ranking.filter((r) => r.count).map((r) => {
      const t = teamById(r.teamId);
      const isOpen = open === r.teamId;
      return html`<div class="panel tight" key=${r.teamId}>
        <button class="row between" style="width:100%;background:none;border:0;padding:0;cursor:pointer;text-align:left"
          aria-expanded=${isOpen} onClick=${() => setOpen(isOpen ? null : r.teamId)}>
          <span class="row"><${TeamDot} team=${t} /><strong>${t?.name}</strong><span class="small muted">night ${r.nightNumbers.join(', ')}</span></span>
          <span class="row"><span class="display" style="font-size:1.2rem">${num(r.avg)}</span><span aria-hidden="true">${isOpen ? '▴' : '▾'}</span></span>
        </button>
        ${isOpen && html`<div class="stack" style="margin-top:12px">
          ${r.cards.map((c) => {
            const from = teamById(c.fromTeamId);
            return html`<div key=${c.fromTeamId} style="padding:10px;border-radius:10px;background:var(--bg-3);border:2px solid var(--ink)">
              <div class="row between"><span class="row"><${TeamDot} team=${from} />${from?.name} gave</span><strong class="display" style="font-size:1.3rem">${c.overall}/10</strong></div>
              <div class="row wrap small" style="margin-top:6px;gap:10px">
                ${cats.map((cat) => html`<span key=${cat.id}>${cat.emoji} ${c.stars?.[cat.id] ?? '-'}★</span>`)}
              </div>
            </div>`;
          })}
          ${r.quotes?.length > 0 && html`<div class="stack">${r.quotes.map((q, i) => html`<p key=${i} class="small" style="font-style:italic">“${q}”</p>`)}</div>`}
        </div>`}
      </div>`;
    })}
  </div>`;
}

export function BoardView() {
  const a = useApp();
  const s = a.state;
  const r = s.results;
  const cats = s.categories;
  if (!r) {
    return html`<div class="page narrow stack-lg">
      <${PageTitle} kicker="Scores" title="Leaderboard" />
      <${Sealed} />
    </div>`;
  }
  const ranked = r.ranking.filter((x) => x.count > 0);
  const winner = r.partial ? null : teamById(ranked[0]?.teamId);
  return html`<div class="page stack-lg">
    <${PageTitle} kicker=${r.partial ? `After ${r.nightIds.length} of ${s.nights.length} nights` : 'Final results'} title="Leaderboard">
      ${r.partial ? 'Only revealed nights count so far. Everything else is still sealed.' : `Worked out from ${r.cardsCount} scorecards.`}
    <//>
    ${winner && html`<section class="panel tone-orange halftone has-flames center">
      <div class="kicker" style="color:#fff">Champions</div>
      <${FireText} tag="h2" text=${winner.name} tone="cream" style="font-size:clamp(2.4rem,11vw,4rem);margin:6px 0" />
      <div class="row" style="justify-content:center">${winner.portrait ? html`<${TeamPortrait} team=${winner} size=${260} />` : html`<${TeamBadge} team=${winner} size=${64} />`}</div>
      <p style="margin-top:10px;font-weight:600">${s.event.prize ? `Winners of ${s.event.prize.toLowerCase()}` : ''}</p>
      <div class="flames" aria-hidden="true"></div>
    </section>`}
    ${ranked.length >= 2 && html`<${Podium} ranking=${ranked} />`}
    <section class="stack">
      <${FireText} tag="h2" text="Standings" style="font-size:2rem" />
      <${RankTable} ranking=${r.ranking} />
    </section>
    ${r.awards.length > 0 && html`<section class="stack">
      <${FireText} tag="h2" text="Awards" style="font-size:2rem" />
      <div class="grid-2">${r.awards.map((w) => html`<${AwardCard} key=${w.id} award=${w} />`)}</div>
    </section>`}
    <section class="stack">
      <${FireText} tag="h2" text="Category kings" style="font-size:2rem" />
      <div class="panel">
        <div class="table-wrap">
          <table class="matrix">
            <thead><tr><th class="team-cell">Team</th>${cats.map((c) => html`<th key=${c.id} title=${c.label}>${c.emoji}</th>`)}</tr></thead>
            <tbody>${ranked.map((row) => html`<tr key=${row.teamId}>
              <td class="team-cell"><span class="row" style="gap:6px"><${TeamDot} team=${teamById(row.teamId)} />${teamById(row.teamId)?.name}</span></td>
              ${cats.map((c) => html`<td key=${c.id} class="hud-num">${num(row.catAvg[c.id], 1)}</td>`)}
            </tr>`)}</tbody>
          </table>
        </div>
        <p class="small muted" style="margin-top:8px">Average stars out of 5.</p>
      </div>
    </section>
    <section class="stack">
      <${FireText} tag="h2" text="Who gave what" style="font-size:2rem" />
      <${Breakdown} ranking=${r.ranking} />
    </section>
    <section class="stack">
      <${FireText} tag="h2" text="The critics" style="font-size:2rem" />
      <div class="grid-3">
        ${r.critics.filter((c) => c.count).sort((x, y) => x.avgGiven - y.avgGiven).map((c) => {
          const t = teamById(c.teamId);
          return html`<div class="panel tight" key=${c.teamId}>
            <div class="row"><${TeamDot} team=${t} /><strong>${t?.name}</strong></div>
            <div class="small muted" style="margin-top:4px">Handed out ${num(c.avgGiven)} / 10 on average</div>
            <${Stars} value=${(c.avgGiven / 10) * 5} size=${18} />
          </div>`;
        })}
      </div>
    </section>
    ${!r.partial && html`<div class="center"><a class="btn dark" href="#/reveal">Replay the Grand Reveal</a></div>`}
  </div>`;
}
