import { app, safeStorage, webContents, type AuthInfo, type Session } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import {
  DEFAULT_VPN_CONFIG,
  VPN_BYPASS_RULES,
  buildProxyRules,
  validateVpnConfig,
  type VpnConfig,
  type VpnState,
  type VpnStatus,
} from '../../shared/ipc-channels';
import { probeProxy } from './vpn-probe';

const MONITOR_OK_MS = 15_000;
const MONITOR_RETRY_MS = 5_000;
const AUTH_FAIL_WINDOW_MS = 20_000;
const AUTH_FAIL_LIMIT = 3;
const IP_CHECK_URL = 'https://api.ipify.org?format=json';

interface StoredVpn {
  config: VpnConfig;
  passwordEnc?: string; // base64 of safeStorage ciphertext
}

/**
 * Routes every DASH tab (normal and private) through the configured proxy server, with:
 *  - a real handshake before turning on (certificate, login, protocol)
 *  - a kill switch: if the server drops, requests fail instead of silently going direct
 *  - WebRTC locked to the tunnel, so a page cannot read your real address that way
 *  - local and private-network addresses kept off the tunnel
 * Scope: browser traffic only. It is not a system-wide VPN and does not cover other apps.
 */
export class VpnManager {
  private config: VpnConfig = { ...DEFAULT_VPN_CONFIG };
  private password: string | null = null;
  private passwordPersisted = false;
  private status: VpnStatus = 'off';
  private error: string | null = null;
  private since: number | null = null;
  /** True while the proxy is applied to sessions (including the kill-switch "blocked" state). */
  private applied = false;
  private monitor: ReturnType<typeof setTimeout> | null = null;
  private authFailures: number[] = [];
  private readonly sessions = new Set<Session>();
  private busy: Promise<void> = Promise.resolve();

  constructor(
    private readonly onChange: (state: VpnState) => void,
    private readonly log: (line: string) => void,
    private readonly storagePath: string = path.join(app.getPath('userData'), 'dash-vpn.json')
  ) {
    this.load();
    app.on('web-contents-created', (_e, wc) => {
      if (this.applied) wc.setWebRTCIPHandlingPolicy('disable_non_proxied_udp');
    });
  }

  // ---- persistence ----
  private load(): void {
    try {
      if (!fs.existsSync(this.storagePath)) return;
      const stored = JSON.parse(fs.readFileSync(this.storagePath, 'utf8')) as StoredVpn;
      const checked = validateVpnConfig(stored.config);
      if (checked.ok) this.config = checked.config;
      if (stored.passwordEnc && safeStorage.isEncryptionAvailable()) {
        this.password = safeStorage.decryptString(Buffer.from(stored.passwordEnc, 'base64'));
        this.passwordPersisted = true;
      }
    } catch (err) {
      // A damaged file must never stop the browser: start with VPN unconfigured and keep a copy for inspection.
      this.log(`VPN settings could not be read, starting unconfigured: ${err instanceof Error ? err.message : String(err)}`);
      try {
        fs.renameSync(this.storagePath, `${this.storagePath}.damaged-${Date.now()}`);
      } catch {
        /* nothing more to do */
      }
    }
  }

  private save(): void {
    const stored: StoredVpn = { config: this.config };
    if (this.password && safeStorage.isEncryptionAvailable()) {
      stored.passwordEnc = safeStorage.encryptString(this.password).toString('base64');
      this.passwordPersisted = true;
    } else {
      this.passwordPersisted = false;
    }
    const tmp = `${this.storagePath}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(stored), { mode: 0o600 });
    fs.renameSync(tmp, this.storagePath);
  }

  // ---- state ----
  getState(): VpnState {
    return {
      status: this.status,
      config: this.config,
      hasPassword: this.password !== null,
      passwordPersisted: this.passwordPersisted,
      encryptionAvailable: safeStorage.isEncryptionAvailable(),
      error: this.error,
      since: this.since,
    };
  }

  private emit(): void {
    this.onChange(this.getState());
  }

  private set(status: VpnStatus, error: string | null = null): void {
    this.status = status;
    this.error = error;
    this.emit();
  }

  /** True when browsing is going through (or blocked by) the tunnel. */
  isActive(): boolean {
    return this.applied;
  }

  /** Serialises connect/disconnect/config changes so two clicks can never interleave. */
  private run(work: () => Promise<void>): Promise<void> {
    const next = this.busy.then(work, work);
    this.busy = next.catch(() => undefined);
    return next;
  }

  // ---- sessions ----
  /** Register a session (default session, and each window's private session). Applied right away if the tunnel is up. */
  addSession(ses: Session): void {
    this.sessions.add(ses);
    if (this.applied) void this.applyTo(ses).catch((e) => this.log(`VPN: could not apply to new session: ${String(e)}`));
  }

  removeSession(ses: Session): void {
    this.sessions.delete(ses);
  }

  private async applyTo(ses: Session): Promise<void> {
    await ses.setProxy({ mode: 'fixed_servers', proxyRules: buildProxyRules(this.config), proxyBypassRules: VPN_BYPASS_RULES });
    await ses.closeAllConnections();
    await ses.clearHostResolverCache();
  }

  private async clearFrom(ses: Session): Promise<void> {
    await ses.setProxy({ mode: 'system' });
    await ses.closeAllConnections();
  }

  private setWebRtcPolicy(policy: 'default' | 'disable_non_proxied_udp'): void {
    for (const wc of webContents.getAllWebContents()) {
      try {
        if (!wc.isDestroyed()) wc.setWebRTCIPHandlingPolicy(policy);
      } catch {
        /* a view being torn down */
      }
    }
  }

  private async applyAll(): Promise<void> {
    await Promise.all([...this.sessions].map((s) => this.applyTo(s)));
    this.applied = true;
    this.setWebRtcPolicy('disable_non_proxied_udp');
  }

  private async clearAll(): Promise<void> {
    this.applied = false;
    this.setWebRtcPolicy('default');
    await Promise.all([...this.sessions].map((s) => this.clearFrom(s)));
  }

  // ---- public actions ----
  /** Saves new settings. `password`: undefined keeps the stored one, '' removes it. Disconnects first if the tunnel is up. */
  setConfig(input: unknown, password?: string): Promise<VpnState> {
    return this.run(async () => {
      const checked = validateVpnConfig(input);
      if (!checked.ok) throw new Error(checked.error);
      if (this.applied) await this.disconnectInner();
      this.config = checked.config;
      if (password !== undefined) this.password = password === '' ? null : password;
      if (!this.config.username) this.password = null;
      this.save();
      this.set('off', null);
    }).then(() => this.getState());
  }

  connect(): Promise<VpnState> {
    return this.run(() => this.connectInner()).then(() => this.getState());
  }

  disconnect(): Promise<VpnState> {
    return this.run(() => this.disconnectInner()).then(() => this.getState());
  }

  /** Handshake only; changes nothing about browsing. */
  async test(): Promise<{ ok: boolean; error?: string }> {
    const checked = validateVpnConfig(this.config);
    if (!checked.ok) return { ok: false, error: checked.error };
    const result = await probeProxy(this.config, this.password);
    return result.ok ? { ok: true } : { ok: false, error: result.error };
  }

  /**
   * Asks a public "what is my IP" service (api.ipify.org) twice: through the tunnel and directly. User-initiated only,
   * because it contacts a third party.
   */
  async checkIp(fetchImpl?: (ses: Session, url: string) => Promise<string>): Promise<{ viaVpn?: string; direct?: string; error?: string }> {
    const get =
      fetchImpl ??
      (async (ses: Session, url: string) => {
        const ctl = new AbortController();
        const t = setTimeout(() => ctl.abort(), 8000);
        try {
          const res = await ses.fetch(url, { signal: ctl.signal, cache: 'no-store' });
          const body = (await res.json()) as { ip?: string };
          if (!body.ip) throw new Error('unexpected answer');
          return body.ip;
        } finally {
          clearTimeout(t);
        }
      });
    const { session } = await import('electron');
    const result: { viaVpn?: string; direct?: string; error?: string } = {};
    try {
      result.viaVpn = await get(session.defaultSession, IP_CHECK_URL);
    } catch {
      result.error = this.applied
        ? 'Could not reach the IP service through the tunnel. The VPN server may be blocking it, or it is down.'
        : 'Could not reach the IP service. Check your internet connection.';
    }
    try {
      const direct = session.fromPartition('dash-vpn-direct-check');
      await direct.setProxy({ mode: 'direct' });
      result.direct = await get(direct, IP_CHECK_URL);
    } catch {
      /* the direct comparison is a bonus */
    }
    return result;
  }

  /** Answer the server's login prompt, but only for the configured server and never in a loop. */
  handleLogin(info: AuthInfo): { username: string; password: string } | null {
    if (!this.applied || !info.isProxy) return null;
    if (info.host.toLowerCase() !== this.config.host.toLowerCase() || info.port !== this.config.port) return null;
    if (!this.config.username || this.password === null) return null;
    const now = Date.now();
    this.authFailures = this.authFailures.filter((t) => now - t < AUTH_FAIL_WINDOW_MS);
    this.authFailures.push(now);
    if (this.authFailures.length > AUTH_FAIL_LIMIT) {
      this.log('VPN: the server keeps rejecting the saved login');
      if (this.status !== 'error') this.set('error', 'The server rejected the username or password. Traffic is blocked until you fix it or turn the VPN off.');
      return null;
    }
    return { username: this.config.username, password: this.password };
  }

  /** Called once at startup, before windows exist. */
  async connectOnStartupIfWanted(): Promise<void> {
    if (!this.config.connectOnStartup) return;
    await this.run(async () => {
      await this.connectInner(true);
    });
  }

  /** Called at quit: stop timers. Sessions are torn down with the process. */
  dispose(): void {
    if (this.monitor) clearTimeout(this.monitor);
    this.monitor = null;
  }

  // ---- internals ----
  private async connectInner(atStartup = false): Promise<void> {
    if (this.applied && this.status === 'on') return;
    const checked = validateVpnConfig(this.config);
    if (!checked.ok) {
      this.set('error', checked.error);
      return;
    }
    this.set('connecting');
    const probe = await probeProxy(this.config, this.password);
    if (!probe.ok) {
      this.log(`VPN connect failed: ${probe.error}`);
      if (atStartup && this.config.killSwitch) {
        // Asked to be private from the first page: fail closed rather than browse unprotected.
        try {
          await this.applyAll();
        } catch (e) {
          this.log(`VPN: could not apply kill switch: ${String(e)}`);
        }
        this.startMonitor(MONITOR_RETRY_MS);
        this.set('error', `${probe.error} Traffic is blocked (kill switch) until the server is reachable. You can turn the VPN off to browse directly.`);
      } else {
        this.set('error', `${probe.error} Not connected, so your traffic is not protected.`);
      }
      return;
    }
    try {
      await this.applyAll();
    } catch (err) {
      this.log(`VPN: applying proxy failed: ${err instanceof Error ? err.message : String(err)}`);
      await this.clearAll().catch(() => undefined);
      this.set('error', 'Could not switch the browser to the VPN. Nothing was changed.');
      return;
    }
    this.authFailures = [];
    this.since = Date.now();
    this.set('on');
    this.startMonitor(MONITOR_OK_MS);
    this.log(`VPN connected via ${this.config.protocol}://${this.config.host}:${this.config.port}`);
  }

  private async disconnectInner(): Promise<void> {
    if (this.monitor) clearTimeout(this.monitor);
    this.monitor = null;
    try {
      await this.clearAll();
    } catch (err) {
      this.log(`VPN: restoring direct connection failed: ${err instanceof Error ? err.message : String(err)}`);
    }
    this.since = null;
    this.set('off');
  }

  private startMonitor(delay: number): void {
    if (this.monitor) clearTimeout(this.monitor);
    this.monitor = setTimeout(() => void this.tick(), delay);
  }

  private async tick(): Promise<void> {
    this.monitor = null;
    if (!this.applied) return;
    const probe = await probeProxy(this.config, this.password);
    if (probe.ok) {
      if (this.status === 'error' && !this.error?.includes('rejected')) {
        this.since = Date.now();
        this.set('on');
        this.log('VPN recovered');
      }
      this.startMonitor(MONITOR_OK_MS);
      return;
    }
    if (this.status !== 'error') this.log(`VPN connection lost: ${probe.error}`);
    if (this.config.killSwitch) {
      this.set('error', `Connection lost: ${probe.error} Traffic is blocked (kill switch). DASH keeps retrying; you can also turn the VPN off.`);
      this.startMonitor(MONITOR_RETRY_MS);
    } else {
      await this.run(() => this.disconnectInner());
      this.set('error', `Connection lost: ${probe.error} The VPN was turned off, so your traffic is now going directly.`);
    }
  }
}
