// Optional real GTA font. Pricedown (by Typodermic) is free to download but
// can't be bundled here, so drop the file into public/fonts/ (any name
// containing "pricedown", as .woff2, .woff, .ttf or .otf) and the site picks
// it up. Without it, the Luckiest Guy lookalike is used.
import fs from 'node:fs';
import path from 'node:path';

const FORMATS = { '.woff2': 'woff2', '.woff': 'woff', '.ttf': 'truetype', '.otf': 'opentype' };

export function gtaFontFace(publicDir) {
  const dir = path.join(publicDir, 'fonts');
  let files = [];
  try {
    files = fs.readdirSync(dir);
  } catch {
    return '';
  }
  const order = Object.keys(FORMATS);
  const file = files
    .filter((f) => /pricedown/i.test(f) && FORMATS[path.extname(f).toLowerCase()])
    .sort((a, b) => order.indexOf(path.extname(a).toLowerCase()) - order.indexOf(path.extname(b).toLowerCase()))[0];
  if (!file) return '';
  const url = `/fonts/${encodeURIComponent(file)}`;
  return `@font-face {\n  font-family: 'Pricedown';\n  src: url('${url}') format('${FORMATS[path.extname(file).toLowerCase()]}');\n  font-display: swap;\n}\n`;
}
