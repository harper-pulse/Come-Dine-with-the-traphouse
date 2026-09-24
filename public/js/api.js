// fetch wrapper that turns API errors into Error objects with a friendly message.
export async function request(method, url, { token, body, raw, headers = {} } = {}) {
  let res;
  try {
    res = await fetch(url, {
      method,
      cache: 'no-store',
      headers: {
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...headers,
      },
      body: raw ?? (body !== undefined ? JSON.stringify(body) : undefined),
    });
  } catch {
    throw Object.assign(new Error('No connection. Check your signal and try again.'), { code: 'offline', status: 0 });
  }
  let data = {};
  try {
    data = await res.json();
  } catch {}
  if (!res.ok) {
    throw Object.assign(new Error(data.message || `Something went wrong (${res.status}).`), { code: data.error, status: res.status });
  }
  return data;
}
