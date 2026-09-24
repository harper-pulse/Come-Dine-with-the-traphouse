import { html } from '../lib.js';
import { useApp } from '../store.js';
import { FireText, PageTitle, Stars } from '../components.js';
import { SCORE_LABELS, MAX_STARS } from '../shared/core.js';

export function RulesView() {
  const a = useApp();
  const s = a.state;
  return html`<div class="page narrow stack-lg">
    <${PageTitle} kicker="Read before you cook" title="House rules" />
    <section class="panel paper">
      <ol style="margin:0;padding-left:1.3em;display:grid;gap:10px;font-size:1.02rem">
        ${(s.event.rules || []).map((r, i) => html`<li key=${i}>${r}</li>`)}
      </ol>
    </section>

    <section class="stack">
      <${FireText} tag="h2" text="How scoring works" style="font-size:2rem" />
      <div class="panel stack">
        <p><strong>Overall score out of 10.</strong> This is the one that decides the winner. Highest average across your guests' scorecards takes it.</p>
        <p><strong>Wanted level stars.</strong> Guests also rate each of these from 1 to ${MAX_STARS} stars. Stars break ties and decide the awards.</p>
        <div class="stack" style="--gap:6px">
          ${s.categories.map((c) => html`<div class="row between" key=${c.id}>
            <span class="row"><span style="font-size:1.4rem" aria-hidden="true">${c.emoji}</span><strong>${c.label}</strong></span>
            <${Stars} value=${MAX_STARS} size=${20} />
          </div>`)}
        </div>
        <p><strong>Taxi confessionals.</strong> An optional, anonymous comment on each scorecard. Read out at the Grand Reveal.</p>
      </div>
    </section>

    <section class="stack">
      <${FireText} tag="h2" text="The scale" style="font-size:2rem" />
      <div class="panel">
        <div class="table-wrap">
          <table class="board">
            <tbody>
              ${Object.entries(SCORE_LABELS).reverse().map(([n, label]) => html`<tr key=${n}>
                <td class="display" style="font-size:1.4rem;width:60px;text-align:center">${n}</td>
                <td class="hud" style="font-size:1.1rem">${label}</td>
              </tr>`)}
            </tbody>
          </table>
        </div>
      </div>
    </section>

    <section class="panel tone-purple halftone">
      <div class="panel-title">The prize</div>
      <p>${s.event.prize || 'Eternal bragging rights.'}</p>
    </section>
  </div>`;
}
