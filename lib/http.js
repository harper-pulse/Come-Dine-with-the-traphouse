// Tiny helpers for the Web-standard Request/Response handlers in /api.

export class HttpError extends Error {
  constructor(status, code, message) {
    super(message || code);
    this.status = status;
    this.code = code;
  }
}

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...headers,
    },
  });
}

export async function readJson(request, limit = 200_000) {
  const text = await request.text();
  if (text.length > limit) throw new HttpError(413, 'too_large', 'That request is too big.');
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(400, 'bad_json', 'Could not read that request.');
  }
}

export function bearer(request) {
  const header = request.headers.get('authorization') || '';
  return header.startsWith('Bearer ') ? header.slice(7).trim() : null;
}

export function clientIp(request) {
  const fwd = request.headers.get('x-forwarded-for') || '';
  return fwd.split(',')[0].trim() || request.headers.get('x-real-ip') || 'unknown';
}

export function queryParams(request) {
  return new URL(request.url).searchParams;
}

// Wraps a handler so thrown HttpErrors become tidy JSON responses.
export function handle(fn) {
  return async (request) => {
    try {
      return await fn(request);
    } catch (err) {
      if (err instanceof HttpError) {
        return json({ error: err.code, message: err.message }, err.status);
      }
      console.error(err);
      return json({ error: 'server_error', message: 'Something went wrong on the server. Try again in a sec.' }, 500);
    }
  };
}

export function str(value, max = 200) {
  if (value == null) return '';
  return String(value).replace(/\u0000/g, '').trim().slice(0, max);
}
