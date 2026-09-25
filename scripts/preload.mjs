// Adds <link rel="modulepreload"> tags for every module the app imports up
// front. Without them a phone finds the code one import at a time (main.js,
// then the views, then the components...), a round trip per level. With them
// it asks for everything at once.
import fs from 'node:fs';
import path from 'node:path';

const IMPORT_RE = /(?:^|[;\n])\s*(?:import|export)\s+(?:[^'"();]*?\s+from\s+)?['"]([^'"]+)['"]/g;

function importMap(html) {
  const m = html.match(/<script type="importmap">([\s\S]*?)<\/script>/);
  try {
    return m ? JSON.parse(m[1]).imports || {} : {};
  } catch {
    return {};
  }
}

// URL paths of every module reachable from the entry through static imports.
export function modulePreloads(publicDir, html, entry = '/js/main.js') {
  const map = importMap(html);
  const seen = new Set();
  const walk = (url) => {
    if (seen.has(url)) return;
    const file = path.join(publicDir, url);
    if (!file.startsWith(publicDir) || !fs.existsSync(file)) return;
    seen.add(url);
    const source = fs.readFileSync(file, 'utf8');
    for (const [, spec] of source.matchAll(IMPORT_RE)) {
      if (map[spec]) walk(map[spec]);
      else if (spec.startsWith('.')) walk(path.posix.join(path.posix.dirname(url), spec));
      else if (spec.startsWith('/')) walk(spec);
    }
  };
  walk(entry);
  seen.delete(entry);
  return [...seen].sort();
}

// Rebuilds the list each time, so it can't go stale if the file is ever saved with it.
export function withModulePreloads(html, publicDir) {
  const tag = '<script type="module" src="/js/main.js"></script>';
  if (!html.includes(tag)) return html;
  const clean = html.replace(/[ \t]*<link rel="modulepreload"[^>]*>\n?/g, '');
  const links = modulePreloads(publicDir, clean).map((url) => `<link rel="modulepreload" href="${url}" />`);
  return clean.replace(tag, `${links.join('\n    ')}\n    ${tag}`);
}
