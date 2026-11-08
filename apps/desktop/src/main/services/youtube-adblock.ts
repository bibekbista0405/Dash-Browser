/**
 * Injected at document-start into every page's main world (via the DevTools
 * protocol). Only acts on youtube.com. Two layers:
 *  1. Strip ad data from player JSON before the player reads it
 *     (ytInitialPlayerResponse, fetch/XHR JSON responses, JSON.parse).
 *  2. Fallback: hide ad containers and skip any ad video that still plays.
 */
export const YOUTUBE_AD_SCRIPT = `(() => {
  if (!/(^|\\.)youtube\\.com$/.test(location.hostname)) return;
  if (window.__dashYtAdblock) return;
  window.__dashYtAdblock = true;

  const AD_KEYS = ['adPlacements', 'playerAds', 'adSlots', 'adBreakHeartbeatParams'];
  const strip = (obj) => {
    if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
      for (const k of AD_KEYS) { if (k in obj) { try { delete obj[k]; } catch (e) {} } }
      if (obj.playerResponse) strip(obj.playerResponse);
      if (obj.response && typeof obj.response === 'object') strip(obj.response);
    }
    return obj;
  };

  const origParse = JSON.parse;
  JSON.parse = function () { return strip(origParse.apply(this, arguments)); };

  const origJson = Response.prototype.json;
  Response.prototype.json = function () { return origJson.apply(this, arguments).then(strip); };

  try {
    let initial;
    Object.defineProperty(window, 'ytInitialPlayerResponse', {
      configurable: true,
      get() { return initial; },
      set(v) { initial = strip(v); },
    });
  } catch (e) {}

  const style = document.createElement('style');
  style.textContent = [
    '#player-ads', '#masthead-ad', 'ytd-ad-slot-renderer', 'ytd-display-ad-renderer',
    'ytd-promoted-sparkles-web-renderer', 'ytd-promoted-video-renderer', 'ytd-banner-promo-renderer',
    'ytd-in-feed-ad-layout-renderer', 'ytd-companion-slot-renderer', '.ytp-ad-overlay-container',
    '.ytp-ad-message-container', 'ytd-statement-banner-renderer'
  ].join(',') + '{display:none !important;}';
  // At document-start there may be no <head>/<html> yet; add the style as soon as one exists.
  const injectStyle = () => {
    const parent = document.head || document.documentElement;
    if (!parent) return false;
    parent.appendChild(style);
    return true;
  };
  if (!injectStyle()) document.addEventListener('DOMContentLoaded', injectStyle, { once: true });

  setInterval(() => {
    const player = document.querySelector('.html5-video-player');
    if (!player || !player.classList.contains('ad-showing')) return;
    const skip = document.querySelector('.ytp-skip-ad-button, .ytp-ad-skip-button, .ytp-ad-skip-button-modern');
    if (skip) skip.click();
    const video = player.querySelector('video');
    if (video && isFinite(video.duration) && video.duration > 0) {
      video.muted = true;
      video.playbackRate = 16;
      video.currentTime = video.duration;
    }
  }, 300);
})();`;

import fs from 'node:fs';
import path from 'node:path';
import { app, ipcMain, type Session } from 'electron';

const ENABLED_CHANNEL = 'dash:adblock-enabled';
const GPC_CHANNEL = 'dash:gpc-enabled';
const FP_CHANNEL = 'dash:fp-seed';

/**
 * Fingerprint protection ("farbling"): tiny, per-launch-consistent noise on the values trackers hash to recognise a browser.
 *  - canvas readback (toDataURL / toBlob / getImageData) gets a few +-1 colour nudges, invisible to people
 *  - AudioBuffer samples get ~1e-7 noise
 *  - hardwareConcurrency and deviceMemory report common values instead of the real ones
 * Same seed all session so sites that legitimately re-read a canvas see consistent results; a new seed every launch.
 * Not covered: WebGL parameters, fonts, iframes (preloads only run in the main frame).
 */
const FP_SCRIPT = (seed: number): string => `(() => {
  if (window.__dashFp) return; window.__dashFp = true;
  const seed = ${Math.floor(seed)} >>> 0;
  const mix = (n) => { let x = (n ^ seed) >>> 0; x = Math.imul(x ^ (x >>> 15), 2246822507) >>> 0; x = Math.imul(x ^ (x >>> 13), 3266489909) >>> 0; return (x ^ (x >>> 16)) >>> 0; };
  const nudge = (data) => { for (let i = 0; i < data.length; i += 4) { const m = mix(i); if (m % 23 === 0) { const c = m % 3; data[i + c] = Math.max(0, Math.min(255, data[i + c] + ((m & 64) ? 1 : -1))); } } };
  try {
    const origGet = CanvasRenderingContext2D.prototype.getImageData;
    CanvasRenderingContext2D.prototype.getImageData = function () { const d = origGet.apply(this, arguments); try { if (d.width * d.height >= 64) nudge(d.data); } catch (e) {} return d; };
    const noisyCopy = (canvas) => {
      if (canvas.width * canvas.height < 64) return canvas;
      try {
        const c = document.createElement('canvas'); c.width = canvas.width; c.height = canvas.height;
        const x = c.getContext('2d'); if (!x) return canvas;
        x.drawImage(canvas, 0, 0);
        const d = origGet.call(x, 0, 0, c.width, c.height); nudge(d.data); x.putImageData(d, 0, 0);
        return c;
      } catch (e) { return canvas; }
    };
    const origUrl = HTMLCanvasElement.prototype.toDataURL;
    HTMLCanvasElement.prototype.toDataURL = function () { return origUrl.apply(noisyCopy(this), arguments); };
    const origBlob = HTMLCanvasElement.prototype.toBlob;
    HTMLCanvasElement.prototype.toBlob = function () { return origBlob.apply(noisyCopy(this), arguments); };
  } catch (e) {}
  try {
    const seen = new WeakSet(); const origCh = AudioBuffer.prototype.getChannelData;
    AudioBuffer.prototype.getChannelData = function () { const a = origCh.apply(this, arguments); if (!seen.has(a)) { seen.add(a); for (let i = 0; i < a.length; i += 97) a[i] += ((mix(i) % 2000) - 1000) * 1e-10; } return a; };
  } catch (e) {}
  try {
    Object.defineProperty(Navigator.prototype, 'hardwareConcurrency', { get() { return 4; }, configurable: true, enumerable: true });
    Object.defineProperty(Navigator.prototype, 'deviceMemory', { get() { return 8; }, configurable: true, enumerable: true });
  } catch (e) {}
})();`;

const FP_SCRIPT_TEMPLATE_MARK = FP_SCRIPT(0).replace('const seed = 0 >>> 0;', 'const seed = __SEED__ >>> 0;');

const FP_SEED = Math.floor(Math.random() * 0xffffffff) + 1;

/** Exposes navigator.globalPrivacyControl = true, matching the Sec-GPC header, so JS-based opt-out checks see it too. */
const GPC_SCRIPT = `try { Object.defineProperty(Navigator.prototype, 'globalPrivacyControl', { get() { return true; }, configurable: true, enumerable: true }); } catch (e) {}`;

/**
 * Registers the YouTube ad script as a session preload. Preloads run before
 * any page script, so the script can wrap JSON.parse / fetch before YouTube
 * reads its player data — which is why this is a preload rather than an
 * injection after load. The preload file is generated at startup into the
 * user-data folder (it only contains our own script) and asks the main
 * process, synchronously, whether ad blocking is currently on, so toggling
 * the setting takes effect on the next page load.
 */
let handlerRegistered = false;

export function installYoutubeAdPreload(
  sessions: Session[],
  isEnabled: () => boolean,
  isGpcEnabled: () => boolean = () => false,
  isFingerprintProtectionEnabled: () => boolean = () => false
): void {
  if (!handlerRegistered) {
    handlerRegistered = true;
    ipcMain.on(ENABLED_CHANNEL, (event) => {
      event.returnValue = isEnabled();
    });
    ipcMain.on(FP_CHANNEL, (event) => {
      event.returnValue = isFingerprintProtectionEnabled() ? FP_SEED : 0;
    });
    ipcMain.on(GPC_CHANNEL, (event) => {
      event.returnValue = isGpcEnabled();
    });
  }

  const file = path.join(app.getPath('userData'), 'youtube-adblock-preload.js');
  const source = `const { ipcRenderer, webFrame } = require('electron');
try {
  const seed = ipcRenderer.sendSync(${JSON.stringify(FP_CHANNEL)});
  if (typeof seed === 'number' && seed > 0) webFrame.executeJavaScript(${JSON.stringify(FP_SCRIPT_TEMPLATE_MARK)}.replace('__SEED__', String(seed)));
} catch (e) { /* never break page loading */ }
try {
  if (ipcRenderer.sendSync(${JSON.stringify(GPC_CHANNEL)}) === true) {
    webFrame.executeJavaScript(${JSON.stringify(GPC_SCRIPT)});
  }
} catch (e) { /* never break page loading */ }
try {
  if (/(^|\\.)youtube\\.com$/.test(location.hostname) && ipcRenderer.sendSync(${JSON.stringify(ENABLED_CHANNEL)}) === true) {
    webFrame.executeJavaScript(${JSON.stringify(YOUTUBE_AD_SCRIPT)});
  }
} catch (e) { /* never break page loading */ }
`;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, source, 'utf-8');
  for (const s of sessions) {
    if (!s.getPreloads().includes(file)) s.setPreloads([...s.getPreloads(), file]);
  }
}
