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
};

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
] as const satisfies readonly (keyof DashSettings)[];

/** Minutes of background inactivity before an eligible tab is put to sleep. */
export const SLEEP_THRESHOLD_MINUTES = 10;
