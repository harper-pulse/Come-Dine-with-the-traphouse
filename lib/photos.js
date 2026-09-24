// Food photo storage. Uses Vercel Blob when a Blob store is connected to the
// project, and a local folder when running `npm run dev`.

import fs from 'node:fs';
import path from 'node:path';
import { storageKind } from './store.js';

const LOCAL_DIR = path.join(process.env.LOCAL_DATA_DIR || path.join(process.cwd(), '.data'), 'photos');

export function photosEnabled() {
  if (storageKind() === 'file') return true;
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID);
}

export function sniffImage(buf) {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { type: 'image/jpeg', ext: 'jpg' };
  if (buf.length > 8 && buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { type: 'image/png', ext: 'png' };
  if (buf.length > 12 && buf.slice(0, 4).toString('ascii') === 'RIFF' && buf.slice(8, 12).toString('ascii') === 'WEBP') return { type: 'image/webp', ext: 'webp' };
  return null;
}

// Returns { url, pathname, access }.
export async function storePhoto(buf, { pathname, contentType }) {
  if (storageKind() === 'file') {
    fs.mkdirSync(LOCAL_DIR, { recursive: true });
    const name = pathname.replace(/[^a-zA-Z0-9._-]/g, '_');
    fs.writeFileSync(path.join(LOCAL_DIR, name), buf);
    return { url: `/api/photos?file=${encodeURIComponent(name)}`, pathname: name, access: 'local' };
  }
  const { put } = await import('@vercel/blob');
  const options = { contentType, addRandomSuffix: true, cacheControlMaxAge: 60 * 60 * 24 * 365 };
  try {
    const blob = await put(pathname, buf, { ...options, access: 'public' });
    return { url: blob.url, pathname: blob.pathname, access: 'public' };
  } catch (err) {
    // Newer Blob stores can be private-only. Fall back and serve via /api/photos.
    const blob = await put(pathname, buf, { ...options, access: 'private' });
    return { url: blob.url, pathname: blob.pathname, access: 'private' };
  }
}

export async function removePhoto(photo) {
  if (!photo) return;
  if (photo.access === 'local') {
    try {
      fs.unlinkSync(path.join(LOCAL_DIR, photo.pathname));
    } catch {}
    return;
  }
  const { del } = await import('@vercel/blob');
  await del(photo.url);
}

// Streams a private blob or a local file back to the browser.
export async function servePhoto(photo) {
  const headers = { 'cache-control': 'public, max-age=31536000, s-maxage=31536000, immutable' };
  if (photo.access === 'local') {
    const buf = fs.readFileSync(path.join(LOCAL_DIR, photo.pathname));
    return new Response(buf, { headers: { ...headers, 'content-type': sniffImage(buf)?.type || 'application/octet-stream' } });
  }
  const { get } = await import('@vercel/blob');
  const result = await get(photo.pathname || photo.url, { access: 'private' });
  if (!result) return new Response('Not found', { status: 404 });
  return new Response(result.stream, {
    headers: { ...headers, 'content-type': result.blob?.contentType || 'image/jpeg' },
  });
}

export function serveLocalFile(name) {
  const safe = String(name).replace(/[^a-zA-Z0-9._-]/g, '_');
  const file = path.join(LOCAL_DIR, safe);
  if (!fs.existsSync(file)) return new Response('Not found', { status: 404 });
  const buf = fs.readFileSync(file);
  return new Response(buf, {
    headers: { 'content-type': sniffImage(buf)?.type || 'application/octet-stream', 'cache-control': 'public, max-age=3600' },
  });
}
