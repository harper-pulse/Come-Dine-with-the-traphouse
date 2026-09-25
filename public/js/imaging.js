// Image helpers for portraits: square-crop and re-encode on the phone before
// upload, so saved portraits are small and load fast.

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

// Final avatar file: square JPEG, sharp on big screens but still small.
export async function finalAvatar(blob, size = 768, quality = 0.88) {
  return canvasToBlob(await squareCanvas(blob, size), 'image/jpeg', quality);
}

// The portrait plus a 256px copy for badges and the header, as one upload.
export async function portraitUpload(blob) {
  const [image, thumb] = await Promise.all([finalAvatar(blob), finalAvatar(blob, 256, 0.82)]);
  const form = new FormData();
  form.append('image', image, 'portrait.jpg');
  form.append('thumb', thumb, 'portrait-thumb.jpg');
  return form;
}
