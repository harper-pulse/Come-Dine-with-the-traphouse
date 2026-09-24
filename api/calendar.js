// GET /api/calendar[?night=<id>] -> .ics file so people can add dinners to
// Apple Calendar, Outlook and friends. Only public details (suburb, not the
// full address) go in the invite.
import { handle, HttpError, queryParams } from '../lib/http.js';
import { loadAll, buildPublicState } from '../lib/data.js';

function esc(text) {
  return String(text || '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

function icsDate(ms) {
  return new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

function fold(line) {
  const out = [];
  let rest = line;
  while (rest.length > 73) {
    out.push(rest.slice(0, 73));
    rest = ` ${rest.slice(73)}`;
  }
  out.push(rest);
  return out.join('\r\n');
}

export const GET = handle(async (request) => {
  const data = await loadAll();
  if (!data.config) throw new HttpError(404, 'not_setup', 'Not set up yet.');
  const state = buildPublicState(data);
  const nightId = queryParams(request).get('night');
  const nights = state.nights.filter((n) => n.startsAt && (!nightId || n.id === nightId));
  if (!nights.length) throw new HttpError(404, 'no_dates', 'No dates set yet.');
  const origin = new URL(request.url).origin;
  const host = new URL(origin).hostname;

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Come Dine With The Traphouse//Portal//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${esc(state.event.name)}`,
  ];
  for (const n of nights) {
    const team = state.teams.find((t) => t.id === n.hostTeamId);
    const members = (team?.members || []).map((m) => m.name).join(' & ');
    const start = Date.parse(n.startsAt);
    const details = [
      `Hosted by ${team?.name || 'TBC'}${members ? ` (${members})` : ''}.`,
      n.theme ? `Theme: ${n.theme}.` : '',
      n.dressCode ? `Dress code: ${n.dressCode}.` : '',
      `Address, menu and scorecards: ${origin}/#/night/${n.id}`,
    ].filter(Boolean).join(' ');
    lines.push(
      'BEGIN:VEVENT',
      `UID:cdwm-${n.id}@${host}`,
      `DTSTAMP:${icsDate(Date.now())}`,
      `DTSTART:${icsDate(start)}`,
      `DTEND:${icsDate(start + 4 * 3600e3)}`,
      fold(`SUMMARY:${esc(`${state.event.name}: Night ${n.number} at ${team?.name || 'TBC'}`)}`),
      fold(`DESCRIPTION:${esc(details)}`),
      fold(`LOCATION:${esc(n.suburb)}`),
      `URL:${origin}/#/night/${n.id}`,
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      'TRIGGER:-PT3H',
      fold(`DESCRIPTION:${esc(`Night ${n.number} of ${state.event.name} starts in 3 hours`)}`),
      'END:VALARM',
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  const filename = nightId ? `come-dine-night-${nights[0].number}.ics` : 'come-dine-with-the-traphouse.ics';
  return new Response(lines.join('\r\n') + '\r\n', {
    headers: {
      'content-type': 'text/calendar; charset=utf-8',
      'content-disposition': `inline; filename="${filename}"`,
      'cache-control': 'no-store',
    },
  });
});
