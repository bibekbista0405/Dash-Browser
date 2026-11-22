import type { Session } from 'electron';
import { hostInList } from '../../shared/ipc-channels';

const STEP_TIMEOUT_MS = 4000;

/** Time-limits one step so a stuck call can never keep the app from quitting. The timer is cleared when the step finishes. */
async function guard<T>(label: string, work: Promise<T>, fallback: T, log: (line: string) => void): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<T>((resolve) => {
    timer = setTimeout(() => {
      log(`Exit cleanup step timed out: ${label}`);
      resolve(fallback);
    }, STEP_TIMEOUT_MS);
  });
  try {
    return await Promise.race([work, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Clears cookies, web storage and cache, except for the sites in `keep` (and their subdomains).
 * Electron can't clear "everything but", so with a keep list this clears per site: every cookie one by one, and web
 * storage for each origin we know of (cookie domains plus `knownUrls`, normally the browsing history).
 * Sites visited without cookies or history entries can't be enumerated, so their storage is left alone.
 */
export async function clearSiteDataExcept(ses: Session, keep: readonly string[], knownUrls: readonly string[], log: (line: string) => void): Promise<void> {
  if (keep.length === 0) {
    await guard('clearStorageData', ses.clearStorageData(), undefined, log);
  } else {
    const origins = new Set<string>();
    for (const c of await guard('cookies.get', ses.cookies.get({}), [], log)) {
      const host = (c.domain ?? '').replace(/^\./, '');
      if (!host || hostInList(host, keep)) continue;
      origins.add(`https://${host}`);
      origins.add(`http://${host}`);
      await guard('cookies.remove', ses.cookies.remove(`http${c.secure ? 's' : ''}://${host}${c.path ?? '/'}`, c.name), undefined, log);
    }
    for (const raw of knownUrls) {
      try {
        const u = new URL(raw);
        if ((u.protocol === 'http:' || u.protocol === 'https:') && !hostInList(u.hostname, keep)) origins.add(u.origin);
      } catch {
        /* not a URL: skip */
      }
    }
    for (const origin of origins) {
      await guard(`clearStorageData ${origin}`, ses.clearStorageData({ origin }).catch(() => undefined), undefined, log);
    }
  }
  await guard('clearCache', ses.clearCache(), undefined, log);
}
