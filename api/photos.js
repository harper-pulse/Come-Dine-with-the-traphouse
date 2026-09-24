// GET    /api/photos?id=<id>    -> serves a private or local photo
// POST   /api/photos?nightId=.. -> upload a food photo (raw image body)
// DELETE /api/photos?id=<id>    -> remove a photo (your own, or any as organiser)
import { handle, json, HttpError, queryParams, bearer, str } from '../lib/http.js';
import { loadAll, commit, toJson, K, publicPhoto } from '../lib/data.js';
import { readToken, requireAdmin, requireTeam, newId } from '../lib/auth.js';
import { storageKind, pipeline, parseJson } from '../lib/store.js';
import { photosEnabled, sniffImage, storePhoto, removePhoto, servePhoto, serveLocalFile } from '../lib/photos.js';

const MAX_BYTES = 4 * 1024 * 1024;

function who(request, data) {
  const payload = readToken(bearer(request));
  if (payload?.r === 'admin') {
    requireAdmin(request, data.secrets);
    return { admin: true, teamId: null };
  }
  return { admin: false, teamId: requireTeam(request, data.secrets) };
}

export const GET = handle(async (request) => {
  const params = queryParams(request);
  if (params.get('file') && storageKind() === 'file') return serveLocalFile(params.get('file'));
  const id = params.get('id');
  if (!id) throw new HttpError(400, 'no_id', 'Which photo?');
  const [raw] = await pipeline([['HGET', K.photos, id]]);
  const photo = parseJson(raw);
  if (!photo) return new Response('Not found', { status: 404 });
  if (photo.access === 'public') return Response.redirect(photo.url, 302);
  return servePhoto(photo);
});

export const POST = handle(async (request) => {
  if (!photosEnabled()) throw new HttpError(409, 'photos_off', 'Photos are switched off. The organiser needs to connect a Vercel Blob store.');
  const data = await loadAll();
  if (!data.config) throw new HttpError(409, 'not_setup', 'The portal has not been set up yet.');
  const { teamId, admin } = who(request, data);
  const params = queryParams(request);
  const night = data.config.nights.find((n) => n.id === params.get('nightId'));
  if (!night) throw new HttpError(400, 'no_night', 'Pick which night the photo is from.');

  const buf = Buffer.from(await request.arrayBuffer());
  if (!buf.length) throw new HttpError(400, 'empty', 'That photo was empty.');
  if (buf.length > MAX_BYTES) throw new HttpError(413, 'too_large', 'That photo is too big (4 MB max).');
  const kind = sniffImage(buf);
  if (!kind) throw new HttpError(415, 'not_image', 'Only JPG, PNG or WebP photos please.');

  const id = newId('p');
  const stored = await storePhoto(buf, { pathname: `cdwm/${night.id}/${id}.${kind.ext}`, contentType: kind.type });
  const photo = {
    id,
    ...stored,
    nightId: night.id,
    teamId: admin ? null : teamId,
    caption: str(params.get('caption'), 120),
    w: Number(params.get('w')) || null,
    h: Number(params.get('h')) || null,
    createdAt: new Date().toISOString(),
  };
  const v = await commit([['HSET', K.photos, id, toJson(photo)]]);
  return json({ ok: true, v, photo: publicPhoto(photo) });
});

export const DELETE = handle(async (request) => {
  const data = await loadAll();
  const { teamId, admin } = who(request, data);
  const id = queryParams(request).get('id');
  const photo = data.photos[id];
  if (!photo) throw new HttpError(404, 'no_photo', 'That photo is already gone.');
  if (!admin && photo.teamId !== teamId) throw new HttpError(403, 'not_yours', 'You can only delete photos your team uploaded.');
  try {
    await removePhoto(photo);
  } catch (err) {
    console.error('photo delete failed', err);
  }
  const v = await commit([['HDEL', K.photos, id]]);
  return json({ ok: true, v });
});
