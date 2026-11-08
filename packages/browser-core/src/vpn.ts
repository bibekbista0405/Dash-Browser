/** Browser-traffic VPN: routes all DASH tabs through a proxy server the user configures. */

export const VPN_PROTOCOLS = ['https', 'http', 'socks5'] as const;
export type VpnProtocol = (typeof VPN_PROTOCOLS)[number];

export type VpnStatus = 'off' | 'connecting' | 'on' | 'error';

export interface VpnConfig {
  protocol: VpnProtocol;
  host: string;
  port: number;
  username: string;
  /** When the tunnel drops, keep it applied so traffic fails instead of silently going direct. */
  killSwitch: boolean;
  connectOnStartup: boolean;
}

export interface VpnState {
  status: VpnStatus;
  config: VpnConfig;
  /** A password is available (saved or held in memory for this session). */
  hasPassword: boolean;
  /** The password is stored on disk (encrypted by the OS). False means it is memory-only. */
  passwordPersisted: boolean;
  /** OS secure storage works on this machine, so passwords can be saved. */
  encryptionAvailable: boolean;
  error: string | null;
  /** epoch ms when the tunnel last came up, or null. */
  since: number | null;
}

export const DEFAULT_VPN_CONFIG: VpnConfig = {
  protocol: 'https',
  host: '',
  port: 443,
  username: '',
  killSwitch: true,
  connectOnStartup: false,
};

const HOSTNAME = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/i;
const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
const IPV6 = /^[0-9a-f:]+$/i;

/** Returns a clean config or an error message a person can act on. */
export function validateVpnConfig(input: unknown): { ok: true; config: VpnConfig } | { ok: false; error: string } {
  if (typeof input !== 'object' || input === null) return { ok: false, error: 'Invalid VPN settings.' };
  const c = input as Record<string, unknown>;
  const protocol = c.protocol;
  if (typeof protocol !== 'string' || !(VPN_PROTOCOLS as readonly string[]).includes(protocol)) {
    return { ok: false, error: 'Choose HTTPS, HTTP or SOCKS5.' };
  }
  const host = typeof c.host === 'string' ? c.host.trim().replace(/^\[|\]$/g, '') : '';
  if (!host) return { ok: false, error: 'Enter the server address.' };
  if (host.length > 253 || /[\s/@?#]/.test(host)) {
    return { ok: false, error: 'The server address should be just a host name or IP, with no http:// or path.' };
  }
  const v4 = IPV4.exec(host);
  const validV4 = v4 !== null && v4.slice(1).every((n) => Number(n) <= 255);
  const validV6 = host.includes(':') && IPV6.test(host);
  const looksNumeric = /^[\d.]+$/.test(host);
  if (!validV4 && !validV6 && (looksNumeric || !HOSTNAME.test(host))) {
    return { ok: false, error: `"${host}" is not a valid server address.` };
  }
  const port = Number(c.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535) return { ok: false, error: 'The port must be a number from 1 to 65535.' };
  const username = typeof c.username === 'string' ? c.username : '';
  if (username.length > 256 || /[\u0000-\u001f]/.test(username)) return { ok: false, error: 'The username is invalid.' };
  if (protocol === 'socks5' && username) {
    return { ok: false, error: 'SOCKS5 with a username and password is not supported by the browser engine. Use an HTTPS or HTTP proxy, or a SOCKS5 server without a login (for example Tor or an SSH tunnel).' };
  }
  return {
    ok: true,
    config: {
      protocol: protocol as VpnProtocol,
      host,
      port,
      username,
      killSwitch: c.killSwitch !== false,
      connectOnStartup: c.connectOnStartup === true,
    },
  };
}

/** Chromium proxy rules for a config. IPv6 hosts need brackets. */
export function buildProxyRules(config: Pick<VpnConfig, 'protocol' | 'host' | 'port'>): string {
  const host = config.host.includes(':') ? `[${config.host}]` : config.host;
  return `${config.protocol}://${host}:${config.port}`;
}

/** Traffic that must never go through the tunnel: this machine and private networks. */
export const VPN_BYPASS_RULES = 'localhost;127.0.0.1;[::1];<local>;10.0.0.0/8;172.16.0.0/12;192.168.0.0/16;169.254.0.0/16';
