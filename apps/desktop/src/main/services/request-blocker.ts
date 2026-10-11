import type { Session } from 'electron';
import type { DashSettings } from '../../shared/ipc-channels';
import { classifyHost } from './blocklist-data';
import type { BlockedCountTracker } from './blocked-count-tracker';

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
    private tracker: BlockedCountTracker
  ) {
    session.webRequest.onBeforeRequest({ urls: ['<all_urls>'] }, (details, callback) => {
      if (details.resourceType === 'mainFrame') {
        const settings = this.getSettings();
        if (settings.httpsOnlyMode && details.url.startsWith('http://')) {
          const upgraded = 'https://' + details.url.slice('http://'.length);
          callback({ redirectURL: upgraded });
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

      const category = classifyHost(hostname);
      if (!category) {
        callback({ cancel: false });
        return;
      }

      const settings = this.getSettings();
      const shouldBlock =
        (category === 'ad' && settings.adBlockingEnabled) ||
        (category === 'tracker' && settings.trackerBlockingEnabled);

      if (shouldBlock) {
        this.tracker.recordBlock(details.webContentsId, category);
      }
      callback({ cancel: shouldBlock });
    });
  }
}
