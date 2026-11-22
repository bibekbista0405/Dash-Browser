const MAX_HOSTS = 100;

/**
 * Parses a user-typed list of sites (one per line or comma/space separated) into clean lowercase hostnames.
 * Accepts full URLs or bare hosts; drops anything that is not a plausible hostname; de-duplicates.
 */
export function parseHostList(text: string): string[] {
  const out: string[] = [];
  for (const raw of text.split(/[\s,;]+/)) {
    let h = raw.trim().toLowerCase();
    if (!h) continue;
    h = h.replace(/^[a-z][a-z0-9+.-]*:\/\//, '').replace(/[/?#].*$/, '').replace(/:\d+$/, '').replace(/^\*?\./, '').replace(/^www\./, '');
    if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/.test(h) || h.length > 253) continue;
    if (!out.includes(h)) out.push(h);
    if (out.length >= MAX_HOSTS) break;
  }
  return out;
}

/** True when `host` is one of the listed hosts or a subdomain of one (www. is ignored). */
export function hostInList(host: string, list: readonly string[]): boolean {
  const h = host.toLowerCase().replace(/^\./, '').replace(/^www\./, '');
  return list.some((l) => h === l || h.endsWith('.' + l));
}
