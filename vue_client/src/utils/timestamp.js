const TOKEN_RE = /YYYY|MM|DD|HH|mm|ss/g;

export function formatTimestamp(iso, fmt) {
  if (!iso || !fmt) return '';
  const d = new Date(iso);
  const tokens = {
    YYYY: String(d.getFullYear()),
    MM: String(d.getMonth() + 1).padStart(2, '0'),
    DD: String(d.getDate()).padStart(2, '0'),
    HH: String(d.getHours()).padStart(2, '0'),
    mm: String(d.getMinutes()).padStart(2, '0'),
    ss: String(d.getSeconds()).padStart(2, '0'),
  };
  return fmt.replace(TOKEN_RE, (t) => tokens[t]);
}

// SQLite's `datetime('now')` produces 'YYYY-MM-DD HH:MM:SS' with no timezone
// marker, so Date.parse() interprets it as local time on most browsers (UTC
// on a few) — which means for users east of UTC the rendered relative time
// is wrong, and clamps to "0s ago" once Math.max(0, …) bottoms out. We
// detect the absence of a TZ designator and explicitly mark these as UTC.
export function parseServerTimestamp(iso) {
  if (!iso) return NaN;
  const hasTz = /[zZ]|[+-]\d{2}:?\d{2}$/.test(iso);
  const normalized = hasTz ? iso : iso.replace(' ', 'T') + 'Z';
  return Date.parse(normalized);
}

// Render a server timestamp as a human relative phrase. Past renders as
// "Xs ago", future as "in Xs". Returns the raw string back if it doesn't
// parse, so callers can use it as a title/tooltip fallback.
export function formatRelative(iso) {
  if (!iso) return '';
  const t = parseServerTimestamp(iso);
  if (!Number.isFinite(t)) return iso;
  const diffMs = t - Date.now();
  const past = diffMs <= 0;
  const sec = Math.max(0, Math.round(Math.abs(diffMs) / 1000));
  const label = sec < 60 ? `${sec}s`
    : sec < 3600 ? `${Math.round(sec / 60)}m`
    : sec < 86400 ? `${Math.round(sec / 3600)}h`
    : `${Math.round(sec / 86400)}d`;
  return past ? `${label} ago` : `in ${label}`;
}

// Format an interval between two ISO timestamps for the back-from-away
// divider ("back (gone 1h 23m)"). Sub-minute durations round up to "1m"
// instead of showing "0m" since the divider would otherwise look broken on
// a fast away/back toggle.
export function formatDuration(fromIso, toIso) {
  if (!fromIso || !toIso) return '';
  const fromMs = Date.parse(fromIso);
  const toMs = Date.parse(toIso);
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs)) return '';
  const totalMin = Math.max(1, Math.round((toMs - fromMs) / 60000));
  const days = Math.floor(totalMin / 1440);
  const hours = Math.floor((totalMin % 1440) / 60);
  const mins = totalMin % 60;
  const parts = [];
  if (days) parts.push(`${days}d`);
  if (hours) parts.push(`${hours}h`);
  if (mins || parts.length === 0) parts.push(`${mins}m`);
  return parts.join(' ');
}
