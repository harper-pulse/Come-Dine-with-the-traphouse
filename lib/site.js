// The site's public address. On Vercel this is the project's production
// domain, which anyone can open. Each deployment's own long address can sit
// behind Vercel's login screen, so invite links and calendar links always use
// this one. Empty when running locally.
export function publicSiteUrl() {
  const host = String(process.env.VERCEL_PROJECT_PRODUCTION_URL || '')
    .replace(/^https?:\/\//, '')
    .replace(/\/+$/, '');
  return host ? `https://${host}` : '';
}

// How teams log in: 'names' (tap your name, the default) or 'code' (tap your
// name, then type the team's code).
export function loginMode(config) {
  return config?.event?.login === 'code' ? 'code' : 'names';
}
