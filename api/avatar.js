// GTA portraits.
//
// GET    /api/avatar?id=<key>&h=<hash>              -> a saved portrait image
// POST   /api/avatar?action=generate&target=<t>     -> photo in, GTA artwork out (not saved yet)
// POST   /api/avatar?action=save&target=<t>         -> saves the final image as the portrait
//                                                      (raw image, or multipart "image" + "thumb")
// DELETE /api/avatar?target=<t>                     -> removes the custom portrait
//
// <t> is "team" for the team portrait, or a member id for one player.
// Teams use their own login. The organiser can act for any team by adding
// &teamId=<id> with the organiser login.
import crypto from 'node:crypto';
import { handle, json, HttpError, queryParams, bearer } from '../lib/http.js';
import { loadAll, commit, toJson, K } from '../lib/data.js';
import { readToken, requireAdmin, requireTeam } from '../lib/auth.js';
import { pipeline, parseJson, storageKind } from '../lib/store.js';
import { sniffImage } from '../lib/photos.js';
import { aiMode, aiLimit } from '../lib/ai-mode.js';

const MAX_UPLOAD = 4 * 1024 * 1024;
const MAX_SAVE = 700 * 1024;
const MAX_THUMB = 120 * 1024;

async function context(request) {
  if (storageKind() === 'none') throw new HttpError(503, 'storage_missing', 'No database connected yet.');
  const data = await loadAll();
  if (!data.config) throw new HttpError(409, 'not_setup', 'The portal has not been set up yet.');
  const params = queryParams(request);
  const payload = readToken(bearer(request));
  let teamId;
  let admin = false;
  if (payload?.r === 'admin') {
    requireAdmin(request, data.secrets);
    admin = true;
    teamId = params.get('teamId');
  } else {
    teamId = requireTeam(request, data.secrets);
  }
  if (!data.config.teams.some((t) => t.id === teamId)) throw new HttpError(404, 'no_team', 'No such team.');
  const profile = data.profiles[teamId] || { members: [] };
  const target = params.get('target') || 'team';
  if (target !== 'team' && !(profile.members || []).some((m) => m.id === target)) {
    throw new HttpError(400, 'bad_target', 'That player is not on this team.');
  }
  return { data, params, teamId, profile, target, admin };
}

function checkImage(buf, max) {
  if (!buf.length) throw new HttpError(400, 'empty', 'That photo was empty.');
  if (buf.length > max) throw new HttpError(413, 'too_large', 'That image is too big.');
  const kind = sniffImage(buf);
  if (!kind) throw new HttpError(415, 'not_image', 'Only JPG, PNG or WebP images please.');
  return { buf, kind };
}

async function readImage(request, max) {
  return checkImage(Buffer.from(await request.arrayBuffer()), max);
}

// The portrait, plus the small copy for badges when the phone sends one.
async function readPortrait(request) {
  if (!(request.headers.get('content-type') || '').startsWith('multipart/form-data')) {
    return { image: await readImage(request, MAX_SAVE), thumb: null };
  }
  let form;
  try {
    form = await request.formData();
  } catch {
    throw new HttpError(400, 'bad_upload', 'That upload didn’t come through. Try again.');
  }
  const bytes = async (file) => Buffer.from(typeof file?.arrayBuffer === 'function' ? await file.arrayBuffer() : new ArrayBuffer(0));
  const image = checkImage(await bytes(form.get('image')), MAX_SAVE);
  const thumb = form.get('thumb') ? checkImage(await bytes(form.get('thumb')), MAX_THUMB) : null;
  return { image, thumb };
}

const storageKey = (teamId, target) => (target === 'team' ? `team:${teamId}` : `member:${target}`);

function stored({ buf, kind }, key) {
  const hash = crypto.createHash('sha256').update(buf).digest('hex').slice(0, 12);
  return {
    url: `/api/avatar?id=${encodeURIComponent(key)}&h=${hash}`,
    json: toJson({ mediaType: kind.type, data: buf.toString('base64'), hash }),
  };
}

export const GET = handle(async (request) => {
  const id = queryParams(request).get('id');
  if (!id) throw new HttpError(400, 'no_id', 'Which portrait?');
  const [raw] = await pipeline([['HGET', K.avatars, id]]);
  const stored = parseJson(raw);
  if (!stored?.data) return new Response('Not found', { status: 404 });
  return new Response(Buffer.from(stored.data, 'base64'), {
    headers: {
      'content-type': stored.mediaType || 'image/jpeg',
      'cache-control': 'public, max-age=31536000, s-maxage=31536000, immutable',
    },
  });
});

export const POST = handle(async (request) => {
  const ctx = await context(request);
  const action = ctx.params.get('action');

  if (action === 'generate') {
    const mode = aiMode();
    if (mode === 'off') throw new HttpError(409, 'ai_off', 'AI portraits aren’t switched on here. You can still upload a finished portrait and use it as is.');
    const limit = aiLimit();
    const used = Number(ctx.data.avatarUsage?.[ctx.teamId] || 0);
    if (!ctx.admin && used >= limit) {
      throw new HttpError(429, 'no_goes', `Your team has used all ${limit} AI goes. Ask the organiser for more.`);
    }
    const { buf, kind } = await readImage(request, MAX_UPLOAD);
    // Count the go up front so rapid taps can't dodge the cap; refunded on failure.
    const [count] = await pipeline([['HINCRBY', K.avatarUsage, ctx.teamId, 1]]);
    const { gtaify } = await import('../lib/gta-art.js');
    try {
      const art = await gtaify({ photo: buf, mediaType: kind.type, kind: ctx.target === 'team' ? 'duo' : 'solo' });
      return new Response(art.data, {
        headers: {
          'content-type': art.mediaType || 'image/png',
          'cache-control': 'no-store',
          'x-ai-goes-left': String(Math.max(0, limit - Number(count))),
          'x-ai-model': art.model || '',
        },
      });
    } catch (err) {
      await pipeline([['HINCRBY', K.avatarUsage, ctx.teamId, -1]]);
      throw new HttpError(502, 'ai_failed', err.friendly || 'The AI could not draw that one. Try again.');
    }
  }

  if (action === 'save') {
    const upload = await readPortrait(request);
    const key = storageKey(ctx.teamId, ctx.target);
    const image = stored(upload.image, key);
    const thumb = upload.thumb ? stored(upload.thumb, `${key}:thumb`) : null;
    const profile = { ...ctx.profile, members: (ctx.profile.members || []).map((m) => ({ ...m })) };
    if (ctx.target === 'team') {
      profile.portrait = { url: image.url, thumb: thumb?.url || '', updatedAt: new Date().toISOString() };
    } else {
      const m = profile.members.find((x) => x.id === ctx.target);
      m.avatarUrl = image.url;
      m.avatarThumb = thumb?.url || '';
      m.avatar = 'custom';
    }
    const v = await commit([
      ['HSET', K.avatars, key, image.json],
      // No thumb sent: drop the old one so it can't show the previous portrait.
      thumb ? ['HSET', K.avatars, `${key}:thumb`, thumb.json] : ['HDEL', K.avatars, `${key}:thumb`],
      ['HSET', K.profiles, ctx.teamId, toJson(profile)],
    ]);
    return json({ ok: true, v, url: image.url, thumb: thumb?.url || '' });
  }

  throw new HttpError(400, 'bad_action', 'Unknown action.');
});

export const DELETE = handle(async (request) => {
  const ctx = await context(request);
  const profile = { ...ctx.profile, members: (ctx.profile.members || []).map((m) => ({ ...m })) };
  if (ctx.target === 'team') {
    delete profile.portrait;
  } else {
    const m = profile.members.find((x) => x.id === ctx.target);
    delete m.avatarUrl;
    delete m.avatarThumb;
    if (m.avatar === 'custom') m.avatar = '';
  }
  const key = storageKey(ctx.teamId, ctx.target);
  const v = await commit([
    ['HDEL', K.avatars, key, `${key}:thumb`],
    ['HSET', K.profiles, ctx.teamId, toJson(profile)],
  ]);
  return json({ ok: true, v });
});
