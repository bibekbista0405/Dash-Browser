import type { Session } from 'electron';
import { isThirdParty, type DashSettings } from '../../shared/ipc-channels';
import { isSignInProvider, registrableDomain } from '@dash/browser-core';

const GOOGLE_SITES = new Set(['google.com', 'youtube.com', 'gstatic.com', 'googleapis.com', 'googleusercontent.com']);
const CH_MAJOR = (process.versions.chrome ?? '128').split('.')[0];
const CH_FULL = process.versions.chrome ?? '128.0.0.0';

import type { LoginDetector } from './login-detector';

function topLevelHost(webContents: { getURL(): string } | undefined): string {
  try {
    return webContents ? new URL(webContents.getURL()).hostname : '';
  } catch {
    return '';
  }
}

/**
 * The ONE onBeforeSendHeaders / onHeadersReceived handler for a session
 * (Electron keeps a single listener per event per session, so everything
 * that needs request/response headers goes through here):
 *  - Do Not Track + Global Privacy Control headers on every request (opt-out in Settings)
 *  - optional third-party cookie blocking: strips Cookie on outgoing and
 *    Set-Cookie on incoming cross-site sub-resource requests
 *  - feeds the login detector (normal sessions only; never private ones)
 *
 * Honest limits: "third party" uses an approximate registrable-domain
 * check (not the full Public Suffix List), and the JS-visible
 * navigator.globalPrivacyControl flag is not set — only the HTTP headers.
 */
export class HeaderPolicy {
  constructor(
    session: Session,
    private getSettings: () => DashSettings,
    private loginDetector?: LoginDetector,
    /** Private-session hardening: trims what a site can learn about you from request headers. */
    private hardened = false
  ) {
    session.webRequest.onBeforeSendHeaders({ urls: ['<all_urls>'] }, (details, callback) => {
      this.loginDetector?.inspect(details);
      const settings = this.getSettings();
      const headers = { ...details.requestHeaders };

      let providerHost = false;
      try { providerHost = isSignInProvider(new URL(details.url).hostname); } catch { /* ignore */ }
      if (settings.sendPrivacySignals && !providerHost) { // sign-in providers see a stock Chrome request (no DNT / GPC extras)
        headers['DNT'] = '1';
        headers['Sec-GPC'] = '1';
      }
      if (this.hardened && !providerHost) { // sign-in providers get the normal headers: a stripped browser fingerprint trips their bot checks
        for (const k of Object.keys(headers)) {
          const l = k.toLowerCase();
          if (l.startsWith('sec-ch-')) delete headers[k]; // client hints (browser build, platform, ...)
          if (l === 'accept-language') delete headers[k];
          if (l === 'referer') {
            try { headers[k] = new URL(headers[k]).origin + '/'; } catch { delete headers[k]; } // origin only
          }
        }
        headers['Accept-Language'] = 'en-US,en;q=0.9'; // same for everyone in private mode
      }
      // Google's sign-in rejects a brand list without "Google Chrome" (see youtube-adblock.ts), so Google hosts get Chrome's.
      try {
        if (GOOGLE_SITES.has(registrableDomain(new URL(details.url).hostname))) {
          for (const k of Object.keys(headers)) {
            const l = k.toLowerCase();
            if (l === 'sec-ch-ua') headers[k] = `"Not;A=Brand";v="24", "Chromium";v="${CH_MAJOR}", "Google Chrome";v="${CH_MAJOR}"`;
            if (l === 'sec-ch-ua-full-version-list') headers[k] = `"Not;A=Brand";v="24.0.0.0", "Chromium";v="${CH_FULL}", "Google Chrome";v="${CH_FULL}"`;
          }
        }
      } catch { /* ignore */ }
      if ((settings.blockThirdPartyCookies || this.hardened) && details.resourceType !== 'mainFrame') {
        if (this.isThirdPartyRequest(details.url, details.webContents)) {
          for (const k of Object.keys(headers)) if (k.toLowerCase() === 'cookie') delete headers[k];
        }
      }
      callback({ requestHeaders: headers });
    });

    session.webRequest.onHeadersReceived({ urls: ['<all_urls>'] }, (details, callback) => {
      if (
        (this.getSettings().blockThirdPartyCookies || this.hardened) &&
        details.resourceType !== 'mainFrame' &&
        details.responseHeaders &&
        this.isThirdPartyRequest(details.url, details.webContents)
      ) {
        const headers = { ...details.responseHeaders };
        for (const k of Object.keys(headers)) if (k.toLowerCase() === 'set-cookie') delete headers[k];
        callback({ responseHeaders: headers });
        return;
      }
      callback({});
    });
  }

  private isThirdPartyRequest(url: string, webContents: { getURL(): string } | undefined): boolean {
    try {
      return isThirdParty(new URL(url).hostname, topLevelHost(webContents));
    } catch {
      return false;
    }
  }
}
