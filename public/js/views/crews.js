import { html, useEffect } from '../lib.js';
import { useApp, hostNightOf, tz, myTeamId } from '../store.js';
import { FireText, PageTitle, Avatar } from '../components.js';
import { fmtDay, num, ordinal } from '../util.js';

function CrewCard({ team, highlight }) {
  const a = useApp();
  const zone = tz();
  const hosting = hostNightOf(team.id);
  const results = a.state.results;
  const row = results?.ranking.find((x) => x.teamId === team.id);
  const critic = results?.critics.find((c) => c.teamId === team.id);
  const awards = (results?.awards || []).filter((w) => w.teamIds?.includes(team.id));
  const mine = myTeamId() === team.id;
  return html`<article id=${`crew-${team.id}`} class="panel" style=${`border-top:10px solid ${team.color};${highlight ? 'outline:3px solid var(--flame-1);outline-offset:3px;' : ''}`}>
    <div class="row between wrap">
      <span class="kicker">${hosting ? `Hosts night ${hosting.number}${hosting.startsAt ? ` · ${fmtDay(hosting.startsAt, zone)}` : ''}` : 'Guests only'}</span>
      ${mine && html`<span class="pill hot">Your team</span>`}
    </div>
    <${FireText} tag="h2" text=${team.name} style="font-size:2rem;margin:8px 0 12px" />
    <div class="row wrap" style="gap:16px">
      ${team.members.map((m) => html`<div class="row" key=${m.id} style="gap:10px">
        <${Avatar} member=${m} team=${team} size=${72} />
        <strong style="font-size:1.05rem">${m.name}</strong>
      </div>`)}
    </div>
    ${team.motto && html`<p style="margin-top:12px;font-style:italic">"${team.motto}"</p>`}
    ${row?.count > 0 &&
    html`<hr class="divider" />
      <dl class="kv">
        ${row.place && html`<dt>Place</dt><dd><strong>${ordinal(row.place)}</strong></dd>`}
        <dt>Scored</dt><dd>${num(row.avg)} / 10 average (${row.total} total)</dd>
        ${critic?.count > 0 && html`<dt>Gave out</dt><dd>${num(critic.avgGiven)} / 10 average</dd>`}
      </dl>`}
    ${awards.length > 0 && html`<div class="row wrap" style="margin-top:10px">${awards.map((w) => html`<span class="pill paper" key=${w.id}>${w.emoji} ${w.title}</span>`)}</div>`}
    ${mine && html`<div style="margin-top:14px"><a class="btn sm dark" href="#/me">Edit team, characters & dietary</a></div>`}
  </article>`;
}

export function CrewsView({ id }) {
  const a = useApp();
  useEffect(() => {
    if (id) setTimeout(() => document.getElementById(`crew-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 60);
  }, [id]);
  return html`<div class="page stack-lg">
    <${PageTitle} kicker="Character select" title="The crews">
      ${a.state.teams.length} teams of two. One kitchen each. No mercy.
    <//>
    <div class="grid-2">
      ${a.state.teams.map((t) => html`<${CrewCard} key=${t.id} team=${t} highlight=${id === t.id} />`)}
    </div>
  </div>`;
}
