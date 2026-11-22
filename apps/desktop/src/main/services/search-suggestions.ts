import { net } from 'electron';
import type { SearchEngineId } from '../../shared/ipc-channels';

/**
 * Query suggestions from the chosen search engine, like the ones Google shows while you type.
 * Only the typed text goes out, to the engine you picked, without cookies. Off in Settings → Search Engine.
 */
const ENDPOINTS: Record<SearchEngineId, (q: string) => string> = {
  google: (q) => `https://suggestqueries.google.com/complete/search?client=firefox&q=${encodeURIComponent(q)}`,
  duckduckgo: (q) => `https://duckduckgo.com/ac/?type=list&q=${encodeURIComponent(q)}`,
  bing: (q) => `https://api.bing.com/osjson.aspx?query=${encodeURIComponent(q)}`,
  brave: (q) => `https://search.brave.com/api/suggest?q=${encodeURIComponent(q)}`,
};

const cache = new Map<string, string[]>();
const TIMEOUT_MS = 1800;

/** All four engines answer in the OpenSearch shape: [query, [suggestion, ...]]. */
export function parseSuggestions(body: unknown, limit = 6): string[] {
  if (!Array.isArray(body) || !Array.isArray(body[1])) return [];
  const out: string[] = [];
  for (const item of body[1]) {
    const text = typeof item === 'string' ? item : Array.isArray(item) && typeof item[0] === 'string' ? item[0] : '';
    const t = text.trim();
    if (t && t.length <= 200 && !out.includes(t)) out.push(t);
    if (out.length >= limit) break;
  }
  return out;
}

export async function fetchWebSuggestions(engine: SearchEngineId, query: string): Promise<string[]> {
  const q = query.trim();
  if (q.length < 1 || q.length > 120) return [];
  const key = `${engine}\u0000${q.toLowerCase()}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await net.fetch(ENDPOINTS[engine](q), { credentials: 'omit', signal: ctrl.signal, headers: { Accept: 'application/json' } });
    if (!res.ok) return [];
    const list = parseSuggestions(JSON.parse(await res.text()));
    if (cache.size > 200) cache.clear();
    cache.set(key, list);
    return list;
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}
