/** Minimal WHATWG URL surface (present in Node, Electron and every browser); core has no DOM/Node typings. */
declare class URL {
  constructor(input: string);
  protocol: string;
  search: string;
  searchParams: { keys(): IterableIterator<string>; delete(name: string): void };
  toString(): string;
}

/**
 * Query parameters whose only job is cross-site / cross-campaign tracking. Conservative on purpose:
 * generic names like `ref`, `source`, `id` or `s` are NOT listed because real sites use them for content.
 */
const EXACT_PARAMS = new Set([
  'fbclid', 'gclid', 'gclsrc', 'dclid', 'gbraid', 'wbraid', 'msclkid', 'yclid', 'twclid', 'ttclid', 'li_fat_id',
  'igshid', 'igsh', 'mc_eid', 'mc_cid', '_hsenc', '_hsmi', '__hssc', '__hstc', '__hsfp', 'hsctatracking',
  'mkt_tok', 'vero_id', 'vero_conv', 'oly_enc_id', 'oly_anon_id', '_openstat', 'wickedid', 'rb_clickid',
  's_cid', 'ml_subscriber', 'ml_subscriber_hash', 'sc_cid', 'epik', 'ScCid', '__s', 'cmpid',
]);
const PREFIXES = ['utm_', 'pk_', 'mtm_', 'matomo_', 'hsa_'];

/** True for http(s) URLs only; everything else is returned untouched. */
export function stripTrackingParams(rawUrl: string): string {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return rawUrl;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return rawUrl;
  if (!url.search) return rawUrl;

  let changed = false;
  for (const key of [...url.searchParams.keys()]) {
    const lower = key.toLowerCase();
    if (EXACT_PARAMS.has(key) || EXACT_PARAMS.has(lower) || PREFIXES.some((p) => lower.startsWith(p))) {
      url.searchParams.delete(key);
      changed = true;
    }
  }
  return changed ? url.toString() : rawUrl;
}
