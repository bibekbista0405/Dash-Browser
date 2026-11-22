#!/usr/bin/env node
/**
 * Automated UI check: launches a built DASH with a throw-away profile, opens every internal screen in both themes
 * at several window sizes and reports horizontal overflow, elements poking outside the window, and console errors.
 * Run `npm run build` first, then `npm run ui-check`. Exit code 1 when anything is flagged.
 */
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright-core');
const electronPath = require('electron');
const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 9400 + Math.floor(Math.random() * 400);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'dash-ui-check-'));
const SIZES = [
  [760, 520],
  [1024, 700],
  [1440, 900],
];
const THEMES = ['dark', 'light'];
const SETTINGS_CATEGORIES = ['general', 'appearance', 'privacy', 'network', 'passwords', 'access', 'performance', 'extensions', 'data', 'about'];

const child = spawn(electronPath, ['--no-sandbox', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, appDir], { stdio: 'ignore' });
const problems = [];
const flag = (where, what) => problems.push(`${where}: ${what}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function connect() {
  for (let i = 0; i < 60; i++) {
    try {
      return await chromium.connectOverCDP(`http://127.0.0.1:${PORT}`);
    } catch {
      await sleep(500);
    }
  }
  throw new Error('DASH did not start');
}

const layoutProbe = () => {
  const out = [];
  const vw = document.documentElement.clientWidth;
  if (document.documentElement.scrollWidth > vw + 1) out.push(`page scrolls sideways (${document.documentElement.scrollWidth}px > ${vw}px)`);
  const seen = new Set();
  for (const el of document.querySelectorAll('body *')) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    const cs = getComputedStyle(el);
    if (cs.position === 'fixed' || cs.visibility === 'hidden' || cs.display === 'none') continue;
    if (r.right > vw + 2 && !el.closest('.overflow-x-auto,.overflow-auto,.no-scrollbar,[data-allow-overflow]')) {
      const label = `${el.tagName.toLowerCase()}${el.className && typeof el.className === 'string' ? '.' + el.className.split(' ')[0] : ''}`;
      if (!seen.has(label)) {
        seen.add(label);
        out.push(`${label} extends ${Math.round(r.right - vw)}px past the right edge`);
      }
    }
  }
  for (const b of document.querySelectorAll('button')) {
    if (b.scrollWidth > b.clientWidth + 2 && getComputedStyle(b).overflow !== 'visible' && !b.querySelector('.truncate') && b.textContent.trim().length > 0) {
      out.push(`button "${b.textContent.trim().slice(0, 30)}" clips its label`);
    }
  }
  return out.slice(0, 8);
};

try {
  const browser = await connect();
  const ctx = browser.contexts()[0];
  let chrome;
  for (let i = 0; i < 40 && !chrome; i++) {
    for (const p of ctx.pages()) if (await p.evaluate(() => !!(window.dash && window.dash.tabs && window.dash.tabs.create)).catch(() => false)) chrome = p;
    if (!chrome) await sleep(500);
  }
  if (!chrome) throw new Error('DASH window not found');
  const errors = [];
  const watch = (p) => p.on('console', (m) => m.type() === 'error' && errors.push(m.text().slice(0, 160)));
  ctx.pages().forEach(watch);
  ctx.on('page', watch);
  const settle = () => sleep(700);
  const findPage = (pred) => ctx.pages().find(pred);

  for (const [w, h] of SIZES) {
    // Electron has no window-resize protocol, so each page is checked at the target viewport size via emulation.
    const size = (p) => p.setViewportSize({ width: w, height: h }).catch(() => undefined);
    await size(chrome);
    await settle();
    for (const theme of THEMES) {
      await chrome.evaluate((t) => window.dash.settings.set('theme', t), theme);
      await settle();
      const tag = `${w}x${h} ${theme}`;
      for (const m of await chrome.evaluate(layoutProbe)) flag(`chrome @ ${tag}`, m);

      // Internal pages
      for (const cat of SETTINGS_CATEGORIES) {
        await chrome.evaluate((url) => window.dash.tabs.create(url), 'dash://settings');
        await settle();
        const page = findPage((p) => p.url().includes('internal.html') && p.url().includes('settings'));
        if (!page) continue;
        await page.evaluate((c) => localStorage.setItem('dash-settings-category', c), cat);
        await size(page);
        await page.reload();
        await sleep(600);
        for (const m of await page.evaluate(layoutProbe)) flag(`settings/${cat} @ ${tag}`, m);
      }
      for (const url of ['dash://history', 'dash://downloads', 'dash://bookmarks', 'dash://welcome', 'dash://notes', 'dash://archive', 'dash://ai', 'dash://newtab']) {
        await chrome.evaluate((u) => window.dash.tabs.create(u), url);
        await settle();
        const page = url.endsWith('newtab')
          ? ctx.pages().filter((p) => p.url().startsWith('data:text/html')).pop()
          : findPage((p) => p.url().includes('internal.html') && p.url().includes(url.replace('dash://', '')));
        if (!page) {
          flag(`${url} @ ${tag}`, 'page did not open');
          continue;
        }
        await size(page);
        await sleep(300);
        for (const m of await page.evaluate(layoutProbe)) flag(`${url} @ ${tag}`, m);
      }
      // Close the extra tabs so the tab strip stays realistic
      const snap = await chrome.evaluate(() => window.dash.tabs.snapshot());
      for (const t of snap.slice(1)) await chrome.evaluate((id) => window.dash.tabs.close(id), t.id);
    }
  }
  for (const e of new Set(errors)) if (!/Failed to load resource/.test(e)) flag('console', e);
  await browser.close().catch(() => undefined);
} catch (e) {
  flag('runner', String(e));
} finally {
  await new Promise((resolve) => {
    child.once('exit', resolve);
    child.kill();
    setTimeout(resolve, 5000);
  });
  try {
    fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
  } catch {
    /* temp folder: the OS clears it */
  }
}

if (problems.length) {
  console.log(`UI check: ${problems.length} problem(s)\n` + problems.map((p) => ` - ${p}`).join('\n'));
  process.exit(1);
}
console.log('UI check passed: no overflow, clipping or console errors across all screens, both themes, 3 sizes.');
