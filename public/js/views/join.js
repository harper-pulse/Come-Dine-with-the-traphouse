// Personal team links land here: #/join/ABC123
import { html, useEffect, useState } from '../lib.js';
import { useApp, app, loginTeam, teamById, hostNightOf, tz } from '../store.js';
import { FireText, TeamBadge, TeamPortrait } from '../components.js';
import { sound, confetti } from '../fx.js';
import { fmtDayLong } from '../util.js';

export function JoinView({ code }) {
  const a = useApp();
  const [status, setStatus] = useState('checking');
  const [error, setError] = useState('');
  const [teamId, setTeamId] = useState(null);

  useEffect(() => {
    let cancelled = false;
    if (!code) {
      setTeamId(app.team?.teamId || null);
      setStatus(app.team ? 'ok' : 'error');
      setError('That invite link is missing its code.');
      return;
    }
    (async () => {
      try {
        const r = await loginTeam(code);
        if (cancelled) return;
        setTeamId(r.teamId);
        setStatus('ok');
        history.replaceState(null, '', '#/join');
        confetti({ count: 120, duration: 3000 });
      } catch (err) {
        if (cancelled) return;
        setError(err.message);
        setStatus('error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [code]);

  if (status === 'checking') {
    return html`<div class="page narrow"><div class="panel center" style="margin-top:30px"><p class="hud">Checking your invite…</p></div></div>`;
  }
  if (status === 'error') {
    return html`<div class="page narrow stack-lg" style="padding-top:20px">
      <div class="panel center stack">
        <${FireText} text="busted" style="font-size:3rem" />
        <p>${error}</p>
        <a class="btn" href="#/me">Enter the code by hand</a>
      </div>
    </div>`;
  }
  const team = teamById(teamId) || a.team?.team;
  const hosting = hostNightOf(teamId);
  return html`<div class="page narrow stack-lg" style="padding-top:20px">
    <section class="panel tone-orange halftone has-flames center stack">
      <div class="kicker" style="color:#fff">Welcome to the traphouse</div>
      <div class="row" style="justify-content:center">${team?.portrait ? html`<${TeamPortrait} team=${team} size=${240} />` : html`<${TeamBadge} team=${team} size=${86} />`}</div>
      <${FireText} tag="h1" text=${team?.name || 'You are in'} tone="cream" style="font-size:clamp(2.4rem,11vw,3.6rem)" />
      <p style="font-weight:600">This phone is now logged in for your team.</p>
      ${hosting && html`<p>You host <strong>Night ${hosting.number}</strong>${hosting.startsAt ? ` on ${fmtDayLong(hosting.startsAt, tz())}` : ''}.</p>`}
      <div class="flames" aria-hidden="true"></div>
    </section>
    <div class="stack">
      <a class="btn block lg" href="#/me" onClick=${() => sound.play('pop')}>Set up your team & menu</a>
      <a class="btn block dark" href="#/">Go to the portal</a>
    </div>
    <p class="small muted center">Tip: add this page to your home screen so it's one tap away on dinner nights.</p>
  </div>`;
}
