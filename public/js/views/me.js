// My team: profile, avatars, dietary needs, and the hosting editor.
import { html, useState, useEffect } from '../lib.js';
import { useApp, teamById, hostNightOf, tz, myTeamId, teamAction, logoutTeam } from '../store.js';
import { FireText, PageTitle, TeamLogin, Avatar, TeamBadge, Icon } from '../components.js';
import { PortraitsSection } from '../portraits.js';
import { toast, sound } from '../fx.js';
import { AVATARS } from '../shared/core.js';
import { fmtDayLong, fmtTime } from '../util.js';

export function AvatarPicker({ value, onChange, team, member }) {
  return html`<div class="avatar-picker" role="radiogroup" aria-label="Pick a character">
    ${member?.avatarUrl && html`<button type="button" aria-pressed=${value === 'custom'} role="radio" aria-checked=${value === 'custom'} onClick=${() => onChange('custom')} title="Your GTA portrait">
      <${Avatar} member=${{ ...member, avatar: 'custom' }} team=${team} size=${46} />
    </button>`}
    <button type="button" aria-pressed=${!value} role="radio" aria-checked=${!value} onClick=${() => onChange('')} title="Initials">
      <${Avatar} member=${{ ...member, avatar: '' }} team=${team} size=${46} />
    </button>
    ${AVATARS.map((id) => html`<button type="button" key=${id} role="radio" aria-checked=${value === id} aria-pressed=${value === id} onClick=${() => onChange(id)}>
      <${Avatar} member=${{ avatar: id }} team=${team} size=${46} />
    </button>`)}
  </div>`;
}

export function ProfileForm({ team, onSave, saving, includeDietary = true }) {
  const [name, setName] = useState(team.name);
  const [motto, setMotto] = useState(team.motto || '');
  const [members, setMembers] = useState(team.members.map((m) => ({ ...m })));
  useEffect(() => {
    setName(team.name);
    setMotto(team.motto || '');
    setMembers(team.members.map((m) => ({ ...m })));
  }, [team.id]);
  // A new GTA portrait changes avatars behind the form's back: pick those up
  // without losing any unsaved typing.
  const avatarKey = team.members.map((m) => `${m.avatar}|${m.avatarUrl}`).join(',');
  useEffect(() => {
    setMembers((current) => current.map((m) => {
      const fresh = team.members.find((x) => x.id === m.id);
      return fresh ? { ...m, avatar: fresh.avatar, avatarUrl: fresh.avatarUrl, avatarThumb: fresh.avatarThumb } : m;
    }));
  }, [avatarKey]);
  const setMember = (id, patch) => setMembers(members.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  return html`<form class="stack" onSubmit=${(e) => {
    e.preventDefault();
    onSave({ name, motto, members });
  }}>
    <label class="field"><span class="label">Team name</span>
      <input class="input" maxlength="40" value=${name} onInput=${(e) => setName(e.target.value)} required /></label>
    <label class="field"><span class="label">Motto (optional)</span>
      <input class="input" maxlength="90" value=${motto} onInput=${(e) => setMotto(e.target.value)} placeholder="We cook, you cry" /></label>
    ${members.map((m, i) => html`<fieldset key=${m.id} class="panel tight" style="margin:0;background:var(--bg-3)">
      <legend class="sr-only">Player ${i + 1}</legend>
      <div class="row" style="margin-bottom:10px">
        <${Avatar} member=${m} team=${{ color: team.color }} size=${54} />
        <label class="field" style="flex:1"><span class="label">Player ${i + 1}</span>
          <input class="input" maxlength="40" value=${m.name} onInput=${(e) => setMember(m.id, { name: e.target.value })} /></label>
      </div>
      <span class="label">Character</span>
      <${AvatarPicker} value=${m.avatar} team=${{ color: team.color }} member=${m} onChange=${(v) => setMember(m.id, { avatar: v })} />
      ${includeDietary && html`<label class="field" style="margin-top:12px"><span class="label">Dietary needs / allergies</span>
        <input class="input" maxlength="200" value=${m.dietary || ''} onInput=${(e) => setMember(m.id, { dietary: e.target.value })} placeholder="e.g. no seafood, coeliac, vegetarian" />
        <span class="hint">Only logged-in teams can see this, so your hosts know.</span></label>`}
    </fieldset>`)}
    <button class="btn block" disabled=${saving}>${saving ? 'Saving…' : 'Save team'}</button>
  </form>`;
}

const EMPTY_INFO = { theme: '', dressCode: '', suburb: '', address: '', arrival: '', message: '', menu: { starter: '', main: '', dessert: '', drinks: '' }, menuRevealed: false };

export function HostForm({ info, onSave, saving }) {
  const [form, setForm] = useState({ ...EMPTY_INFO, ...info, menu: { ...EMPTY_INFO.menu, ...(info?.menu || {}) } });
  useEffect(() => {
    setForm({ ...EMPTY_INFO, ...info, menu: { ...EMPTY_INFO.menu, ...(info?.menu || {}) } });
  }, [info?.updatedAt]);
  const set = (patch) => setForm({ ...form, ...patch });
  const setMenu = (k, v) => setForm({ ...form, menu: { ...form.menu, [k]: v } });
  const field = (key, label, placeholder, max = 80) => html`<label class="field"><span class="label">${label}</span>
    <input class="input" maxlength=${max} value=${form[key]} onInput=${(e) => set({ [key]: e.target.value })} placeholder=${placeholder} /></label>`;
  return html`<form class="stack" onSubmit=${(e) => {
    e.preventDefault();
    onSave(form);
  }}>
    ${field('theme', 'Theme', 'Sopranos Sunday, Mexican fiesta, Nana’s kitchen…', 60)}
    ${field('dressCode', 'Dress code', 'Tracksuits mandatory', 80)}
    <div class="grid-2" style="gap:12px">
      ${field('suburb', 'Suburb (shown to everyone)', 'Westgate', 60)}
      ${field('arrival', 'Arrival note', 'Drinks from 6:30, food at 7', 80)}
    </div>
    ${field('address', 'Full address (logged-in teams only)', '12 Example Street, Westgate', 160)}
    <div class="panel tight" style="background:var(--bg-3)">
      <div class="kicker" style="margin-bottom:8px">The menu</div>
      ${[['starter', '🥟 Starter'], ['main', '🍗 Main'], ['dessert', '🍰 Dessert'], ['drinks', '🍷 Drinks']].map(([k, label]) => html`<label class="field" key=${k}>
        <span class="label">${label}</span>
        <input class="input" maxlength="200" value=${form.menu[k]} onInput=${(e) => setMenu(k, e.target.value)} />
      </label>`)}
      <label class="check" style="margin-top:12px">
        <input type="checkbox" checked=${form.menuRevealed} onChange=${(e) => set({ menuRevealed: e.target.checked })} />
        Reveal the menu to everyone now
      </label>
      <p class="hint">Leave it unticked to keep it a surprise. Tick it on the night, or whenever you like.</p>
    </div>
    <label class="field"><span class="label">Message to your guests</span>
      <textarea class="textarea" maxlength="600" value=${form.message} onInput=${(e) => set({ message: e.target.value })} placeholder="BYO, parking on the street, bring an appetite."></textarea></label>
    <button class="btn block" disabled=${saving}>${saving ? 'Saving…' : 'Save my night'}</button>
  </form>`;
}

export function MeView() {
  const a = useApp();
  const [saving, setSaving] = useState('');
  if (!a.team) {
    return html`<div class="page narrow stack-lg">
      <${PageTitle} kicker="My team" title="Team login">Your organiser sent each team a secret link. Tap it to log in, or type your team code below.<//>
      <div class="panel paper"><${TeamLogin} compact onDone=${() => window.scrollTo(0, 0)} /></div>
    </div>`;
  }
  const zone = tz();
  const mine = myTeamId();
  const team = a.team.team;
  const publicTeam = teamById(mine);
  const hosting = hostNightOf(mine);
  const hostInfo = a.team.nights.find((n) => n.id === hosting?.id)?.hostinfo;
  const guests = hosting ? hosting.guests : [];
  const dietary = (a.team.dietary || []).filter((d) => guests.includes(d.teamId)).flatMap((d) => d.members.filter((m) => m.dietary).map((m) => ({ ...m, teamId: d.teamId })));

  const save = async (kind, body) => {
    setSaving(kind);
    try {
      await teamAction(body);
      sound.play('pop');
      toast('Saved.', 'ok');
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setSaving('');
    }
  };

  return html`<div class="page narrow stack-lg">
    <header class="stack">
      <div class="kicker">My team</div>
      <div class="row">
        <${TeamBadge} team=${publicTeam} size=${58} />
        <${FireText} tag="h1" text=${team.name} style="font-size:clamp(2rem,9vw,2.8rem)" />
      </div>
    </header>

    <${PortraitsSection} team=${team} ai=${a.team.ai} />

    ${hosting &&
    html`<section class="panel tone-orange halftone stack">
      <div class="row between wrap">
        <div>
          <div class="kicker" style="color:#fff">You're hosting</div>
          <div class="panel-title" style="margin:2px 0 0">Night ${hosting.number}</div>
          <div class="small">${hosting.startsAt ? `${fmtDayLong(hosting.startsAt, zone)}, ${fmtTime(hosting.startsAt, zone)}` : 'Date TBC (the organiser sets it)'}</div>
        </div>
        <a class="btn sm paper" href=${`#/night/${hosting.id}`}>Preview</a>
      </div>
      ${dietary.length > 0 && html`<div class="panel paper tight">
        <div class="kicker" style="color:#b33a12">Your guests' dietary needs</div>
        <ul style="margin:6px 0 0;padding-left:1.1em">${dietary.map((p) => html`<li key=${p.id}><strong>${p.name}</strong> (${teamById(p.teamId)?.name}): ${p.dietary}</li>`)}</ul>
      </div>`}
    </section>
    <section class="panel stack">
      <div class="panel-title">Your night</div>
      <${HostForm} info=${hostInfo} saving=${saving === 'host'} onSave=${(form) => save('host', { action: 'host', nightId: hosting.id, ...form })} />
    </section>`}

    <section class="panel stack">
      <div class="panel-title">Team profile</div>
      <${ProfileForm} team=${team} saving=${saving === 'profile'} onSave=${(p) => save('profile', { action: 'profile', ...p })} />
    </section>

    <section class="panel stack">
      <div class="panel-title">This phone</div>
      <p class="small muted">Logged in as ${team.name}. Anyone with your team link can log in as your team, so keep it in the family.</p>
      <button class="btn dark" onClick=${() => {
        if (confirm('Log this phone out of your team?')) logoutTeam();
      }}><${Icon} name="logout" />Log out</button>
    </section>
  </div>`;
}
