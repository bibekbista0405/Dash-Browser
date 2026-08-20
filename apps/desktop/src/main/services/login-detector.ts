import type { Session } from 'electron';

export interface DetectedLogin {
  origin: string;
  username: string;
  password: string;
  webContentsId: number | undefined;
}

const PASSWORD_FIELD_HINTS = ['password', 'pass', 'pwd'];
const USERNAME_FIELD_HINTS = ['email', 'user', 'login', 'account'];
const MAX_BODY_BYTES = 64 * 1024; // ignore anything larger — real login bodies are tiny
const MAX_JSON_DEPTH = 2; // shallow only, to avoid pathological/huge structures and false positives

/**
 * Watches real outgoing POST bodies (via Electron's webRequest.uploadData,
 * available on the actual network request — not a DOM content script) for
 * likely login submissions, and reports a real {username, password} pair
 * when one is found. Handles two real-world shapes:
 *
 * 1. Classic HTML form POSTs (`application/x-www-form-urlencoded`).
 * 2. JS `fetch`/XHR JSON POSTs (`application/json`) — scanned shallowly
 *    (top level + one level of nesting, e.g. `{user: {email, password}}`)
 *    for keys matching the same hints as the form case.
 *
 * Honest limitation: this is still heuristic field-name matching, not a
 * real understanding of the page. Sites with unusual field names, GraphQL
 * mutations with nested variables beyond MAX_JSON_DEPTH, or logins sent as
 * something other than a POST body (rare) won't be caught. That's a
 * reasonable tradeoff — going further risks false positives (prompting to
 * "save a password" for unrelated form data), which is worse than an
 * occasional missed prompt.
 */
export class LoginDetector {
  constructor(session: Session, onDetected: (login: DetectedLogin) => void) {
    session.webRequest.onBeforeSendHeaders({ urls: ['<all_urls>'] }, (details, callback) => {
      callback({ requestHeaders: details.requestHeaders });

      if (details.method !== 'POST' || !details.uploadData) return;
      const contentTypeHeader = Object.entries(details.requestHeaders ?? {}).find(
        ([k]) => k.toLowerCase() === 'content-type'
      );
      const contentType = (contentTypeHeader?.[1] ?? '').toLowerCase();

      const bodyText = details.uploadData
        .filter((chunk) => chunk.bytes)
        .map((chunk) => chunk.bytes!.toString('utf-8'))
        .join('');
      if (!bodyText || bodyText.length > MAX_BODY_BYTES) return;

      let pair: { username: string; password: string } | null = null;
      if (contentType.includes('application/x-www-form-urlencoded')) {
        pair = extractFromFormBody(bodyText);
      } else if (contentType.includes('application/json')) {
        pair = extractFromJsonBody(bodyText);
      }
      if (!pair) return;

      try {
        const origin = new URL(details.url).origin;
        onDetected({ origin, username: pair.username, password: pair.password, webContentsId: details.webContentsId });
      } catch {
        // Malformed URL — skip silently rather than throw inside a webRequest handler.
      }
    });
  }
}

function scanEntries(entries: Iterable<[string, string]>): { username: string; password: string } | null {
  let username: string | null = null;
  let password: string | null = null;
  for (const [key, value] of entries) {
    if (!value) continue;
    const lowerKey = key.toLowerCase();
    if (!password && PASSWORD_FIELD_HINTS.some((hint) => lowerKey.includes(hint))) {
      password = value;
    } else if (!username && USERNAME_FIELD_HINTS.some((hint) => lowerKey.includes(hint))) {
      username = value;
    }
  }
  return username && password ? { username, password } : null;
}

function extractFromFormBody(bodyText: string): { username: string; password: string } | null {
  try {
    return scanEntries(new URLSearchParams(bodyText).entries());
  } catch {
    return null;
  }
}

function extractFromJsonBody(bodyText: string): { username: string; password: string } | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(bodyText);
  } catch {
    return null;
  }
  const entries = flattenJson(parsed, MAX_JSON_DEPTH);
  return scanEntries(entries);
}

/** Flattens a JSON value into [key, stringValue] pairs, only descending into plain objects up to maxDepth. */
function flattenJson(value: unknown, maxDepth: number, prefix = ''): [string, string][] {
  if (value === null || value === undefined) return [];
  if (typeof value === 'string') return prefix ? [[prefix, value]] : [];
  if (typeof value !== 'object' || Array.isArray(value)) return [];
  if (maxDepth < 0) return [];

  const out: [string, string][] = [];
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    if (typeof val === 'string') {
      out.push([key, val]);
    } else if (typeof val === 'object' && val !== null && !Array.isArray(val) && maxDepth > 0) {
      out.push(...flattenJson(val, maxDepth - 1, key));
    }
  }
  return out;
}
