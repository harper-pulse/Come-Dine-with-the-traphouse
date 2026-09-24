// Vercel build step. The site itself needs no bundling; this only rewrites
// the link-preview image URLs to absolute ones, because WhatsApp, iMessage
// and friends ignore relative og:image paths.
import fs from 'node:fs';

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
