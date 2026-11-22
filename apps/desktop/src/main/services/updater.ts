import electronUpdater from 'electron-updater';
import { app } from 'electron';
import type { UpdateStatus } from '../../shared/ipc-channels';

// electron-updater is CommonJS; the default import is the reliable way to reach it from ESM.
const { autoUpdater } = electronUpdater;

/**
 * Opt-in updates from a static folder you host (a generic feed): latest.yml plus the installers that
 * electron-builder produces. DASH contacts nothing until the user turns updates on AND enters an https address,
 * and then only that address. Integrity comes from the sha512 in latest.yml; a code-signed Windows build adds
 * publisher verification on top (this build is unsigned, so that extra check does not apply).
 *
 * Not applicable in `npm run dev` (nothing is installed to replace), unless DASH_DEV_UPDATE=1 is set to exercise
 * the check against a test feed.
 */
export class UpdateService {
  private current: UpdateStatus = { state: 'idle', version: app.getVersion() };
  private wired = false;

  constructor(
    private feedUrl: () => string,
    private enabled: () => boolean,
    private broadcast: (s: UpdateStatus) => void
  ) {}

  private set(s: UpdateStatus): void {
    this.current = s;
    this.broadcast(s);
  }

  status(): UpdateStatus {
    if (!this.feedUrl()) return { state: 'off', version: app.getVersion(), message: 'No update address set.' };
    return this.current;
  }

  private wire(): void {
    if (this.wired) return;
    this.wired = true;
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.allowPrerelease = false;
    autoUpdater.on('checking-for-update', () => this.set({ state: 'checking', version: app.getVersion() }));
    autoUpdater.on('update-not-available', () => this.set({ state: 'none', version: app.getVersion(), message: 'You have the latest version.' }));
    autoUpdater.on('update-available', (info) => this.set({ state: 'downloading', version: info.version, percent: 0 }));
    autoUpdater.on('download-progress', (p) => this.set({ state: 'downloading', version: this.current.version, percent: Math.round(p.percent) }));
    autoUpdater.on('update-downloaded', (info) =>
      this.set({ state: 'ready', version: info.version, message: 'Ready. It installs when you restart DASH.' })
    );
    autoUpdater.on('error', (err) => this.set({ state: 'error', version: app.getVersion(), message: err.message.split('\n')[0].slice(0, 300) }));
  }

  async check(): Promise<UpdateStatus> {
    const url = this.feedUrl();
    if (!url) return this.status();
    if (!app.isPackaged && process.env.DASH_DEV_UPDATE !== '1') {
      this.set({ state: 'error', version: app.getVersion(), message: 'Updates only work in an installed build, not in development.' });
      return this.current;
    }
    this.wire();
    if (process.env.DASH_DEV_UPDATE === '1') autoUpdater.forceDevUpdateConfig = true;
    autoUpdater.setFeedURL({ provider: 'generic', url });
    try {
      await autoUpdater.checkForUpdates();
    } catch (err) {
      this.set({ state: 'error', version: app.getVersion(), message: (err instanceof Error ? err.message : String(err)).split('\n')[0].slice(0, 300) });
    }
    return this.current;
  }

  /** Startup check: only when the user opted in and gave an address. */
  checkInBackground(): void {
    if (this.enabled() && this.feedUrl()) void this.check();
  }

  install(): void {
    if (this.current.state === 'ready') autoUpdater.quitAndInstall();
  }
}
