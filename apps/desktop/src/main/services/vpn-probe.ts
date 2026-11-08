import net from 'node:net';
import tls from 'node:tls';
import type { VpnConfig } from '../../shared/ipc-channels';

export type ProbeResult = { ok: true } | { ok: false; error: string };

const PROBE_TIMEOUT_MS = 7000;

/** Turns a Node socket error into a sentence a person can act on. */
export function describeProbeError(err: NodeJS.ErrnoException, cfg: Pick<VpnConfig, 'host' | 'port'>): string {
  const where = `${cfg.host}:${cfg.port}`;
  switch (err.code) {
    case 'ECONNREFUSED':
      return `The server at ${where} refused the connection. Check the address and port, and that the server is running.`;
    case 'ENOTFOUND':
    case 'EAI_AGAIN':
      return `Could not find "${cfg.host}". Check the spelling and your internet connection.`;
    case 'ETIMEDOUT':
    case 'EHOSTUNREACH':
    case 'ENETUNREACH':
      return `Could not reach ${where}. Check your internet connection, or whether a firewall blocks this port.`;
    case 'ECONNRESET':
    case 'EPIPE':
      return `The server at ${where} closed the connection straight away. The protocol (HTTPS, HTTP or SOCKS5) may be wrong for this port.`;
    case 'CERT_HAS_EXPIRED':
      return `The server's security certificate has expired.`;
    case 'DEPTH_ZERO_SELF_SIGNED_CERT':
    case 'SELF_SIGNED_CERT_IN_CHAIN':
    case 'UNABLE_TO_VERIFY_LEAF_SIGNATURE':
      return `The server's security certificate is not trusted, so DASH will not send traffic through it.`;
    case 'ERR_TLS_CERT_ALTNAME_INVALID':
      return `The server's security certificate does not match "${cfg.host}", so DASH will not send traffic through it.`;
    case 'ERR_SSL_WRONG_VERSION_NUMBER':
      return `${where} does not speak HTTPS. Try the HTTP or SOCKS5 protocol instead.`;
    default:
      return `Could not connect to ${where}${err.code ? ` (${err.code})` : ''}${err.message ? `: ${err.message}` : ''}`;
  }
}

/**
 * A real handshake with the server, not just "is the port open":
 *  - HTTPS: TLS with full certificate validation, then an HTTP CONNECT
 *  - HTTP: an HTTP CONNECT (detects a login the server wants)
 *  - SOCKS5: the method-negotiation greeting
 * The CONNECT targets a reserved ".invalid" name, so nothing real is contacted.
 */
export function probeProxy(cfg: VpnConfig, password: string | null, timeoutMs = PROBE_TIMEOUT_MS): Promise<ProbeResult> {
  return new Promise((resolve) => {
    let settled = false;
    let socket: net.Socket | tls.TLSSocket | null = null;
    const finish = (result: ProbeResult): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket?.destroy();
      resolve(result);
    };
    const timer = setTimeout(() => finish({ ok: false, error: `The server at ${cfg.host}:${cfg.port} did not answer within ${Math.round(timeoutMs / 1000)} seconds.` }), timeoutMs);
    const fail = (err: NodeJS.ErrnoException): void => finish({ ok: false, error: describeProbeError(err, cfg) });

    const onConnected = (): void => {
      if (!socket) return;
      let buf = Buffer.alloc(0);
      socket.on('data', (chunk: Buffer) => {
        buf = Buffer.concat([buf, chunk]);
        if (cfg.protocol === 'socks5') {
          if (buf.length < 2) return;
          if (buf[0] !== 5) return finish({ ok: false, error: `${cfg.host}:${cfg.port} is not a SOCKS5 server.` });
          if (buf[1] === 0) return finish({ ok: true });
          return finish({ ok: false, error: 'This SOCKS5 server wants a username and password, which the browser engine cannot send. Use an HTTPS or HTTP proxy instead.' });
        }
        const text = buf.toString('latin1');
        const eol = text.indexOf('\r\n');
        if (eol === -1) return;
        const m = /^HTTP\/1\.[01] (\d{3})/.exec(text.slice(0, eol));
        if (!m) return finish({ ok: false, error: `${cfg.host}:${cfg.port} did not answer like an HTTP proxy. Try another protocol.` });
        if (m[1] === '407') {
          return finish({ ok: false, error: cfg.username ? 'The server rejected the username or password.' : 'The server needs a username and password.' });
        }
        return finish({ ok: true });
      });
      socket.on('end', () => finish({ ok: false, error: `The server at ${cfg.host}:${cfg.port} closed the connection without answering.` }));
      if (cfg.protocol === 'socks5') {
        socket.write(Buffer.from([5, 1, 0]));
      } else {
        const auth = cfg.username && password ? `Proxy-Authorization: Basic ${Buffer.from(`${cfg.username}:${password}`).toString('base64')}\r\n` : '';
        socket.write(`CONNECT dash-probe.invalid:443 HTTP/1.1\r\nHost: dash-probe.invalid:443\r\n${auth}\r\n`);
      }
    };

    try {
      if (cfg.protocol === 'https') {
        const options: tls.ConnectionOptions = { host: cfg.host, port: cfg.port, rejectUnauthorized: true };
        if (!net.isIP(cfg.host)) options.servername = cfg.host;
        socket = tls.connect(options, onConnected);
      } else {
        socket = net.connect({ host: cfg.host, port: cfg.port }, onConnected);
      }
      socket.on('error', fail);
    } catch (err) {
      fail(err as NodeJS.ErrnoException);
    }
  });
}
