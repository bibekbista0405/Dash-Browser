import { SEARCH_ENGINES, type SearchEngineId } from './search';

/**
 * Resolves whatever a user typed into the address bar into a concrete URL
 * to load: a real absolute URL as-is, a bare domain upgraded to https, or a
 * search query sent to the configured engine. Pure function — no Electron,
 * no DOM — so every platform (desktop, Android, iOS) gets identical omnibox
 * behavior for free.
 */
export function resolveAddressBarInput(input: string, searchEngine: SearchEngineId): string {
  const trimmed = input.trim();

  const looksLikeUrl = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(trimmed);
  if (looksLikeUrl) return trimmed;

  const looksLikeDomain = /^[a-zA-Z0-9-]+\.[a-zA-Z]{2,}(\/.*)?$/.test(trimmed);
  if (looksLikeDomain) return `https://${trimmed}`;

  const engine = SEARCH_ENGINES[searchEngine];
  return engine.url.replace('%s', encodeURIComponent(trimmed));
}
