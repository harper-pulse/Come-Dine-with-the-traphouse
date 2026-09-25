// Free, on-device "comic" treatment for portraits: edge-preserving smoothing,
// cel-shaded colour bands, black ink outlines, halftone shadows and a warm
// poster grade. Used when AI portraits are off, or as a quick alternative.

function loadBitmap(blob) {
  if (window.createImageBitmap) {
    return createImageBitmap(blob, { imageOrientation: 'from-image' }).catch(() => loadImg(blob));
  }
  return loadImg(blob);
}

function loadImg(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = (e) => {
      URL.revokeObjectURL(url);
      reject(e);
    };
    img.src = url;
  });
}

// Draws the image centre-cropped into a size x size canvas.
export async function squareCanvas(blob, size) {
  const img = await loadBitmap(blob);
  const w = img.width || img.naturalWidth;
  const h = img.height || img.naturalHeight;
  const s = Math.min(w, h);
  // Portraits: bias the crop slightly upwards so heads aren't cut off.
  const sx = (w - s) / 2;
  const sy = h > w ? Math.max(0, (h - s) * 0.3) : 0;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, sx, sy, s, s, 0, 0, size, size);
  return canvas;
}

export function canvasToBlob(canvas, type = 'image/jpeg', quality = 0.86) {
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not save image'))), type, quality));
}

// Final avatar file: square JPEG, small enough to store and load fast.
export async function finalAvatar(blob, size = 640) {
  return canvasToBlob(await squareCanvas(blob, size), 'image/jpeg', 0.86);
}

// Summed-area tables for fast box statistics.
function integral(values, W, H) {
  const sat = new Float64Array((W + 1) * (H + 1));
  for (let y = 1; y <= H; y++) {
    let row = 0;
    for (let x = 1; x <= W; x++) {
      row += values[(y - 1) * W + (x - 1)];
      sat[y * (W + 1) + x] = sat[(y - 1) * (W + 1) + x] + row;
    }
  }
  return sat;
}

function boxSum(sat, W, x0, y0, x1, y1) {
  const s = W + 1;
  return sat[y1 * s + x1] - sat[y0 * s + x1] - sat[y1 * s + x0] + sat[y0 * s + x0];
}

// Kuwahara filter: flattens skin and background into painted areas while
// keeping edges sharp.
function kuwahara(src, W, H, r) {
  const n = W * H;
  const R = new Float64Array(n);
  const G = new Float64Array(n);
  const B = new Float64Array(n);
  const L = new Float64Array(n);
  const L2 = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    R[i] = src[i * 4];
    G[i] = src[i * 4 + 1];
    B[i] = src[i * 4 + 2];
    const l = 0.299 * R[i] + 0.587 * G[i] + 0.114 * B[i];
    L[i] = l;
    L2[i] = l * l;
  }
  const sR = integral(R, W, H);
  const sG = integral(G, W, H);
  const sB = integral(B, W, H);
  const sL = integral(L, W, H);
  const sL2 = integral(L2, W, H);
  const out = new Uint8ClampedArray(src.length);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let best = Infinity;
      let br = 0;
      let bg = 0;
      let bb = 0;
      const quads = [
        [x - r, y - r, x + 1, y + 1],
        [x, y - r, x + r + 1, y + 1],
        [x - r, y, x + 1, y + r + 1],
        [x, y, x + r + 1, y + r + 1],
      ];
      for (const [qx0, qy0, qx1, qy1] of quads) {
        const x0 = Math.max(0, qx0);
        const y0 = Math.max(0, qy0);
        const x1 = Math.min(W, qx1);
        const y1 = Math.min(H, qy1);
        const count = (x1 - x0) * (y1 - y0);
        if (count <= 0) continue;
        const m = boxSum(sL, W, x0, y0, x1, y1) / count;
        const variance = boxSum(sL2, W, x0, y0, x1, y1) / count - m * m;
        if (variance < best) {
          best = variance;
          br = boxSum(sR, W, x0, y0, x1, y1) / count;
          bg = boxSum(sG, W, x0, y0, x1, y1) / count;
          bb = boxSum(sB, W, x0, y0, x1, y1) / count;
        }
      }
      const o = (y * W + x) * 4;
      out[o] = br;
      out[o + 1] = bg;
      out[o + 2] = bb;
      out[o + 3] = 255;
    }
  }
  return out;
}

export async function gtaFilter(blob, size = 640) {
  const canvas = await squareCanvas(blob, size);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const W = size;
  const H = size;
  const image = ctx.getImageData(0, 0, W, H);
  const smooth = kuwahara(image.data, W, H, 3);

  // Luminance of the smoothed image, for edges and shading bands.
  const lum = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) {
    lum[i] = 0.299 * smooth[i * 4] + 0.587 * smooth[i * 4 + 1] + 0.114 * smooth[i * 4 + 2];
  }

  // Sobel edges -> ink mask.
  const ink = new Uint8Array(W * H);
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const i = y * W + x;
      const gx = -lum[i - W - 1] - 2 * lum[i - 1] - lum[i + W - 1] + lum[i - W + 1] + 2 * lum[i + 1] + lum[i + W + 1];
      const gy = -lum[i - W - 1] - 2 * lum[i - W] - lum[i - W + 1] + lum[i + W - 1] + 2 * lum[i + W] + lum[i + W + 1];
      if (Math.hypot(gx, gy) > 118) ink[i] = 1;
    }
  }
  // Thicken the lines a touch.
  const thick = new Uint8Array(W * H);
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const i = y * W + x;
      if (ink[i] || ink[i - 1] || ink[i + 1] || ink[i - W] || ink[i + W]) thick[i] = 1;
    }
  }

  const out = image.data;
  // Brightness thresholds and the flat tone each band is painted with.
  const cuts = [0.2, 0.4, 0.6, 0.8];
  const tones = [0.1, 0.3, 0.49, 0.68, 0.86];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const o = i * 4;
      let r = smooth[o];
      let g = smooth[o + 1];
      let b = smooth[o + 2];
      const l = Math.max(1, lum[i]);
      // Cel shading: snap brightness to a few bands, keep the hue.
      const t = l / 255;
      let idx = cuts.findIndex((c) => t <= c);
      if (idx === -1) idx = cuts.length;
      const band = tones[idx];
      const k = (band * 255) / l;
      r *= k;
      g *= k;
      b *= k;
      // Punchier colours.
      const grey = 0.299 * r + 0.587 * g + 0.114 * b;
      r = grey + (r - grey) * 1.45;
      g = grey + (g - grey) * 1.45;
      b = grey + (b - grey) * 1.45;
      // Poster grade: teal shadows, warm highlights.
      const shade = 1 - band;
      r += 18 * band - 10 * shade;
      g += 6 * band + 4 * shade;
      b += -8 * band + 22 * shade;
      // Halftone dots in the darker bands.
      if (idx <= 1) {
        const cx = (x % 6) - 2.5;
        const cy = (y % 6) - 2.5;
        if (cx * cx + cy * cy < (idx === 0 ? 5 : 2.5)) {
          r *= 0.6;
          g *= 0.6;
          b *= 0.65;
        }
      }
      if (thick[i]) {
        r = 12;
        g = 10;
        b = 16;
      }
      out[o] = r;
      out[o + 1] = g;
      out[o + 2] = b;
      out[o + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);

  // Warm glow along the bottom, like the flames in the poster panels.
  const glow = ctx.createLinearGradient(0, H * 0.55, 0, H);
  glow.addColorStop(0, 'rgba(255,106,26,0)');
  glow.addColorStop(1, 'rgba(255,106,26,0.35)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);
  return canvasToBlob(canvas, 'image/jpeg', 0.86);
}
