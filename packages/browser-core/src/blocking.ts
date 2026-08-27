export type BlockCategory = 'ad' | 'tracker';

/**
 * A curated starting list of widely-documented ad-serving and tracking
 * infrastructure domains. This is intentionally NOT a vendored copy of
 * EasyList or any other third-party filter list — those are separately
 * licensed, much larger datasets. This is real, working blocking logic
 * with real (if smaller) data behind it, architected so a genuine
 * filter-list format can be layered in later without changing the engine.
 * Every platform's network layer (Electron webRequest, Android WebView
 * shouldInterceptRequest, iOS WKContentRuleList) calls the same
 * `classifyHost` below so blocking behavior never drifts between platforms.
 */
export const BLOCKLIST_DOMAINS: Record<string, BlockCategory> = {
  // Ad serving / programmatic advertising
  'doubleclick.net': 'ad',
  'googlesyndication.com': 'ad',
  'googleadservices.com': 'ad',
  'adservice.google.com': 'ad',
  'adnxs.com': 'ad',
  'adsrvr.org': 'ad',
  'amazon-adsystem.com': 'ad',
  'rubiconproject.com': 'ad',
  'pubmatic.com': 'ad',
  'openx.net': 'ad',
  'casalemedia.com': 'ad',
  'media.net': 'ad',
  'yieldmo.com': 'ad',
  'contextweb.com': 'ad',
  'bluekai.com': 'ad',
  'criteo.com': 'ad',
  'taboola.com': 'ad',
  'outbrain.com': 'ad',
  'moatads.com': 'ad',
  'adroll.com': 'ad',
  'advertising.com': 'ad',
  'smartadserver.com': 'ad',
  '3lift.com': 'ad',
  'indexexchange.com': 'ad',
  'sharethrough.com': 'ad',

  // Analytics / behavioral tracking
  //
  // NOTE: connect.facebook.net is deliberately NOT in this list. It serves
  // Facebook's tracking pixel AND its Login SDK from the same domain —
  // blocking it breaks "Continue with/Log in with Facebook" buttons across
  // huge swaths of the web (confirmed by a real user report: TikTok's
  // Facebook login silently did nothing with this domain blocked). This is
  // a deliberate accuracy tradeoff, not an oversight: real functionality
  // wins over blocking a tracker that can't be cleanly separated from an
  // auth flow at the domain level.
  'google-analytics.com': 'tracker',
  'googletagmanager.com': 'tracker',
  'scorecardresearch.com': 'tracker',
  'quantserve.com': 'tracker',
  'hotjar.com': 'tracker',
  'mixpanel.com': 'tracker',
  'segment.io': 'tracker',
  'fullstory.com': 'tracker',
  'mouseflow.com': 'tracker',
  'doubleverify.com': 'tracker',
  'branch.io': 'tracker',
  'appsflyer.com': 'tracker',
  'adjust.com': 'tracker',
  'mc.yandex.ru': 'tracker',
  'clarity.ms': 'tracker',
  'crazyegg.com': 'tracker',
  'chartbeat.com': 'tracker',
  'exelator.com': 'tracker',
};

const BLOCKLIST_HOSTS = new Set(Object.keys(BLOCKLIST_DOMAINS));

/**
 * Matches exact host and any subdomain (e.g. "www.doubleclick.net" matches
 * the "doubleclick.net" entry), mirroring how real filter lists work.
 */
export function classifyHost(hostname: string): BlockCategory | null {
  const host = hostname.toLowerCase();
  if (BLOCKLIST_HOSTS.has(host)) return BLOCKLIST_DOMAINS[host];

  const parts = host.split('.');
  for (let i = 1; i < parts.length - 1; i++) {
    const candidate = parts.slice(i).join('.');
    if (BLOCKLIST_HOSTS.has(candidate)) return BLOCKLIST_DOMAINS[candidate];
  }
  return null;
}
