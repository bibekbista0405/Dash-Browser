import { SEARCH_ENGINES, type SearchEngineId } from './search';

const HAS_SCHEME = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//;
const DOMAIN = /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}(?::\d{1,5})?(?:[/?#].*)?$/;
const LOCALHOST = /^localhost(?::\d{1,5})?(?:[/?#].*)?$/i;
const IPV4 = /^(?:\d{1,3}\.){3}\d{1,3}(?::\d{1,5})?(?:[/?#].*)?$/;
const IPV6 = /^\[[0-9a-fA-F:]+\](?::\d{1,5})?(?:[/?#].*)?$/;

function isLocalOrIp(s: string): boolean {
  return LOCALHOST.test(s) || IPV4.test(s) || IPV6.test(s);
}

/**
 * Resolves whatever a user typed into the address bar into a concrete URL
 * to load: a real absolute URL as-is, a bare domain upgraded to https,
 * localhost / IP addresses (with optional port) over http, or a search query
 * sent to the configured engine. Pure function — no Electron, no DOM — so
 * every platform gets identical omnibox behavior.
 *
 * Inputs containing whitespace are always searches. `javascript:` / `data:`
 * and similar single-colon schemes are never navigated to from the address
 * bar; they become searches.
 */
export function resolveAddressBarInput(input: string, searchEngine: SearchEngineId): string {
  const trimmed = input.trim();

  if (trimmed === 'about:blank') return trimmed;
  if (/^view-source:https?:\/\//i.test(trimmed)) return trimmed;

  if (!/\s/.test(trimmed)) {
    if (HAS_SCHEME.test(trimmed)) return trimmed;
    if (isLocalOrIp(trimmed)) return `http://${trimmed}`;
    if (DOMAIN.test(trimmed)) return `https://${trimmed}`;
  }

  const engine = SEARCH_ENGINES[searchEngine];
  return engine.url.replace('%s', encodeURIComponent(trimmed));
}
