// GET /api/version -> { v } . Phones poll this cheaply (it is edge cached for
// 2 seconds) and only download the full state when the number changes.
import { handle, json } from '../lib/http.js';
import { loadVersion } from '../lib/data.js';
import { storageKind } from '../lib/store.js';

export const GET = handle(async () => {
  if (storageKind() === 'none') {
    return json({ ok: false, error: 'storage_missing' }, 503);
  }
  const v = await loadVersion();
  return json({ ok: true, v }, 200, {
    'cache-control': 'public, max-age=0, s-maxage=2, stale-while-revalidate=2',
  });
});
