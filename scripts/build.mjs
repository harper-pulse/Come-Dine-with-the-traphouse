// Vercel build step. The site itself needs no bundling. This:
// - rewrites the link-preview image URLs to absolute ones, because WhatsApp,
//   iMessage and friends ignore relative og:image paths
// - switches on the real GTA font if its file has been added (scripts/fonts.mjs)
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { gtaFontFace } from './fonts.mjs';

const publicDir = fileURLToPath(new URL('../public', import.meta.url));
const face = gtaFontFace(publicDir);
if (face) {
  const cssFile = new URL('../public/css/app.css', import.meta.url);
  const css = fs.readFileSync(cssFile, 'utf8');
  if (!css.includes("font-family: 'Pricedown';")) fs.writeFileSync(cssFile, face + css);
  console.log('GTA font found, using Pricedown.');
}

const host = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL || '';
const file = new URL('../public/index.html', import.meta.url);
const html = fs.readFileSync(file, 'utf8');

if (!host) {
  console.log('No Vercel URL found, leaving link preview paths relative.');
} else {
  const base = `https://${host.replace(/^https?:\/\//, '').replace(/\/$/, '')}`;
  const out = html.replace(
    /(<meta (?:property|name)="(?:og:image|og:url|twitter:image)" content=")\/(?!\/)/g,
    `$1${base}/`,
  );
  fs.writeFileSync(file, out);
  console.log(`Link previews now point at ${base}`);
}
