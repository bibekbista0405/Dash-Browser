import type { SearchEngineId } from './search';

export type ThemeMode = 'dark' | 'light' | 'system';
export type StartupBehavior = 'homepage' | 'restore';

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
};

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
] as const satisfies readonly (keyof DashSettings)[];

/** Minutes of background inactivity before an eligible tab is put to sleep. */
export const SLEEP_THRESHOLD_MINUTES = 10;

/** Sentinel URL representing DASH's own New Tab Page — never a real network address. Shared so the renderer can recognize it too, without duplicating the literal string. */
export const NEW_TAB_URL = 'dash://newtab';
