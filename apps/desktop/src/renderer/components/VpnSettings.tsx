import { useEffect, useState } from 'react';
import { VPN_PROTOCOLS, type VpnConfig, type VpnProtocol } from '../../shared/ipc-channels';
import { useVpnStore } from '../store/vpn-store';

const PROTOCOL_LABEL: Record<VpnProtocol, string> = {
  https: 'HTTPS proxy (encrypted to the server, recommended)',
  http: 'HTTP proxy (not encrypted to the server)',
  socks5: 'SOCKS5 (no login; e.g. Tor or an SSH tunnel)',
};
const DEFAULT_PORT: Record<VpnProtocol, number> = { https: 443, http: 8080, socks5: 1080 };

/** Settings → VPN. Off by default; browser traffic only. */
export function VpnSettings() {
  const { state, start } = useVpnStore();
  const [draft, setDraft] = useState<VpnConfig>(state.config);
  const [password, setPassword] = useState('');
  const [passwordTouched, setPasswordTouched] = useState(false);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [ip, setIp] = useState<{ viaVpn?: string; direct?: string; error?: string } | null>(null);

  useEffect(() => start(), [start]);
  useEffect(() => setDraft(state.config), [state.config]);

  const dirty = JSON.stringify(draft) !== JSON.stringify(state.config) || passwordTouched;
  const on = state.status === 'on';
  const wrap = async (name: string, work: () => Promise<void>) => {
    setBusy(name);
    setMessage(null);
    try {
      await work();
    } catch (e) {
      setMessage({ kind: 'error', text: (e instanceof Error ? e.message : String(e)).replace(/^Error invoking remote method '[^']+': (Error: )?/, '').replace(/^DASH: /, '') });
    } finally {
      setBusy(null);
    }
  };

  const save = () =>
    wrap('save', async () => {
      await window.dash.vpn.setConfig(draft, passwordTouched ? password : undefined);
      setPassword('');
      setPasswordTouched(false);
      setMessage({ kind: 'ok', text: 'Saved.' });
    });

  const field = 'h-8 w-full rounded-md bg-surface-elevated border border-border/60 px-2.5 text-[13px] text-text-primary outline-none focus:border-accent';
  const btn = 'h-8 px-3 rounded-md text-[13px] border border-border/60 bg-surface-elevated text-text-secondary hover:bg-surface-hover disabled:opacity-40';

  const statusText =
    state.status === 'on'
      ? `Connected through ${state.config.host}:${state.config.port}`
      : state.status === 'connecting'
        ? 'Connecting…'
        : state.status === 'error'
          ? 'Problem'
          : 'Off. Your browsing goes out directly.';

  return (
    <div className="space-y-3" id="vpn">
      <div className="flex items-center justify-between rounded-lg border border-border/60 bg-surface-elevated px-3 py-2.5">
        <div>
          <div className="text-[13px] text-text-primary flex items-center gap-2">
            <span className={`h-2 w-2 rounded-full ${on ? 'bg-green-500' : state.status === 'error' ? 'bg-red-500' : state.status === 'connecting' ? 'bg-amber-500 animate-pulse' : 'bg-text-tertiary'}`} />
            {statusText}
          </div>
          {state.status === 'error' && state.error && <div className="mt-1 text-[12px] text-red-400 max-w-[34rem]">{state.error}</div>}
        </div>
        {on || (state.status === 'error' && state.error?.includes('blocked')) ? (
          <button className={btn} disabled={busy !== null} onClick={() => wrap('off', async () => void (await window.dash.vpn.disconnect()))}>
            Turn off
          </button>
        ) : (
          <button
            className={btn + ' !bg-accent !text-white !border-transparent'}
            disabled={busy !== null || dirty || !state.config.host || state.status === 'connecting'}
            title={dirty ? 'Save your changes first' : undefined}
            onClick={() => wrap('on', async () => void (await window.dash.vpn.connect()))}
          >
            {state.status === 'connecting' ? 'Connecting…' : 'Turn on'}
          </button>
        )}
      </div>

      <div className="text-[12px] text-text-tertiary">
        DASH does not provide a VPN server. Enter the details your VPN or proxy provider (or your own server) gave you. When on, all DASH tabs, including private tabs, go through it. Other apps on your computer are not affected.
      </div>

      <label className="block">
        <span className="text-[12px] text-text-secondary">Type</span>
        <select
          value={draft.protocol}
          onChange={(e) => {
            const protocol = e.target.value as VpnProtocol;
            setDraft({ ...draft, protocol, port: draft.port === DEFAULT_PORT[draft.protocol] ? DEFAULT_PORT[protocol] : draft.port, username: protocol === 'socks5' ? '' : draft.username });
          }}
          className={field}
        >
          {VPN_PROTOCOLS.map((p) => (
            <option key={p} value={p}>
              {PROTOCOL_LABEL[p]}
            </option>
          ))}
        </select>
      </label>
      <div className="flex gap-2">
        <label className="block flex-1">
          <span className="text-[12px] text-text-secondary">Server address</span>
          <input value={draft.host} onChange={(e) => setDraft({ ...draft, host: e.target.value })} placeholder="vpn.example.com" spellCheck={false} className={field} />
        </label>
        <label className="block w-24">
          <span className="text-[12px] text-text-secondary">Port</span>
          <input value={draft.port || ''} inputMode="numeric" onChange={(e) => setDraft({ ...draft, port: Number(e.target.value.replace(/\D/g, '')) })} className={field} />
        </label>
      </div>
      {draft.protocol !== 'socks5' && (
        <div className="flex gap-2">
          <label className="block flex-1">
            <span className="text-[12px] text-text-secondary">Username (optional)</span>
            <input value={draft.username} onChange={(e) => setDraft({ ...draft, username: e.target.value })} autoComplete="off" spellCheck={false} className={field} />
          </label>
          <label className="block flex-1">
            <span className="text-[12px] text-text-secondary">Password</span>
            <input
              type="password"
              value={password}
              placeholder={state.hasPassword && !passwordTouched ? '•••••••• (saved)' : ''}
              onChange={(e) => {
                setPassword(e.target.value);
                setPasswordTouched(true);
              }}
              autoComplete="new-password"
              className={field}
            />
          </label>
        </div>
      )}
      {draft.username && !state.encryptionAvailable && (
        <div className="text-[12px] text-amber-500">This computer has no secure storage for passwords, so the password is kept only until DASH closes.</div>
      )}

      <label className="flex items-center justify-between h-9 px-3 rounded-lg bg-surface-elevated border border-border/60 text-[13px] text-text-primary">
        Kill switch: block traffic if the VPN drops (recommended)
        <input type="checkbox" checked={draft.killSwitch} onChange={() => setDraft({ ...draft, killSwitch: !draft.killSwitch })} className="h-4 w-4 accent-[var(--accent)]" />
      </label>
      <label className="flex items-center justify-between h-9 px-3 rounded-lg bg-surface-elevated border border-border/60 text-[13px] text-text-primary">
        Turn on automatically when DASH starts
        <input type="checkbox" checked={draft.connectOnStartup} onChange={() => setDraft({ ...draft, connectOnStartup: !draft.connectOnStartup })} className="h-4 w-4 accent-[var(--accent)]" />
      </label>

      <div className="flex flex-wrap gap-2 items-center">
        <button className={btn + ' !bg-accent !text-white !border-transparent'} disabled={!dirty || busy !== null} onClick={save}>
          Save
        </button>
        <button
          className={btn}
          disabled={busy !== null || dirty || !state.config.host}
          title={dirty ? 'Save your changes first' : 'Checks the server without turning the VPN on'}
          onClick={() =>
            wrap('test', async () => {
              const r = await window.dash.vpn.test();
              setMessage(r.ok ? { kind: 'ok', text: 'The server answered correctly.' } : { kind: 'error', text: r.error ?? 'The test failed.' });
            })
          }
        >
          {busy === 'test' ? 'Testing…' : 'Test server'}
        </button>
        <button
          className={btn}
          disabled={busy !== null}
          title="Asks api.ipify.org (a third-party service) what address it sees. Only runs when you click."
          onClick={() =>
            wrap('ip', async () => {
              setIp(null);
              setIp(await window.dash.vpn.checkIp());
            })
          }
        >
          {busy === 'ip' ? 'Checking…' : 'Check my visible IP'}
        </button>
      </div>
      {message && <div className={`text-[12px] ${message.kind === 'ok' ? 'text-green-500' : 'text-red-400'}`}>{message.text}</div>}
      {ip && (
        <div className="text-[12px] text-text-secondary space-y-0.5">
          {ip.viaVpn && <div>Websites see: <span className="font-mono text-text-primary">{ip.viaVpn}</span>{on ? ' (through the VPN)' : ''}</div>}
          {ip.direct && <div>Without the VPN: <span className="font-mono text-text-primary">{ip.direct}</span></div>}
          {ip.viaVpn && ip.direct && on && <div className={ip.viaVpn !== ip.direct ? 'text-green-500' : 'text-red-400'}>{ip.viaVpn !== ip.direct ? 'The addresses differ, so the tunnel is working.' : 'Same address both ways. The server may be on your own network, or the tunnel is not applied.'}</div>}
          {ip.error && <div className="text-red-400">{ip.error}</div>}
        </div>
      )}
      <div className="text-[11px] text-text-tertiary">
        Local and private-network addresses (localhost, 192.168.x.x…) never use the VPN. SOCKS5 servers that need a login are not supported by the browser engine. DASH's own update check is skipped while the VPN is on.
      </div>
    </div>
  );
}
