// Formatting and browser helpers.
import { utcToZoned } from './shared/core.js';

export function fmt(iso, timeZone, opts) {
  if (!iso) return '';
  try {
    return new Intl.DateTimeFormat('en-NZ', { timeZone, ...opts }).format(new Date(iso));
  } catch {
    return new Date(iso).toLocaleString();
  }
}

// "Sat 3 Oct"
export function fmtDay(iso, timeZone) {
  if (!iso) return 'Date TBC';
  return fmt(iso, timeZone, { weekday: 'short', day: 'numeric', month: 'short' }).replace(',', '');
}

// "Saturday 3 October"
export function fmtDayLong(iso, timeZone) {
  if (!iso) return 'Date TBC';
  return fmt(iso, timeZone, { weekday: 'long', day: 'numeric', month: 'long' }).replace(',', '');
}

// "6:30pm"
export function fmtTime(iso, timeZone) {
  if (!iso) return '';
  return fmt(iso, timeZone, { hour: 'numeric', minute: '2-digit', hour12: true }).replace(/\s/g, '').toLowerCase();
}

export function fmtWhen(iso, timeZone) {
  if (!iso) return 'Date TBC';
  return `${fmtDay(iso, timeZone)}, ${fmtTime(iso, timeZone)}`;
}

export function isToday(iso, timeZone, now = Date.now()) {
  if (!iso) return false;
  return utcToZoned(iso, timeZone).date === utcToZoned(new Date(now).toISOString(), timeZone).date;
}

export function ordinal(n) {
  if (n == null) return '';
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
}

export function num(n, dp = 2) {
  if (n == null || !Number.isFinite(n)) return '-';
  return Number(n.toFixed(dp)).toString();
}

export function plural(n, word, many = `${word}s`) {
  return `${n} ${n === 1 ? word : many}`;
}

export function initials(name) {
  return String(name || '?')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');
}

export function memberNames(team) {
  return (team?.members || []).map((m) => m.name).filter(Boolean).join(' & ');
}

export function mapsUrl(address) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}

export function googleCalendarUrl({ title, startsAt, hours = 4, details = '', location = '' }) {
  const toG = (ms) => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const start = Date.parse(startsAt);
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: title,
    dates: `${toG(start)}/${toG(start + hours * 3600e3)}`,
    details,
    location,
  });
  return `https://calendar.google.com/calendar/render?${params}`;
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {}
    ta.remove();
    return ok;
  }
}

// Opens the phone's share sheet, or copies to the clipboard on desktop.
export async function shareText({ title, text, url }) {
  if (navigator.share) {
    try {
      await navigator.share({ title, text, url });
      return 'shared';
    } catch (err) {
      if (err?.name === 'AbortError') return 'cancelled';
    }
  }
  const ok = await copyText([text, url].filter(Boolean).join('\n'));
  return ok ? 'copied' : 'failed';
}

export function download(filename, content, type = 'application/octet-stream') {
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

// Shrinks a phone photo to something sensible before upload.
export async function compressImage(file, max = 1600, quality = 0.82) {
  let source = null;
  let w = 0;
  let h = 0;
  try {
    source = await createImageBitmap(file, { imageOrientation: 'from-image' });
    w = source.width;
    h = source.height;
  } catch {
    const url = URL.createObjectURL(file);
    try {
      source = await loadImage(url);
      w = source.naturalWidth;
      h = source.naturalHeight;
    } finally {
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  }
  const scale = Math.min(1, max / Math.max(w, h));
  const cw = Math.max(1, Math.round(w * scale));
  const ch = Math.max(1, Math.round(h * scale));
  const canvas = document.createElement('canvas');
  canvas.width = cw;
  canvas.height = ch;
  canvas.getContext('2d').drawImage(source, 0, 0, cw, ch);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
  if (!blob) throw new Error('Could not read that photo.');
  return { blob, w: cw, h: ch };
}

export function siteUrl() {
  return `${location.origin}${location.pathname}`;
}

export function joinLink(code) {
  return `${siteUrl()}#/join/${code}`;
}

export function csvCell(v) {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
