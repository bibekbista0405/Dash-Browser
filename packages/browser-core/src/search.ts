export const SEARCH_ENGINES = {
  duckduckgo: { label: 'DuckDuckGo', url: 'https://duckduckgo.com/?q=%s' },
  google: { label: 'Google', url: 'https://www.google.com/search?q=%s' },
  bing: { label: 'Bing', url: 'https://www.bing.com/search?q=%s' },
  brave: { label: 'Brave Search', url: 'https://search.brave.com/search?q=%s' },
} as const;

export type SearchEngineId = keyof typeof SEARCH_ENGINES;
