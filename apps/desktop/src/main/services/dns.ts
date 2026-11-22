import { app } from 'electron';
import { DOH_PROVIDERS, type DashSettings } from '../../shared/ipc-channels';

let applied = false;

/**
 * Applies the DNS-over-HTTPS setting to Chromium's host resolver.
 *  - off: DASH does not touch the resolver at all (the operating system's DNS is used).
 *    If DoH was turned on earlier in this run, it is switched back off.
 *  - automatic: try the chosen DoH provider, fall back to the system resolver if it fails.
 *  - secure: DoH only; if the provider is unreachable, sites will not load.
 * Never throws: a bad resolver config must not stop the browser from starting.
 */
export function applyDnsSettings(settings: DashSettings): void {
  if (settings.dohMode === 'off' && !applied) return;
  try {
    const provider = DOH_PROVIDERS[settings.dohProvider];
    app.configureHostResolver({
      secureDnsMode: settings.dohMode,
      secureDnsServers: settings.dohMode === 'off' ? [] : [provider.url],
    });
    applied = settings.dohMode !== 'off';
  } catch (err) {
    console.error('[DASH] Could not apply DNS settings:', (err as Error).message);
  }
}
