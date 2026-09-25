import { html, useState, useEffect } from '../lib.js';
import { useApp, app, teamById, syncTo, myTeamId } from '../store.js';
import { request } from '../api.js';
import { FireText, PageTitle, Empty, TeamLogin, Icon, useScrollLock } from '../components.js';
import { toast, sound } from '../fx.js';
import { currentNight } from '../shared/core.js';
import { compressPhoto } from '../util.js';

function Uploader({ defaultNight }) {
  const a = useApp();
  const [nightId, setNightId] = useState(defaultNight);
  const [caption, setCaption] = useState('');
  const [busy, setBusy] = useState('');
  useEffect(() => setNightId(defaultNight), [defaultNight]);

  const upload = async (e) => {
    const files = [...(e.target.files || [])];
    e.target.value = '';
    if (!files.length) return;
    const token = app.teamToken || app.adminToken;
    let done = 0;
    for (const file of files) {
      setBusy(`Uploading ${done + 1} of ${files.length}…`);
      try {
        const { blob, thumb, w, h } = await compressPhoto(file);
        const params = new URLSearchParams({ nightId, caption, w, h });
        const form = new FormData();
        form.append('image', blob, 'photo.jpg');
        form.append('thumb', thumb, 'photo-thumb.jpg');
        const r = await request('POST', `/api/photos?${params}`, { token, raw: form });
        done++;
        await syncTo(r.v);
      } catch (err) {
        toast(err.message, 'error');
      }
    }
    setBusy('');
    setCaption('');
    if (done) {
      sound.play('pop');
      toast(done === 1 ? 'Photo added.' : `${done} photos added.`, 'ok');
    }
  };

  return html`<div class="panel stack">
    <div class="panel-title">Add photos</div>
    <div class="grid-2" style="gap:12px">
      <label class="field">
        <span class="label">Which night?</span>
        <select class="select" value=${nightId} onChange=${(e) => setNightId(e.target.value)}>
          ${a.state.nights.map((n) => html`<option key=${n.id} value=${n.id}>Night ${n.number}: ${teamById(n.hostTeamId)?.name}</option>`)}
        </select>
      </label>
      <label class="field">
        <span class="label">Caption (optional)</span>
        <input class="input" maxlength="120" value=${caption} onInput=${(e) => setCaption(e.target.value)} placeholder="The lasagne that started a war" />
      </label>
    </div>
    <label class=${`btn block ${busy ? 'is-busy' : ''}`} style="cursor:pointer">
      <${Icon} name="photo" />${busy || 'Choose photos'}
      <input type="file" accept="image/*" multiple class="sr-only" disabled=${Boolean(busy)} onChange=${upload} />
    </label>
  </div>`;
}

function Lightbox({ photo, onClose }) {
  const a = useApp();
  useScrollLock(Boolean(photo));
  if (!photo) return null;
  const team = teamById(photo.teamId);
  const night = a.state.nights.find((n) => n.id === photo.nightId);
  const canDelete = Boolean(app.adminToken) || (photo.teamId && photo.teamId === myTeamId());
  const remove = async () => {
    if (!confirm('Delete this photo?')) return;
    try {
      const r = await request('DELETE', `/api/photos?id=${encodeURIComponent(photo.id)}`, { token: app.adminToken || app.teamToken });
      onClose();
      await syncTo(r.v);
      toast('Photo deleted.', 'ok');
    } catch (err) {
      toast(err.message, 'error');
    }
  };
  return html`<div class="lightbox" role="dialog" aria-modal="true" onClick=${(e) => e.target === e.currentTarget && onClose()}>
    <img src=${photo.url} alt=${photo.caption || 'Food photo'} />
    <div class="center" style="margin-top:12px;max-width:600px">
      ${photo.caption && html`<p style="font-weight:600">${photo.caption}</p>`}
      <p class="small muted">Night ${night?.number}${team ? ` · posted by ${team.name}` : ''}</p>
      <div class="row" style="justify-content:center;margin-top:10px">
        <button class="btn sm dark" onClick=${onClose}><${Icon} name="close" size="18" />Close</button>
        <a class="btn sm dark" href=${photo.url} target="_blank" rel="noopener">Full size</a>
        ${canDelete && html`<button class="btn sm red" onClick=${remove}><${Icon} name="trash" size="18" />Delete</button>`}
      </div>
    </div>
  </div>`;
}

export function PhotosView({ nightId }) {
  const a = useApp();
  const s = a.state;
  const [filter, setFilter] = useState(nightId || 'all');
  const [open, setOpen] = useState(null);
  useEffect(() => setFilter(nightId || 'all'), [nightId]);
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && setOpen(null);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const photos = s.photos.filter((p) => filter === 'all' || p.nightId === filter);
  const canUpload = s.features.photos && (a.team || a.adminToken);
  const defaultNight = filter !== 'all' ? filter : currentNight(s.nights)?.id || s.nights[0]?.id;
  const groups = s.nights.map((n) => ({ night: n, items: photos.filter((p) => p.nightId === n.id) })).filter((g) => g.items.length);

  return html`<div class="page stack-lg">
    <${PageTitle} kicker="The gallery" title="Food pics">Photos from every dinner.<//>
    <div class="seg" role="group" aria-label="Filter by night">
      <button type="button" aria-pressed=${filter === 'all'} onClick=${() => setFilter('all')}>All</button>
      ${s.nights.map((n) => html`<button type="button" key=${n.id} aria-pressed=${filter === n.id} onClick=${() => setFilter(n.id)}>N${n.number}</button>`)}
    </div>
    ${!s.features.photos && html`<div class="panel warn-box">
      <strong>Photo uploads are switched off.</strong>
      <p class="small muted">The organiser can switch them on by creating a Blob store in the Vercel Storage tab and redeploying.</p>
    </div>`}
    ${s.features.photos && !canUpload && html`<details class="panel"><summary style="cursor:pointer;font-weight:600">Log in to add photos</summary><div style="margin-top:12px"><${TeamLogin} compact /></div></details>`}
    ${canUpload && html`<${Uploader} defaultNight=${defaultNight} />`}
    ${groups.length === 0
      ? html`<div class="panel"><${Empty} icon="📸" title="No photos yet">Snap the starter before anyone eats it.<//></div>`
      : groups.map((g) => html`<section class="stack" key=${g.night.id}>
          <${FireText} tag="h2" text=${`Night ${g.night.number} · ${teamById(g.night.hostTeamId)?.name || ''}`} style="font-size:1.5rem" />
          <div class="photo-grid">
            ${g.items.map((p) => html`<button key=${p.id} onClick=${() => setOpen(p)} aria-label=${p.caption || 'Open photo'}>
              <img src=${p.thumb || p.url} alt=${p.caption || 'Food photo'} loading="lazy" />
            </button>`)}
          </div>
        </section>`)}
    <${Lightbox} photo=${open} onClose=${() => setOpen(null)} />
  </div>`;
}
