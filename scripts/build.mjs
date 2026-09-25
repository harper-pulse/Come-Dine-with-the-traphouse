// Vercel build step. The site itself needs no bundling. This:
// - rewrites the link-preview image URLs to absolute ones, because WhatsApp,
//   iMessage and friends ignore relative og:image paths
// - lists every script module up front so phones fetch them in one go (scripts/preload.mjs)
// - switches on the real GTA font if its file has been added (scripts/fonts.mjs)
// index.html is only rewritten on Vercel, so a local run leaves the repo alone.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { gtaFontFace } from './fonts.mjs';
import { withModulePreloads } from './preload.mjs';

const publicDir = fileURLToPath(new URL('../public', import.meta.url));
const face = gtaFontFace(publicDir);
if (face) {
  const cssFile = new URL('../public/css/app.css', import.meta.url);
  const css = fs.readFileSync(cssFile, 'utf8');
  if (!css.includes("font-family: 'Pricedown';")) fs.writeFileSync(cssFile, face + css);
  console.log('GTA font found, using Pricedown.');
}

const file = new URL('../public/index.html', import.meta.url);
let html = withModulePreloads(fs.readFileSync(file, 'utf8'), publicDir);
console.log(`Preloading ${html.match(/rel="modulepreload"/g)?.length || 0} script modules.`);

const host = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL || '';
if (!host) {
  console.log('No Vercel URL found, leaving link preview paths relative.');
} else {
  const base = `https://${host.replace(/^https?:\/\//, '').replace(/\/$/, '')}`;
  html = html.replace(/(<meta (?:property|name)="(?:og:image|og:url|twitter:image)" content=")\/(?!\/)/g, `$1${base}/`);
  console.log(`Link previews now point at ${base}`);
}

if (process.env.VERCEL) fs.writeFileSync(file, html);
