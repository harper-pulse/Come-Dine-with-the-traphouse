import { html, useState, useEffect } from '../lib.js';
import { useApp, teamById, nightById, tz, myTeamId, myCard, teamAction } from '../store.js';
import { go } from '../router.js';
import { FireText, PageTitle, TeamLogin, Stars, Sheet, Countdown, TeamBadge, NightPill, useNow } from '../components.js';
import { celebrate, sound, toast } from '../fx.js';
import { nightStatus, scoreLabel, COMMENT_MAX } from '../shared/core.js';
import { fmtDay, fmtTime, memberNames } from '../util.js';
import { NotFound } from './misc.js';

function ScoreList() {
  const a = useApp();
  const now = useNow(30000);
  const zone = tz();
  const mine = myTeamId();
  const team = teamById(mine);
  const nights = a.state.nights;
  return html`<div class="page narrow stack-lg">
    <${PageTitle} kicker=${team?.name} title="Your scorecards">
      One scorecard per night, filled in together at the end of the dinner. Sealed until the Grand Reveal.
    <//>
    <div class="stack">
      ${nights.map((n) => {
        const host = teamById(n.hostTeamId);
        if (n.hostTeamId === mine) {
          return html`<div class="panel tight" key=${n.id} style="opacity:.85">
            <div class="row between">
              <span class="row"><span class="night-num">N${n.number}</span><strong>You host this one</strong></span>
              <span class="pill hot">Host</span>
            </div>
            <p class="small muted" style="margin-top:6px">No scoring your own dinner. Make it a banger.</p>
          </div>`;
        }
        const status = nightStatus(n, now);
        const card = myCard(n.id);
        let action;
        if (status === 'open') {
          action = html`<a class=${`btn ${card ? 'sm paper' : ''}`} href=${`#/score/${n.id}`}>${card ? 'Edit' : 'Score now'}</a>`;
        } else if (card) {
          action = html`<a class="btn sm dark" href=${`#/score/${n.id}`}>View</a>`;
        } else if (status === 'closed') {
          action = html`<span class="pill lock">Missed</span>`;
        } else {
          action = html`<span class="pill">Opens ${n.startsAt ? fmtDay(n.startsAt, zone) : 'TBC'}</span>`;
        }
        return html`<div class="panel tight" key=${n.id} style=${`border-left:8px solid ${host?.color}`}>
          <div class="row between">
            <div style="min-width:0">
              <div class="row"><span class="night-num">N${n.number}</span><${NightPill} night=${n} now=${now} /></div>
              <div class="display" style="font-size:1.25rem;margin-top:6px">${host?.name}</div>
              <div class="small muted">${card ? `You gave ${card.overall}/10` : memberNames(host)}</div>
            </div>
            ${action}
          </div>
        </div>`;
      })}
    </div>
  </div>`;
}

function ReadOnlyCard({ card, cats, locked }) {
  return html`<div class="panel paper scorecard stack">
    <div class="row between">
      <span class="kicker" style="color:#b33a12">Your scorecard</span>
      <span class=${`stamp ${locked ? 'red' : ''}`}>${locked ? 'LOCKED' : 'HANDED IN'}</span>
    </div>
    <div class="big-score"><${FireText} text=${String(card.overall)} /><span class="of">/10</span></div>
    <div class="score-label">${scoreLabel(card.overall)}</div>
    <div>
      ${cats.map((c) => html`<div class="cat-row" key=${c.id}>
        <span class="cat-name"><span class="emoji">${c.emoji}</span>${c.label}</span>
        <${Stars} value=${card.stars?.[c.id]} size=${26} />
      </div>`)}
    </div>
    ${card.comment && html`<div><span class="label">Taxi confessional</span><p style="font-style:italic">"${card.comment}"</p></div>`}
  </div>`;
}

function Scorecard({ nightId }) {
  const a = useApp();
  const now = useNow(15000);
  const zone = tz();
  const night = nightById(nightId);
  const existing = myCard(nightId);
  const [overall, setOverall] = useState(existing?.overall ?? null);
  const [stars, setStars] = useState(existing?.stars || {});
  const [comment, setComment] = useState(existing?.comment || '');
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Team data can arrive after the page opens: fill the form once it does.
  useEffect(() => {
    if (existing && overall == null) {
      setOverall(existing.overall);
      setStars(existing.stars || {});
      setComment(existing.comment || '');
    }
  }, [existing?.updatedAt]);

  if (!night) return html`<${NotFound} />`;
  const host = teamById(night.hostTeamId);
  const mine = myTeamId();
  const cats = a.state.categories;
  const status = nightStatus(night, now);
  const frozen = a.state.show.status !== 'idle' || night.revealed;

  const header = html`
    <a class="link-btn" href="#/score">← Your scorecards</a>
    <header class="stack" style="--gap:6px">
      <div class="kicker">Night ${night.number} scorecard</div>
      <div class="row">
        <${TeamBadge} team=${host} size=${50} />
        <${FireText} tag="h1" text=${host?.name || ''} style="font-size:clamp(2rem,9vw,2.8rem)" />
      </div>
      ${night.theme && html`<p class="muted">Theme: ${night.theme}</p>`}
    </header>`;

  if (night.hostTeamId === mine) {
    return html`<div class="page narrow stack-lg">${header}
      <div class="panel center stack">
        <${FireText} text="busted" style="font-size:3rem" />
        <p>This is your own dinner. You can't score it. Nice try though.</p>
      </div>
    </div>`;
  }

  if (status === 'upcoming') {
    return html`<div class="page narrow stack-lg">${header}
      <div class="panel tone-blue halftone stack center">
        <div class="panel-title">Scoring opens when the dinner starts</div>
        <p>${night.startsAt ? `${fmtDay(night.startsAt, zone)} at ${fmtTime(night.startsAt, zone)}` : 'Date to be confirmed.'}</p>
        ${night.startsAt && html`<${Countdown} to=${night.startsAt} />`}
      </div>
    </div>`;
  }

  if (status === 'closed' || frozen) {
    return html`<div class="page narrow stack-lg">${header}
      ${existing
        ? html`<${ReadOnlyCard} card=${existing} cats=${cats} locked=${true} />`
        : html`<div class="panel center stack"><div class="panel-title">Scorecards are locked</div><p class="muted">Your team didn't hand one in for this night.</p></div>`}
    </div>`;
  }

  const complete = overall != null && cats.every((c) => stars[c.id]);
  const missing = cats.filter((c) => !stars[c.id]).map((c) => c.label);

  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      const r = await teamAction({ action: 'score', nightId, overall, stars, comment });
      setConfirm(false);
      if (overall <= 2) {
        celebrate('wasted', { title: 'WASTED', sub: `${host?.name} just got a ${overall}` });
      } else {
        celebrate('passed', { title: r.updated ? 'scorecard updated' : 'mission passed!', sub: 'RESPECT +' });
      }
      go('score');
    } catch (err) {
      setError(err.message);
      setConfirm(false);
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const pick = (n) => {
    setOverall(n);
    sound.play(n >= 8 ? 'cash' : 'tick');
  };

  return html`<div class="page narrow stack-lg">
    ${header}
    <form class="panel paper scorecard stack" onSubmit=${(e) => {
      e.preventDefault();
      if (complete) setConfirm(true);
    }}>
      <div class="center">
        <div class="kicker" style="color:#b33a12">Overall score</div>
        <div class="big-score" key=${overall}>
          <${FireText} text=${overall == null ? '?' : String(overall)} class=${overall == null ? '' : 'pop'} />
          <span class="of">/10</span>
        </div>
        <div class="score-label" aria-live="polite">${overall == null ? 'Tap a number' : scoreLabel(overall)}</div>
      </div>
      <div class="score-grid" role="radiogroup" aria-label="Overall score out of 10">
        ${[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => html`<button type="button" key=${n} role="radio"
          aria-checked=${overall === n} aria-pressed=${overall === n} onClick=${() => pick(n)}>${n}</button>`)}
      </div>
      <div class="center">
        <button type="button" class="link-btn" style="color:#8a1d12" aria-pressed=${overall === 0} onClick=${() => pick(0)}>
          ${overall === 0 ? 'Zero selected' : 'Give them a zero'}
        </button>
      </div>

      <div>
        <div class="kicker" style="color:#b33a12;margin-bottom:4px">Wanted level</div>
        ${cats.map((c) => html`<div class="cat-row" key=${c.id}>
          <span class="cat-name"><span class="emoji" aria-hidden="true">${c.emoji}</span>${c.label}</span>
          <${Stars} value=${stars[c.id] || 0} label=${`${c.label} rating`} onChange=${(v) => setStars({ ...stars, [c.id]: v })} />
        </div>`)}
      </div>

      <label class="field">
        <span class="label">Taxi confessional (optional)</span>
        <textarea class="textarea" maxlength=${COMMENT_MAX} value=${comment} onInput=${(e) => setComment(e.target.value)}
          placeholder="Say what you really think. It's anonymous."></textarea>
        <span class="hint">Anonymous. Read out at the Grand Reveal. ${comment.length}/${COMMENT_MAX}</span>
      </label>

      ${error && html`<p class="error-text" role="alert">${error}</p>`}
      <button class="btn lg block" type="submit" disabled=${!complete || busy}>
        ${existing ? 'Update scorecard' : 'Lock it in'}
      </button>
      <p class="hint center">
        ${!complete
          ? overall == null
            ? 'Pick an overall score, then rate every category.'
            : `Still to rate: ${missing.join(', ')}.`
          : `You can change it until ${night.locksAt ? `${fmtDay(night.locksAt, zone)}, ${fmtTime(night.locksAt, zone)}` : 'the organiser locks it'}.`}
      </p>
    </form>

    <${Sheet} open=${confirm} onClose=${() => setConfirm(false)} paper label="Confirm scorecard">
      <div class="stack center">
        <div class="kicker" style="color:#b33a12">Hand it in?</div>
        <div class="display" style="font-size:1.5rem">${host?.name}</div>
        <div class="big-score"><${FireText} text=${String(overall)} /><span class="of">/10</span></div>
        <div class="score-label">${scoreLabel(overall ?? 0)}</div>
        <div class="row wrap" style="justify-content:center;gap:6px">
          ${cats.map((c) => html`<span class="pill paper" key=${c.id}>${c.emoji} ${stars[c.id]}★</span>`)}
        </div>
        <p class="small muted">Sealed until the Grand Reveal. Your hosts will never see it before then.</p>
        <button class="btn lg block" type="button" disabled=${busy} onClick=${submit}>${busy ? 'Sending…' : 'Yes, lock it in'}</button>
        <button class="btn ghost block" type="button" style="color:var(--paper-ink)" onClick=${() => setConfirm(false)}>Go back</button>
      </div>
    <//>
  </div>`;
}

export function ScoreView({ nightId }) {
  const a = useApp();
  if (!a.team) {
    return html`<div class="page narrow stack-lg">
      <${PageTitle} kicker="Scorecards" title="Score a dinner">Log in with your team code first. It's in the message from your organiser.<//>
      <div class="panel paper"><${TeamLogin} compact /></div>
    </div>`;
  }
  return nightId ? html`<${Scorecard} nightId=${nightId} />` : html`<${ScoreList} />`;
}
