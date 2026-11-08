/** Second-level suffixes where the registrable domain has three labels (co.uk, com.au, ...). Not the full Public Suffix List. */
const TWO_LEVEL_SUFFIXES = new Set([
  'co.uk', 'org.uk', 'ac.uk', 'gov.uk', 'com.au', 'net.au', 'org.au', 'co.nz', 'co.jp', 'ne.jp', 'or.jp',
  'com.br', 'com.cn', 'com.mx', 'com.tr', 'com.sg', 'com.hk', 'com.tw', 'co.in', 'co.kr', 'co.za', 'com.ar',
]);

/** Approximate registrable domain ("eTLD+1"): a.b.example.com -> example.com, x.example.co.uk -> example.co.uk. */
export function registrableDomain(hostname: string): string {
  const host = hostname.toLowerCase().replace(/\.$/, '');
  if (!host || /^[\d.]+$/.test(host) || host.includes(':')) return host; // IPs and IPv6 are their own site
  const labels = host.split('.');
  if (labels.length <= 2) return host;
  const lastTwo = labels.slice(-2).join('.');
  return TWO_LEVEL_SUFFIXES.has(lastTwo) ? labels.slice(-3).join('.') : lastTwo;
}

/** True when a request to `requestHost` made from a page on `topHost` is cross-site. Unknown top host counts as first-party. */
export function isThirdParty(requestHost: string, topHost: string): boolean {
  if (!requestHost || !topHost) return false;
  return registrableDomain(requestHost) !== registrableDomain(topHost);
}
