// Hash router: #/rotation, #/night/n2, #/score/n3, #/join/CODE, #/admin/teams
import { useEffect, useState } from './lib.js';

export function parseHash() {
  const raw = decodeURIComponent(location.hash.replace(/^#\/?/, ''));
  const [path, query] = raw.split('?');
  const parts = path.split('/').filter(Boolean);
  return { name: parts[0] || 'home', params: parts.slice(1), query: new URLSearchParams(query || ''), path };
}

export function useRoute() {
  const [route, setRoute] = useState(parseHash);
  useEffect(() => {
    const onChange = () => {
      const next = parseHash();
      setRoute((prev) => {
        if (prev.name !== next.name || prev.params[0] !== next.params[0]) window.scrollTo(0, 0);
        return next;
      });
    };
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}

export function go(path) {
  location.hash = `#/${path.replace(/^#?\/?/, '')}`;
}
