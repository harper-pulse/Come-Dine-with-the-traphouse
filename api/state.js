// GET /api/state?v=<version> -> the public view of the whole event.
// Responses for a given version never change, so the CDN can cache them.
import { handle, json, queryParams } from '../lib/http.js';
import { loadAll, buildPublicState } from '../lib/data.js';
import { storageKind } from '../lib/store.js';

export const GET = handle(async (request) => {
  if (storageKind() === 'none') {
    return json({ setup: false, storage: 'none', error: 'storage_missing' }, 503);
  }
  const state = buildPublicState(await loadAll());
  const requested = Number(queryParams(request).get('v'));
  const cacheable = Number.isFinite(requested) && requested > 0 && state.v >= requested;
  return json(state, 200, {
    'cache-control': cacheable ? 'public, max-age=0, s-maxage=86400' : 'no-store',
  });
});
