/**
 * Public web of the platform, derived from the backoffice host: «grcup-qa-bo.example.com» → «grcup-qa.example.com»,
 * «bo.example.com» → «example.com», localhost:4300 → localhost:4200. One place instead of hard-coded URLs.
 */
export function webPublica(): string {
  if (typeof location === 'undefined') return '';
  const { protocol, hostname, port } = location;
  if (hostname === 'localhost' || hostname === '127.0.0.1') return `${protocol}//${hostname}:${port === '4300' ? '4200' : port}`;
  const host = hostname.startsWith('bo.') ? hostname.slice(3) : hostname.replace(/-bo\./, '.');
  return `${protocol}//${host}`;
}
