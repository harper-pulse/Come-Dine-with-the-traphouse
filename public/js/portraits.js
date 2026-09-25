// GTA portraits: upload a photo, Nano Banana (Google's image AI, the one the
// poster was made with) redraws it in the poster's style, preview it, keep
// it. A finished portrait made elsewhere (e.g. the Gemini app) can be used as is.
import { html, useState, useEffect, useRef } from './lib.js';
import { app, syncTo, loadTeam, loadAdmin, emit } from './store.js';
import { FireText, Sheet, Icon, Avatar } from './components.js';
import { celebrate, toast, sound } from './fx.js';
import { portraitUpload } from './imaging.js';
import { compressImage } from './util.js';

const TIPS = [
  'Tip: you can’t score your own dinner.',
  'Tip: tactical scoring gets noticed.',
  'Tip: scorecards lock at midday the day after each dinner.',
  'Tip: taxi confessionals are anonymous.',
  'Tip: a clear, well-lit photo of your face works best.',
  'Tip: hosts can keep the menu secret until the night.',
];

function authFor(teamId) {
  return teamId ? app.adminToken : app.teamToken;
}

async function avatarFetch(method, params, { teamId, body } = {}) {
  const query = new URLSearchParams({ ...params, ...(teamId ? { teamId } : {}) });
  let res;
  try {
    res = await fetch(`/api/avatar?${query}`, {
      method,
      headers: {
        authorization: `Bearer ${authFor(teamId)}`,
        // FormData sets its own content type (with the multipart boundary).
        ...(body && !(body instanceof FormData) ? { 'content-type': body.type || 'image/jpeg' } : {}),
      },
      body,
    });
  } catch {
    throw new Error('No connection. Check your signal and try again.');
  }
  if (!res.ok) {
    let data = {};
    try {
      data = await res.json();
    } catch {}
    throw Object.assign(new Error(data.message || `Something went wrong (${res.status}).`), { code: data.error, status: res.status });
  }
  return res;
}

async function refreshAfter(v, teamId) {
  if (v) await syncTo(v);
  if (teamId) await loadAdmin();
  else await loadTeam();
  emit();
}

function LoadingScreen({ tipIndex, progress }) {
  return html`<div class="gta-loading" role="status" aria-live="polite">
    <img src="/img/poster.webp" alt="" />
    <div class="gta-loading-bottom">
      <div class="gta-tip">${TIPS[tipIndex % TIPS.length]}</div>
      <div class="gta-bar"><i style=${`width:${progress}%`}></i></div>
      <${FireText} text="loading..." class="gta-loading-word" />
    </div>
  </div>`;
}

// The sheet that turns one photo into a portrait.
function Studio({ open, onClose, target, label, kind, teamId, ai, photo }) {
  const [step, setStep] = useState('choose');
  const [result, setResult] = useState(null); // { blob, url, method: 'ai' | 'upload' }
  const [error, setError] = useState('');
  const [left, setLeft] = useState(ai?.left ?? null);
  const [tip, setTip] = useState(0);
  const [progress, setProgress] = useState(0);
  const [photoUrl, setPhotoUrl] = useState('');

  useEffect(() => {
    if (!open || !photo) return;
    setStep('choose');
    setResult(null);
    setError('');
    setLeft(ai?.left ?? null);
    const url = URL.createObjectURL(photo);
    setPhotoUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [open, photo]);

  useEffect(() => {
    if (step !== 'working') return;
    setProgress(4);
    const started = Date.now();
    const t = setInterval(() => {
      const s = (Date.now() - started) / 1000;
      setProgress(Math.min(96, 100 * (1 - Math.exp(-s / 20))));
      if (Math.round(s) % 5 === 0) setTip((i) => i + 1);
    }, 1000);
    return () => clearInterval(t);
  }, [step]);

  const aiOn = ai?.mode === 'on' || ai?.mode === 'mock';
  const noGoes = !teamId && left != null && left <= 0;

  const useAi = async () => {
    setError('');
    setStep('working');
    try {
      const small = await compressImage(photo, 1280, 0.88);
      const res = await avatarFetch('POST', { action: 'generate', target }, { teamId, body: small.blob });
      const blob = await res.blob();
      const goes = res.headers.get('x-ai-goes-left');
      if (goes != null) setLeft(Number(goes));
      setResult({ blob, url: URL.createObjectURL(blob), method: 'ai' });
      setStep('result');
      sound.play('cash');
    } catch (err) {
      setError(err.message);
      setStep('choose');
    }
  };

  // For portraits already made elsewhere, like the Gemini app.
  const useAsIs = () => {
    setError('');
    setResult({ blob: photo, url: photoUrl, method: 'upload' });
    setStep('result');
  };

  const keep = async () => {
    setStep('saving');
    try {
      const upload = await portraitUpload(result.blob);
      const res = await avatarFetch('POST', { action: 'save', target }, { teamId, body: upload });
      const { v } = await res.json();
      await refreshAfter(v, teamId);
      onClose();
      celebrate('passed', { title: 'new look unlocked', sub: 'RESPECT +' });
    } catch (err) {
      setError(err.message);
      setStep('result');
    }
  };

  return html`<${Sheet} open=${open} onClose=${step === 'working' || step === 'saving' ? () => {} : onClose} label=${`Portrait for ${label}`}>
    <div class="stack">
      <div class="row between">
        <div>
          <div class="kicker">GTA portrait</div>
          <div class="panel-title" style="margin:0">${label}</div>
        </div>
        ${step !== 'working' && step !== 'saving' && html`<button class="btn sm ghost" aria-label="Close" onClick=${onClose}><${Icon} name="close" /></button>`}
      </div>

      ${step === 'working' && html`<${LoadingScreen} tipIndex=${tip} progress=${progress} />
        <p class="small muted center">Nano Banana is drawing ${kind === 'duo' ? 'you both' : label}. Usually 20 to 60 seconds.</p>`}

      ${step === 'choose' && html`
        <div class="studio-compare">
          <figure class="studio-frame"><img src=${photoUrl} alt="Your photo" /><figcaption>Your photo</figcaption></figure>
        </div>
        ${error && html`<p class="error-text" role="alert">${error}</p>`}
        ${aiOn
          ? html`<button class="btn lg block" disabled=${noGoes} onClick=${useAi}>
              Make ${kind === 'duo' ? 'us' : 'me'} GTA
            </button>
            <p class="hint center">${teamId
              ? 'Nano Banana redraws the photo in the poster’s style. Organiser goes are unlimited.'
              : noGoes
                ? 'Your team has used all its AI goes. Ask the organiser for more.'
                : `Nano Banana redraws the photo in the poster’s style. ${left} AI ${left === 1 ? 'go' : 'goes'} left for your team.`}</p>`
          : html`<p class="hint">AI portraits aren’t switched on for this portal yet. If this is already a finished portrait (say, one made in the Gemini app), you can use it as is.</p>`}
        ${aiOn && html`<p class="hint center" style="margin-bottom:-6px">If you made it yourself, say in the Gemini app, you can use it as is.</p>`}
        <button class=${`btn block ${aiOn ? 'dark' : 'lg'}`} onClick=${useAsIs}>Use as is</button>`}

      ${(step === 'result' || step === 'saving') && result && html`
        <div class="studio-result">
          <figure class="team-portrait tilt" style="--w:320px"><img src=${result.url} alt="Your GTA portrait" /></figure>
        </div>
        ${error && html`<p class="error-text" role="alert">${error}</p>`}
        <button class="btn lg block" disabled=${step === 'saving'} onClick=${keep}>${step === 'saving' ? 'Saving…' : 'Keep it'}</button>
        <div class="row wrap" style="justify-content:center">
          ${aiOn && html`<button class="btn sm dark" disabled=${step === 'saving' || noGoes} onClick=${useAi}>${result.method === 'ai' ? 'Redraw (uses a go)' : 'Make it GTA instead'}</button>`}
          <button class="btn sm ghost" disabled=${step === 'saving'} onClick=${onClose}>Cancel</button>
        </div>`}
    </div>
  <//>`;
}

function Slot({ label, sub, target, current, kind, teamId, ai, team, member }) {
  const [photo, setPhoto] = useState(null);
  const [open, setOpen] = useState(false);
  const inputRef = useRef();
  const pick = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setPhoto(file);
    setOpen(true);
  };
  const remove = async () => {
    if (!confirm(`Remove the GTA portrait for ${label}?`)) return;
    try {
      const res = await avatarFetch('DELETE', { target }, { teamId });
      const { v } = await res.json();
      await refreshAfter(v, teamId);
      toast('Portrait removed.', 'ok');
    } catch (err) {
      toast(err.message, 'error');
    }
  };
  return html`<div class="portrait-slot">
    <div class=${`slot-frame ${current ? 'has' : ''}`} style=${`--team:${team?.color}`}>
      ${current
        ? html`<img src=${current} alt=${`${label} portrait`} />`
        : member
          ? html`<div class="slot-empty"><${Avatar} member=${member} team=${team} size=${86} /><span>No portrait yet</span></div>`
          : html`<div class="slot-empty"><span class="big" aria-hidden="true">📸</span><span>No team portrait yet</span></div>`}
    </div>
    <div class="slot-label"><strong>${label}</strong><span class="small muted">${sub}</span></div>
    <label class="btn sm block" style="cursor:pointer">
      <${Icon} name="photo" />${current ? 'New photo' : 'Upload photo'}
      <input ref=${inputRef} type="file" accept="image/*" class="sr-only" onChange=${pick} />
    </label>
    ${current && html`<button class="link-btn small" onClick=${remove}>Remove</button>`}
    <${Studio} open=${open} onClose=${() => setOpen(false)} target=${target} label=${label} kind=${kind} teamId=${teamId} ai=${ai} photo=${photo} />
  </div>`;
}

// The portraits section used on "My team" and in the organiser's team editor.
// Pass teamId only when the organiser is acting for a team.
export function PortraitsSection({ team, ai, teamId }) {
  if (!team) return null;
  const aiOn = ai?.mode === 'on' || ai?.mode === 'mock';
  return html`<section class="panel stack">
    <div>
      <div class="panel-title" style="margin-bottom:4px">GTA portraits</div>
      <p class="small muted">
        ${aiOn
          ? 'Upload a photo and Nano Banana (Google’s image AI, the one the poster was made with) redraws it in the poster’s GTA style. Do one of you both for the team, and one each for your player icons.'
          : 'Upload a finished GTA-style portrait (for example one made in the Gemini app): one of you both for the team, and one each for your player icons.'}${' '}
        ${aiOn ? 'If you already made one yourself in Gemini, upload it and pick “Use as is”. ' : ''}Original photos are never stored.
      </p>
    </div>
    <div class="portrait-grid">
      <${Slot} label=${team.name} sub="Photo of you both" target="team" current=${team.portrait} kind="duo" teamId=${teamId} ai=${ai} team=${team} />
      ${team.members.map((m) => html`<${Slot} key=${m.id} label=${m.name} sub="Solo photo" target=${m.id}
        current=${m.avatar === 'custom' ? m.avatarUrl : ''} kind="solo" teamId=${teamId} ai=${ai} team=${team} member=${m} />`)}
    </div>
  </section>`;
}
