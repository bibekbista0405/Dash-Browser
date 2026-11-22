/**
 * Hostname handling for Website Lock. Matching is on whole DNS labels, never on string suffixes,
 * so protecting "bank.com" can never accidentally protect (or miss) "evilbank.com".
 */

/** Turns what a person typed (a URL or a bare host) into the host DASH protects, or null if it is not a website. */
export function normalizeHostname(input: string): string | null {
  let s = (input ?? '').trim().toLowerCase();
  if (!s || s.length > 300) return null;
  if (!/^[a-z][a-z0-9+.-]*:\/\//.test(s)) s = `https://${s}`;
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    return null;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  let host = u.hostname.replace(/\.$/, '');
  if (!host) return null;
  // "www.example.com" and "example.com" are the same website to everyone; store one form.
  if (host.startsWith('www.') && host.length > 4) host = host.slice(4);
  if (!host.includes('.') && host !== 'localhost' && !host.startsWith('[')) return null;
  return host;
}

export interface HostRule {
  hostname: string;
  includeSubdomains: boolean;
}

/** Exact host (plus its `www.` form); with `includeSubdomains`, also any host that ends in ".<hostname>". */
export function hostMatches(rule: HostRule, host: string): boolean {
  const h = host.toLowerCase().replace(/\.$/, '');
  if (h === rule.hostname || h === `www.${rule.hostname}`) return true;
  return rule.includeSubdomains && h.endsWith(`.${rule.hostname}`);
}

/** Host of an http(s) URL, or null for anything else (internal pages, data:, about:blank...). */
export function webHostOf(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return u.hostname.toLowerCase().replace(/\.$/, '') || null;
  } catch {
    return null;
  }
}
