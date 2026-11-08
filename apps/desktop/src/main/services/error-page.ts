import { LOGO_MARK_DATA_URI } from './logo-data';

export const ERROR_HASH_KEY = '#dash-error=';
export const RETRY_PREFIX = 'dash://retry';

interface ErrorCopy {
  title: string;
  detail: string;
  tips: string[];
}

/** Maps Chromium net error codes to plain-language copy. */
export function describeNetError(code: number, host: string): ErrorCopy {
  switch (code) {
    case -105: // ERR_NAME_NOT_RESOLVED
      return {
        title: "Can't find this site",
        detail: `DASH couldn't find a server for ${host}.`,
        tips: ['Check the address for typos.', 'Check your internet connection.', 'If you use a custom DNS-over-HTTPS provider, try switching it off in Settings.'],
      };
    case -102: // ERR_CONNECTION_REFUSED
      return { title: 'Connection refused', detail: `${host} refused the connection.`, tips: ['The site may be down, or nothing is running at that address.', 'Try again in a moment.'] };
    case -101: // ERR_CONNECTION_RESET
    case -100: // ERR_CONNECTION_CLOSED
      return { title: 'Connection was interrupted', detail: `The connection to ${host} was closed unexpectedly.`, tips: ['Try again.', 'Check your network or VPN.'] };
    case -118: // ERR_CONNECTION_TIMED_OUT
    case -7: // ERR_TIMED_OUT
      return { title: 'Took too long to respond', detail: `${host} didn't respond in time.`, tips: ['Check your internet connection.', 'The site may be busy. Try again later.'] };
    case -130: // ERR_PROXY_CONNECTION_FAILED
    case -120: // ERR_SOCKS_CONNECTION_FAILED
    case -111: // ERR_TUNNEL_CONNECTION_FAILED
    case -115: // ERR_PROXY_AUTH_UNSUPPORTED
    case -136: // ERR_PROXY_CERTIFICATE_INVALID
      return {
        title: "Can't reach your VPN or proxy server",
        detail: `DASH could not connect to ${host} through the VPN server. Nothing was sent directly.`,
        tips: ['Open Settings → VPN to see what is wrong.', 'Turn the VPN off to browse without it.', 'Check that the VPN server is running and your login is right.'],
      };
    case -106: // ERR_INTERNET_DISCONNECTED
      return { title: "You're offline", detail: "Your device isn't connected to the internet.", tips: ['Reconnect to Wi-Fi or Ethernet, then retry.'] };
    case -109: // ERR_ADDRESS_UNREACHABLE
      return { title: "Can't reach this address", detail: `${host} can't be reached from this network.`, tips: ['Check your network, VPN or proxy settings.'] };
    case -20: // ERR_BLOCKED_BY_CLIENT
      return { title: 'Blocked by DASH', detail: `DASH blocked ${host} as an ad or tracker.`, tips: ['You can turn blocking off in Settings if this page is needed.'] };
    case -21: // ERR_NETWORK_CHANGED
      return { title: 'Network changed', detail: 'Your network connection changed while loading.', tips: ['Retry once the connection is stable.'] };
    default:
      if (code <= -200 && code >= -299) {
        return {
          title: "This connection isn't private",
          detail: `DASH couldn't verify the security certificate for ${host}.`,
          tips: ['The site may be misconfigured, or someone may be intercepting the connection.', "Check your device's date and time.", 'DASH will not load the page.'],
        };
      }
      if (code === -107 || code === -113) {
        return { title: "Secure connection failed", detail: `DASH couldn't set up a secure connection to ${host}.`, tips: ['Try again later.', 'The site may not support modern encryption.'] };
      }
      return { title: "Can't load this page", detail: `Something went wrong loading ${host}.`, tips: ['Try again.'] };
  }
}

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Self-contained, script-free error page. The failed URL rides in the hash so the address bar can show it. */
export function buildErrorPageDataUrl(failedUrl: string, code: number, errorName: string, isDark: boolean, copyOverride?: ErrorCopy): string {
  let host = failedUrl;
  try {
    host = new URL(failedUrl).host || failedUrl;
  } catch {
    /* keep raw */
  }
  const copy = copyOverride ?? describeNetError(code, host);
  const retry = `${RETRY_PREFIX}?url=${encodeURIComponent(failedUrl)}`;
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:">
<title>${esc(copy.title)}</title>
<style>
:root{color-scheme:${isDark ? 'dark' : 'light'};--bg:${isDark ? '#0b0d10' : '#ffffff'};--fg:${isDark ? '#e8eaed' : '#14161a'};--muted:${isDark ? '#9aa0a8' : '#5a6068'};--line:${isDark ? '#23272d' : '#e3e6ea'};--card:${isDark ? '#14171b' : '#f5f6f8'};--accent:${isDark ? '#5b8cff' : '#3b64dc'}}
*{box-sizing:border-box}
body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:var(--bg);color:var(--fg);font:14px/1.6 system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;padding:24px}
main{width:min(520px,100%)}
.logo{width:44px;height:44px;background:var(--muted);opacity:.7;-webkit-mask:url(${LOGO_MARK_DATA_URI}) center/contain no-repeat;mask:url(${LOGO_MARK_DATA_URI}) center/contain no-repeat;margin-bottom:20px}
h1{font-size:24px;line-height:1.25;margin:0 0 8px;font-weight:650}
p{margin:0 0 16px;color:var(--muted)}
ul{margin:0 0 24px;padding-left:20px;color:var(--muted)}
li{margin:4px 0}
.row{display:flex;gap:10px;flex-wrap:wrap}
a.btn{display:inline-block;padding:9px 16px;border-radius:10px;text-decoration:none;font-weight:600;border:1px solid var(--line);color:var(--fg);background:var(--card)}
a.btn.primary{background:var(--accent);border-color:var(--accent);color:#fff}
a.btn:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
code{font:12px ui-monospace,Menlo,Consolas,monospace;color:var(--muted);word-break:break-all}
.code{margin-top:28px;border-top:1px solid var(--line);padding-top:14px}
</style></head><body><main>
<div class="logo" role="img" aria-label="DASH"></div>
<h1>${esc(copy.title)}</h1>
<p>${esc(copy.detail)}</p>
<ul>${copy.tips.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>
<div class="row"><a class="btn primary" href="${esc(retry)}">Try again</a><a class="btn" href="dash://newtab">New Tab</a></div>
<div class="code"><code>${esc(failedUrl)}<br>${esc(errorName)}${code ? ` (${code})` : ''}</code></div>
</main></body></html>`;
  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}${ERROR_HASH_KEY}${encodeURIComponent(failedUrl)}`;
}

/** If this is one of our error pages, returns the URL that failed. */
export function failedUrlFromErrorPage(url: string): string | null {
  if (!url.startsWith('data:text/html')) return null;
  const i = url.lastIndexOf(ERROR_HASH_KEY);
  if (i < 0) return null;
  try {
    return decodeURIComponent(url.slice(i + ERROR_HASH_KEY.length));
  } catch {
    return null;
  }
}

const CRASH_REASON: Record<string, string> = {
  oom: 'ran out of memory',
  crashed: 'crashed',
  killed: 'was stopped by the system',
  'abnormal-exit': 'exited unexpectedly',
  'launch-failed': 'could not start',
  'integrity-failure': 'failed a safety check',
};

/** Page shown when a tab's renderer process died. The failed URL rides in the hash, so Try again reloads it. */
export function buildCrashPageDataUrl(pageUrl: string, reason: string, isDark: boolean): string {
  let host = pageUrl;
  try {
    host = new URL(pageUrl).host || pageUrl;
  } catch {
    /* keep raw */
  }
  const copy: ErrorCopy = {
    title: 'This page stopped working',
    detail: `The page ${host ? `from ${host} ` : ''}${CRASH_REASON[reason] ?? 'stopped unexpectedly'}. The rest of DASH is fine.`,
    tips: ['Try again. Most of the time this fixes it.', 'If it keeps happening, close other tabs to free memory.', 'Extensions and very heavy pages can cause this.'],
  };
  return buildErrorPageDataUrl(pageUrl, 0, `Page process: ${reason}`, isDark, copy);
}
