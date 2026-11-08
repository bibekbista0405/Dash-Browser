import { webContents, type Session } from 'electron';
import type { DashSettings } from '../../shared/ipc-channels';
import { stripTrackingParams, parseHostList, hostInList } from '@dash/browser-core';
import { classifyHost } from './blocklist-data';
import type { BlockedCountTracker } from './blocked-count-tracker';

/**
 * Ad endpoints that live on hosts we can't block wholesale (YouTube serves
 * ads from its own domain). Matched on host + path only.
 */
const AD_PATH_RULES: { host: RegExp; path: RegExp }[] = [
  { host: /(^|\.)youtube\.com$/, path: /^\/(api\/stats\/ads|pagead\/|ptracking|get_midroll_|pagead)/ },
  { host: /(^|\.)youtube\.com$/, path: /^\/youtubei\/v1\/(player\/ad_break|att\/get)/ },
  { host: /(^|\.)google\.com$/, path: /^\/(pagead\/|ads\/)/ },
];

function classifyUrlPath(hostname: string, url: string): 'ad' | null {
  let pathname: string;
  try {
    pathname = new URL(url).pathname;
  } catch {
    return null;
  }
  return AD_PATH_RULES.some((r) => r.host.test(hostname) && r.path.test(pathname)) ? 'ad' : null;
}

/**
 * Attaches to one real Electron session and blocks matching sub-resource
 * requests via the actual `webRequest.onBeforeRequest` API — this is a real
 * network-layer intercept, not a DOM-level cosmetic hide.
 *
 * IMPORTANT: Electron only keeps the LAST `onBeforeRequest` listener
 * registered per session — registering a second one silently replaces the
 * first rather than adding to it. Create exactly one `RequestBlocker` per
 * distinct `Session` object (one for `session.defaultSession`, one per
 * private-browsing session), never more than one for the same session.
 * This is also why HTTPS-Only enforcement lives inside this class instead
 * of its own handler — a second onBeforeRequest registration would just
 * silently discard this one.
 *
 * Deliberately never blocks ad/tracker sub-resources on top-level
 * navigations (resourceType 'mainFrame'): if someone types or clicks a
 * link straight to a domain, that's their call. Blocking targets
 * sub-resources — scripts, images, XHR/fetch, sub-frames, stylesheets,
 * media — which is where ad/tracker payloads actually load from.
 * mainFrame requests ARE still inspected for HTTPS-Only upgrading.
 */
export class RequestBlocker {
  constructor(
    session: Session,
    private getSettings: () => DashSettings,
    private tracker: BlockedCountTracker,
    recordHosts = true
  ) {
    session.webRequest.onBeforeRequest({ urls: ['<all_urls>'] }, (details, callback) => {
      if (details.resourceType === 'mainFrame') {
        const settings = this.getSettings();
        let target = details.url;
        if (settings.httpsOnlyMode && target.startsWith('http://')) {
          target = 'https://' + target.slice('http://'.length);
        }
        // Only GET navigations: rewriting a POST's URL would change what the user submitted.
        if (settings.stripTrackingParams && details.method === 'GET') {
          target = stripTrackingParams(target);
        }
        if (target !== details.url) {
          callback({ redirectURL: target });
          return;
        }
        callback({ cancel: false });
        return;
      }

      let hostname: string;
      try {
        hostname = new URL(details.url).hostname;
      } catch {
        callback({ cancel: false });
        return;
      }

      const category = classifyHost(hostname) ?? classifyUrlPath(hostname, details.url);
      if (!category) {
        callback({ cancel: false });
        return;
      }

      const settings = this.getSettings();
      if (settings.blockingOffHosts && this.pageHostIsExempt(details.webContentsId, settings.blockingOffHosts)) {
        callback({ cancel: false });
        return;
      }
      const shouldBlock =
        (category === 'ad' && settings.adBlockingEnabled) ||
        (category === 'tracker' && settings.trackerBlockingEnabled);

      if (shouldBlock) {
        this.tracker.recordBlock(details.webContentsId, category, recordHosts ? hostname : undefined);
      }
      callback({ cancel: shouldBlock });
    });
  }

  private exemptCache: { text: string; list: string[] } = { text: '', list: [] };

  /** True when the page the request belongs to is on the "blocking off" list. */
  private pageHostIsExempt(webContentsId: number | undefined, text: string): boolean {
    if (webContentsId === undefined) return false;
    const wc = webContents.fromId(webContentsId);
    if (!wc || wc.isDestroyed()) return false;
    let host: string;
    try {
      host = new URL(wc.getURL()).hostname;
    } catch {
      return false;
    }
    if (this.exemptCache.text !== text) this.exemptCache = { text, list: parseHostList(text) };
    return hostInList(host, this.exemptCache.list);
  }
}
