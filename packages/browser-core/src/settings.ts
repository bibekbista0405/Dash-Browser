import type { SearchEngineId } from './search';

export type ThemeMode = 'dark' | 'light' | 'system';
export type StartupBehavior = 'homepage' | 'restore';
export type DohMode = 'off' | 'automatic' | 'secure';
export type DohProvider = 'cloudflare' | 'quad9' | 'google' | 'mullvad';

/** DNS-over-HTTPS resolvers DASH can use. Chosen from well-known public resolvers; no custom URLs so a renderer can't point DNS at an arbitrary server. */
export const DOH_PROVIDERS: Record<DohProvider, { name: string; url: string }> = {
  cloudflare: { name: 'Cloudflare', url: 'https://cloudflare-dns.com/dns-query' },
  quad9: { name: 'Quad9', url: 'https://dns.quad9.net/dns-query' },
  google: { name: 'Google', url: 'https://dns.google/dns-query' },
  mullvad: { name: 'Mullvad', url: 'https://base.dns.mullvad.net/dns-query' },
};

export interface DashSettings {
  searchEngine: SearchEngineId;
  homepage: string;
  theme: ThemeMode;
  startupBehavior: StartupBehavior;
  sleepingTabsEnabled: boolean;
  adBlockingEnabled: boolean;
  trackerBlockingEnabled: boolean;
  httpsOnlyMode: boolean;
  showBookmarksBar: boolean;
  sendPrivacySignals: boolean;
  blockThirdPartyCookies: boolean;
  /** Remove known tracking parameters (utm_*, fbclid, gclid…) from links before loading. */
  stripTrackingParams: boolean;
  /** Delete browsing history when DASH quits. */
  clearHistoryOnExit: boolean;
  /** Delete cookies, site storage and cache when DASH quits. */
  clearSiteDataOnExit: boolean;
  /** Hide/normalise canvas, audio and hardware details sites use to recognise you without cookies. */
  fingerprintProtection: boolean;
  /** Sites whose tabs never go to sleep (one per line). */
  neverSleepHosts: string;
  /** Sites where ad and tracker blocking is switched off (one per line). */
  blockingOffHosts: string;
  /** Sites whose cookies/data survive "clear on exit" (one per line). */
  keepSiteDataHosts: string;
  dohMode: DohMode;
  dohProvider: DohProvider;
  /** User-written CSS applied on top of the New Tab Page (only when enabled). */
  newTabCustomCss: string;
  newTabCustomCssEnabled: boolean;
  /** User-written CSS applied to the whole browser UI (toolbar, tabs, menus, internal pages) when enabled. */
  appCustomCss: string;
  appCustomCssEnabled: boolean;
}

export const DEFAULT_SETTINGS: DashSettings = {
  searchEngine: 'duckduckgo',
  homepage: 'https://duckduckgo.com',
  theme: 'dark',
  startupBehavior: 'homepage',
  sleepingTabsEnabled: true,
  adBlockingEnabled: true,
  trackerBlockingEnabled: true,
  httpsOnlyMode: false,
  showBookmarksBar: true,
  sendPrivacySignals: true,
  blockThirdPartyCookies: false,
  stripTrackingParams: true,
  clearHistoryOnExit: false,
  clearSiteDataOnExit: false,
  fingerprintProtection: true,
  neverSleepHosts: '',
  blockingOffHosts: '',
  keepSiteDataHosts: '',
  dohMode: 'off',
  dohProvider: 'cloudflare',
  newTabCustomCss: '',
  newTabCustomCssEnabled: false,
  appCustomCss: '',
  appCustomCssEnabled: false,
};

/** Hard cap on the custom New Tab CSS, in characters. */
export const NEWTAB_CSS_MAX_LENGTH = 60000;

/** Hard cap on the browser-UI custom CSS, in characters. */
export const APP_CSS_MAX_LENGTH = 60000;

/** Max length of the one-site-per-line list settings. */
export const HOST_LIST_MAX_LENGTH = 4000;

/** Height in px of the optional bookmarks bar under the address bar. */
export const BOOKMARKS_BAR_HEIGHT = 32;

/** Every key a platform's settings-set handler must accept and validate. */
export const SETTINGS_KEYS = [
  'searchEngine',
  'homepage',
  'theme',
  'startupBehavior',
  'sleepingTabsEnabled',
  'adBlockingEnabled',
  'trackerBlockingEnabled',
  'httpsOnlyMode',
  'showBookmarksBar',
  'sendPrivacySignals',
  'blockThirdPartyCookies',
  'stripTrackingParams',
  'clearHistoryOnExit',
  'clearSiteDataOnExit',
  'fingerprintProtection',
  'neverSleepHosts',
  'blockingOffHosts',
  'keepSiteDataHosts',
  'dohMode',
  'dohProvider',
  'newTabCustomCss',
  'newTabCustomCssEnabled',
  'appCustomCss',
  'appCustomCssEnabled',
] as const satisfies readonly (keyof DashSettings)[];

/** Minutes of background inactivity before an eligible tab is put to sleep. */
export const SLEEP_THRESHOLD_MINUTES = 10;

/** Sentinel URL representing DASH's own New Tab Page — never a real network address. Shared so the renderer can recognize it too, without duplicating the literal string. */
export const NEW_TAB_URL = 'dash://newtab';
