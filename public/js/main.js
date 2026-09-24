// App shell: header, bottom nav, routing.
import { html, render, useEffect, useState } from './lib.js';
import { useApp, refresh, myTeam, myCard } from './store.js';
import { useRoute } from './router.js';
import { useFx, sound } from './fx.js';
import { FireText, Avatar, Icon, Sheet, Toasts, OverlayLayer } from './components.js';
import { nightStatus } from './shared/core.js';
import { HomeView } from './views/home.js';
import { RotationView } from './views/rotation.js';
import { NightView } from './views/night.js';
import { CrewsView } from './views/crews.js';
import { ScoreView } from './views/score.js';
import { BoardView } from './views/board.js';
import { RevealView } from './views/reveal.js';
import { PhotosView } from './views/photos.js';
import { RulesView } from './views/rules.js';
import { MeView } from './views/me.js';
import { JoinView } from './views/join.js';
import { AdminView } from './views/admin.js';
import { Boot, StorageMissing, NotSetUp, NotFound, Offline } from './views/misc.js';

const DESK_LINKS = [
  ['home', 'Home'],
  ['rotation', 'Rotation'],
  ['score', 'Score'],
  ['board', 'Leaderboard'],
  ['crews', 'Crews'],
  ['photos', 'Photos'],
  ['rules', 'Rules'],
];

function needsMyScore(a) {
  const team = a.team;
  if (!team || !a.state?.nights) return false;
  return a.state.nights.some((n) => n.hostTeamId !== team.teamId && nightStatus(n) === 'open' && !myCard(n.id));
}

function Header({ route }) {
  const a = useApp();
  const team = myTeam();
  return html`<header class="topbar">
    <div class="topbar-inner">
      <a class="brand" href="#/" aria-label="Home">
        <img class="brand-mark" src="/icons/favicon-64.png" alt="" width="40" height="40" />
        <span class="brand-words">
          <span class="brand-small">Come dine with the</span>
          <${FireText} text="Traphouse" class="brand-big" />
        </span>
      </a>
      <nav class="desk-nav" aria-label="Main">
        ${DESK_LINKS.map(([name, label]) => html`<a key=${name} href=${`#/${name === 'home' ? '' : name}`}
          aria-current=${route.name === name ? 'page' : undefined}>${label}</a>`)}
      </nav>
      <div class="who">
        ${team
          ? html`<a class="who-chip" href="#/me" aria-label=${`Logged in as ${team.name}`}>
              <${Avatar} member=${team.members[0]} team=${team} size=${28} /><span>${team.name}</span></a>`
          : a.state?.setup && html`<a class="btn sm" href="#/me">Team login</a>`}
      </div>
    </div>
  </header>`;
}

function MoreSheet({ open, onClose }) {
  const a = useApp();
  useFx();
  const item = (href, icon, label) => html`<a href=${href} onClick=${onClose}><${Icon} name=${icon} />${label}</a>`;
  return html`<${Sheet} open=${open} onClose=${onClose} label="More">
    <nav class="menu-list" aria-label="More">
      ${item('#/crews', 'crew', 'The Crews')}
      ${item('#/photos', 'photo', 'Food photos')}
      ${item('#/rules', 'rules', 'House rules')}
      ${item('#/reveal', 'reveal', 'The Grand Reveal')}
      ${item('#/me', 'me', a.team ? 'My team' : 'Team login')}
      ${item('#/admin', 'shield', 'Organiser')}
      <button type="button" onClick=${() => {
        sound.muted = !sound.muted;
        if (!sound.muted) sound.play('pop');
      }}>
        <${Icon} name=${sound.muted ? 'mute' : 'sound'} />${sound.muted ? 'Sound effects: off' : 'Sound effects: on'}
      </button>
    </nav>
  <//>`;
}

function BottomNav({ route }) {
  const a = useApp();
  const [more, setMore] = useState(false);
  const live = a.state?.show?.status === 'live';
  const moreNames = ['crews', 'photos', 'rules', 'me', 'admin', 'night', 'join'];
  const tab = (name, icon, label, dot) => html`<a href=${`#/${name === 'home' ? '' : name}`}
    aria-current=${route.name === name ? 'page' : undefined}>
    <${Icon} name=${icon} />${label}${dot && html`<span class="nav-dot" aria-label="needs attention"></span>`}
  </a>`;
  return html`<nav class="bottom-nav" aria-label="Main">
    <div class="bottom-nav-inner">
      ${tab('home', 'home', 'Home')}
      ${tab('rotation', 'rotation', 'Rotation')}
      ${tab('score', 'score', 'Score', needsMyScore(a))}
      ${tab('board', 'trophy', 'Board', live)}
      <button type="button" aria-current=${moreNames.includes(route.name) ? 'page' : undefined} onClick=${() => setMore(true)}>
        <${Icon} name="more" />More
      </button>
    </div>
    <${MoreSheet} open=${more} onClose=${() => setMore(false)} />
  </nav>`;
}

function Footer() {
  const a = useApp();
  return html`<footer class="footer">
    <p>${a.state?.event?.name || 'Come Dine With The Traphouse'} · <a href="#/rules">House rules</a> · <a href="#/admin">Organiser</a></p>
  </footer>`;
}

function Page({ route }) {
  const a = useApp();
  const s = a.state;
  if (!s) return html`<${Offline} />`;
  if (!s.setup && route.name !== 'admin') return html`<${NotSetUp} />`;
  switch (route.name) {
    case 'home':
      return html`<${HomeView} />`;
    case 'rotation':
      return html`<${RotationView} />`;
    case 'night':
      return html`<${NightView} id=${route.params[0]} />`;
    case 'crews':
      return html`<${CrewsView} id=${route.params[0]} />`;
    case 'score':
      return html`<${ScoreView} nightId=${route.params[0]} />`;
    case 'board':
      return html`<${BoardView} />`;
    case 'photos':
      return html`<${PhotosView} nightId=${route.query.get('night')} />`;
    case 'rules':
      return html`<${RulesView} />`;
    case 'me':
      return html`<${MeView} />`;
    case 'join':
      return html`<${JoinView} code=${route.params[0]} />`;
    case 'admin':
      return html`<${AdminView} tab=${route.params[0] || 'overview'} />`;
    default:
      return html`<${NotFound} />`;
  }
}

function App() {
  const a = useApp();
  const route = useRoute();
  useEffect(() => {
    refresh({ force: true });
  }, []);

  useEffect(() => {
    const name = a.state?.event?.name || 'Come Dine With The Traphouse';
    document.title = route.name === 'home' ? name : `${route.name[0].toUpperCase()}${route.name.slice(1)} · ${name}`;
  }, [route.name, a.state?.event?.name]);

  if (!a.ready) return html`<${Boot} />`;
  if (a.error === 'storage_missing') return html`<${StorageMissing} /><${Toasts} />`;

  if (route.name === 'reveal' && a.state?.setup) {
    return html`<${RevealView} /><${Toasts} /><${OverlayLayer} />`;
  }

  return html`<div class="shell">
      <a class="sr-only" href="#main">Skip to content</a>
      <${Header} route=${route} />
      ${a.error === 'offline' && html`<div class="offline" role="status">Offline. Reconnecting…</div>`}
      <main id="main"><${Page} route=${route} /></main>
      <${Footer} />
      <${BottomNav} route=${route} />
    </div>
    <${Toasts} />
    <${OverlayLayer} />`;
}

render(html`<${App} />`, document.getElementById('app'));
