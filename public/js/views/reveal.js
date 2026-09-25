// The Grand Reveal. The organiser's device drives it (Next / Back); every
// other phone follows along live. Once finished anyone can replay it.
import { html, useEffect, useState, useCallback, useRef } from '../lib.js';
import { useApp, app, teamById, adminAction, emit, refresh } from '../store.js';
import { go } from '../router.js';
import { FireText, AvatarPair, TeamBadge, TeamPortrait, Avatar, Stars, TeamDot, Icon, useNow, awardWho } from '../components.js';
import { celebrate, confetti, sound, toast } from '../fx.js';
import { scoreLabel } from '../shared/core.js';
import { num, ordinal, plural } from '../util.js';

const CARD_START = 0.7;
const CARD_GAP = 1.0;

function Intro({ step }) {
  const a = useApp();
  useEffect(() => sound.play('pop'), []);
  return html`<div class="center stack-lg">
    <img src="/img/title-crop.jpg" alt="" style="width:min(70vw,340px);margin:0 auto;border-radius:16px;border:4px solid var(--ink);box-shadow:8px 9px 0 var(--ink)" />
    <${FireText} text="The results are in" class="reveal-big" />
    <p class="hud" style="font-size:clamp(1.2rem,4vw,1.8rem);color:var(--text)">
      ${plural(step.nights, 'dinner')} · ${plural(step.cards, 'scorecard')}
    </p>
    <p class="muted">${a.state.event.prize ? `Playing for: ${a.state.event.prize}` : ''}</p>
  </div>`;
}

function ScoreCards({ cards, fast = false }) {
  const a = useApp();
  const cats = a.state.categories;
  const gap = fast ? 0.25 : CARD_GAP;
  return html`<div class="reveal-cards">
    ${cards.map((c, i) => {
      const from = teamById(c.fromTeamId);
      return html`<div class="panel paper reveal-card center" key=${c.fromTeamId} style=${`animation-delay:${CARD_START + i * gap}s`}>
        <div class="row" style="justify-content:center;gap:8px"><${TeamDot} team=${from} /><strong>${from?.name}</strong></div>
        <div class="small muted" style="margin-bottom:6px">gave</div>
        <${FireText} text=${String(c.overall)} class="score" />
        <div class="hud" style="color:#b33a12">${scoreLabel(c.overall)}</div>
        <div style="display:grid;gap:2px;margin-top:8px">
          ${cats.map((cat) => html`<div class="row between small" key=${cat.id}><span>${cat.emoji}</span><${Stars} value=${c.stars?.[cat.id]} size=${16} /></div>`)}
        </div>
      </div>`;
    })}
  </div>`;
}

function Quotes({ quotes, delay }) {
  if (!quotes?.length) return null;
  return html`<div class="quotes">
    <div class="kicker center" style="opacity:0;animation:pop-in .4s ease forwards;animation-delay:${delay}s">Taxi confessionals</div>
    ${quotes.map((q, i) => html`<div class="quote" key=${i} style=${`animation-delay:${delay + 0.3 + i * 0.6}s`}>“${q}”</div>`)}
  </div>`;
}

function TeamStep({ step }) {
  const a = useApp();
  const team = teamById(step.teamId);
  const totalAt = CARD_START + step.cards.length * CARD_GAP + 0.3;
  useEffect(() => {
    const timers = step.cards.map((_, i) => setTimeout(() => sound.play('tick'), (CARD_START + i * CARD_GAP) * 1000));
    timers.push(setTimeout(() => sound.play('cash'), totalAt * 1000));
    if (step.last) timers.push(setTimeout(() => celebrate('wasted', { title: 'WASTED', sub: `${team?.name} finish last` }), (totalAt + 1.4) * 1000));
    return () => timers.forEach(clearTimeout);
  }, [step.teamId]);
  const nights = a.state.nights.filter((n) => step.nightIds.includes(n.id));
  return html`<div class="stack-lg">
    <div class="center stack">
      <${FireText} text=${`${ordinal(step.place)} place`} tone=${step.last ? 'blood' : ''} class="reveal-place" />
      <div class="row" style="justify-content:center">${team?.portrait ? html`<${TeamPortrait} team=${team} size=${280} />` : html`<${AvatarPair} team=${team} size=${84} />`}</div>
      <${FireText} text=${team?.name || ''} tone="cream" class="reveal-mid" />
      <p class="muted">Night ${step.nightNumbers.join(' & ')}${nights[0]?.theme ? ` · ${nights[0].theme}` : ''}</p>
    </div>
    <${ScoreCards} cards=${step.cards} />
    <div class="panel tone-purple halftone total-bar center" style=${`animation-delay:${totalAt}s`}>
      <div class="row wrap" style="justify-content:center;gap:28px">
        <div><div class="kicker" style="color:var(--flame-1)">Total</div><div class="display" style="font-size:2.4rem">${step.total}/${step.count * 10}</div></div>
        <div><div class="kicker" style="color:var(--flame-1)">Average</div><${FireText} text=${num(step.avg)} tone="money" style="font-size:2.8rem" /></div>
      </div>
    </div>
    <${Quotes} quotes=${step.quotes} delay=${totalAt + 0.8} />
  </div>`;
}

function Drumroll({ step }) {
  useEffect(() => sound.play('drum'), []);
  return html`<div class="center stack-lg">
    <div style="font-size:4rem" class="drumroll" aria-hidden="true">🥁</div>
    <${FireText} text="And the winner is" class="reveal-big drumroll" />
    ${step.tie && html`<p class="hud" style="font-size:1.4rem">It’s a tie</p>`}
  </div>`;
}

function Winner({ step }) {
  const a = useApp();
  useEffect(() => {
    const t = setTimeout(() => {
      sound.play('passed');
      confetti({ money: true, duration: 6500, count: 220 });
    }, 400);
    return () => clearTimeout(t);
  }, []);
  return html`<div class="stack-lg">
    <div class="center stack">
      <${FireText} text="mission passed!" class="reveal-big" />
      <${FireText} text="RESPECT +" tone="white" class="reveal-mid" />
    </div>
    ${step.winners.map((w) => {
      const team = teamById(w.teamId);
      return html`<div class="stack-lg" key=${w.teamId}>
        <div class="panel tone-orange halftone has-flames center stack">
          <span class="crown" style="font-size:3rem" aria-hidden="true">👑</span>
          <div class="row" style="justify-content:center">${team?.portrait
            ? html`<${TeamPortrait} team=${team} size=${340} />`
            : team?.members.map((m) => html`<${Avatar} key=${m.id} member=${m} team=${team} size=${110} />`)}</div>
          <${FireText} text=${team?.name || ''} tone="cream" class="reveal-mid" />
          <p class="hud" style="font-size:1.4rem">Average ${num(w.avg)} · ${w.total}/${w.count * 10}</p>
          ${a.state.event.prize && html`<p style="font-weight:700">Winners of ${a.state.event.prize.toLowerCase()}</p>`}
          <div class="flames" aria-hidden="true"></div>
        </div>
        <${ScoreCards} cards=${w.cards} fast />
        <${Quotes} quotes=${w.quotes} delay=${1.8} />
      </div>`;
    })}
  </div>`;
}

function Awards({ step }) {
  useEffect(() => sound.play('pop'), []);
  return html`<div class="stack-lg">
    <${FireText} text="The awards" class="reveal-big" />
    <div class="grid-2">
      ${step.awards.map((w, i) => {
        const who = awardWho(w);
        return html`<div class="panel award reveal-card" key=${w.id} style=${`animation-delay:${0.3 + i * 0.35}s`}>
          <span class="emoji" aria-hidden="true">${w.emoji}</span>
          <div><div class="award-title">${w.title}</div><div style="font-weight:600">${who}</div><div class="small muted">${w.detail}</div></div>
        </div>`;
      })}
    </div>
  </div>`;
}

function Final({ step }) {
  useEffect(() => sound.play('pop'), []);
  return html`<div class="stack-lg">
    <${FireText} text="Final standings" class="reveal-big" />
    <div class="stack">
      ${step.ranking.map((r, i) => {
        const t = teamById(r.teamId);
        return html`<div class="panel tight reveal-card" key=${r.teamId} style=${`animation-delay:${0.2 + i * 0.25}s;${r.place === 1 ? 'border-color:var(--flame-2)' : ''}`}>
          <div class="row">
            <${FireText} text=${r.place ? String(r.place) : '-'} style="font-size:2.4rem;width:48px;text-align:center" />
            <${TeamBadge} team=${t} size=${40} />
            <strong class="display" style="font-size:1.3rem;flex:1;min-width:0">${t?.name}</strong>
            <span class="display" style="font-size:1.5rem;color:var(--flame-1)">${r.count ? num(r.avg) : '-'}</span>
          </div>
        </div>`;
      })}
    </div>
    <div class="center"><a class="btn" href="#/board">Full leaderboard</a></div>
  </div>`;
}

function Step({ step }) {
  switch (step?.kind) {
    case 'intro':
      return html`<${Intro} step=${step} />`;
    case 'team':
      return html`<${TeamStep} step=${step} />`;
    case 'drumroll':
      return html`<${Drumroll} step=${step} />`;
    case 'winner':
      return html`<${Winner} step=${step} />`;
    case 'awards':
      return html`<${Awards} step=${step} />`;
    case 'final':
      return html`<${Final} step=${step} />`;
    default:
      return null;
  }
}

function Waiting({ presenter }) {
  const a = useApp();
  const s = a.state;
  const [busy, setBusy] = useState(false);
  const missing = s.nights.flatMap((n) => n.guests.filter((g) => !n.submitted.includes(g)).map((g) => `N${n.number}: ${teamById(g)?.name}`));
  const start = async () => {
    if (missing.length && !confirm(`${missing.length} scorecards are missing. Start anyway? Missing cards just won't count.`)) return;
    setBusy(true);
    try {
      sound.play('pop');
      await adminAction({ action: 'show', op: 'start' });
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };
  return html`<div class="center stack-lg">
    <img src="/img/poster.webp" alt="" style="width:min(62vw,300px);margin:0 auto;border:4px solid var(--ink);border-radius:12px;box-shadow:8px 9px 0 var(--ink);transform:rotate(-2deg)" />
    <${FireText} text="The Grand Reveal" class="reveal-big" />
    ${presenter
      ? html`<div class="panel stack" style="max-width:520px;margin:0 auto;text-align:left">
          <div class="panel-title">Ready when you are, organiser</div>
          <p>${s.counts.submitted} of ${s.counts.expected} scorecards are in.</p>
          ${missing.length > 0 && html`<p class="small muted">Missing: ${missing.join(', ')}</p>`}
          <p class="small muted">Starting locks every scorecard. Put this screen on the TV, then tap Next to reveal each team from last place to first. Everyone else can follow on their phones.</p>
          <button class="btn lg block" disabled=${busy} onClick=${start}>${busy ? 'Starting…' : 'Start the Grand Reveal'}</button>
        </div>`
      : html`<p class="lede" style="margin:0 auto">It hasn't started yet. Keep this page open and it will kick off by itself when the organiser hits go.</p>`}
  </div>`;
}

export function RevealView() {
  const a = useApp();
  const show = a.state.show;
  const presenter = Boolean(a.adminToken);
  const [replayIndex, setReplayIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  useNow(60000);

  // Poll quickly while this page is open so followers stay in sync.
  useEffect(() => {
    app.fastPoll = true;
    refresh();
    return () => {
      app.fastPoll = false;
    };
  }, []);

  const live = show.status === 'live';
  const done = show.status === 'done';
  const steps = show.steps || [];
  const index = done ? Math.min(replayIndex, steps.length - 1) : steps.length - 1;
  const step = steps[index];

  // When the live show finishes, stay on the last screen instead of jumping back.
  const prevStatus = useRef(show.status);
  useEffect(() => {
    if (prevStatus.current === 'live' && show.status === 'done') setReplayIndex(steps.length - 1);
    prevStatus.current = show.status;
  }, [show.status]);

  const move = useCallback(
    async (op) => {
      if (done) {
        setReplayIndex((i) => Math.max(0, Math.min(steps.length - 1, i + (op === 'next' ? 1 : -1))));
        return;
      }
      if (!presenter || !live || busy) return;
      setBusy(true);
      try {
        await adminAction({ action: 'show', op });
      } catch (err) {
        toast(err.message, 'error');
      } finally {
        setBusy(false);
      }
    },
    [done, presenter, live, busy, steps.length],
  );

  useEffect(() => {
    const onKey = (e) => {
      if ([' ', 'Enter'].includes(e.key) && e.target.closest?.('button, a, input, textarea, select')) return;
      if (['ArrowRight', 'PageDown', ' ', 'Enter'].includes(e.key)) {
        e.preventDefault();
        move('next');
      } else if (['ArrowLeft', 'PageUp'].includes(e.key)) {
        e.preventDefault();
        move('prev');
      } else if (e.key === 'Escape') {
        go('');
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [move]);

  const stageRef = useRef(null);
  useEffect(() => {
    stageRef.current?.scrollTo({ top: 0 });
  }, [index, step?.kind]);

  const canDrive = done || (presenter && live);
  const total = done ? steps.length : show.total || steps.length;

  return html`<div class="reveal">
    <div class="reveal-top">
      <img class="brand-mark" src="/icons/favicon-64.png" alt="" style="width:34px;height:34px" />
      <strong class="display" style="font-size:1.1rem">Grand Reveal</strong>
      ${live && html`<span class="pill live">Live</span>`}
      ${done && html`<span class="pill cool">Replay</span>`}
      <span class="spacer"></span>
      ${step && html`<span class="hud small nowrap">${index + 1} / ${total}</span>`}
      <button class="btn sm ghost hide-sm" aria-label="Fullscreen" onClick=${() => document.fullscreenElement ? document.exitFullscreen?.() : document.documentElement.requestFullscreen?.().catch(() => {})}><${Icon} name="reveal" size="18" /></button>
      <button class="btn sm ghost" aria-label="Sound" onClick=${() => { sound.muted = !sound.muted; emit(); }}><${Icon} name=${sound.muted ? 'mute' : 'sound'} size="18" /></button>
      <a class="btn sm ghost" href="#/" aria-label="Close"><${Icon} name="close" size="18" /></a>
    </div>
    <div class="reveal-stage" ref=${stageRef}>
      <div class="inner">
        ${step ? html`<div key=${`${index}-${step.kind}-${step.teamId || ''}`}><${Step} step=${step} /></div>` : html`<${Waiting} presenter=${presenter} />`}
      </div>
    </div>
    ${step && html`<div class="reveal-controls">
      ${canDrive
        ? html`<button class="btn dark" disabled=${index === 0 || busy} onClick=${() => move('prev')}><${Icon} name="back" size="20" />Back</button>
            <button class="btn" disabled=${index >= total - 1 || busy} onClick=${() => move('next')}>Next<${Icon} name="next" size="20" /></button>`
        : html`<span class="small muted">Following the organiser’s screen</span>`}
    </div>`}
  </div>`;
}
