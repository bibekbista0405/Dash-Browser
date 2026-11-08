import type { Session } from 'electron';
import { isThirdParty, type DashSettings } from '../../shared/ipc-channels';
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
    private loginDetector?: LoginDetector
  ) {
    session.webRequest.onBeforeSendHeaders({ urls: ['<all_urls>'] }, (details, callback) => {
      this.loginDetector?.inspect(details);
      const settings = this.getSettings();
      const headers = { ...details.requestHeaders };

      if (settings.sendPrivacySignals) {
        headers['DNT'] = '1';
        headers['Sec-GPC'] = '1';
      }
      if (settings.blockThirdPartyCookies && details.resourceType !== 'mainFrame') {
        if (this.isThirdPartyRequest(details.url, details.webContents)) {
          for (const k of Object.keys(headers)) if (k.toLowerCase() === 'cookie') delete headers[k];
        }
      }
      callback({ requestHeaders: headers });
    });

    session.webRequest.onHeadersReceived({ urls: ['<all_urls>'] }, (details, callback) => {
      if (
        this.getSettings().blockThirdPartyCookies &&
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
