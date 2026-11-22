import { useCallback, useEffect, useState } from 'react';
import type { SiteInfo, TabState } from '../../shared/ipc-channels';

const PERMISSION_LABEL: Record<string, string> = {
  notifications: 'Notifications',
  geolocation: 'Location',
  camera: 'Camera',
  microphone: 'Microphone',
  'clipboard-read': 'Clipboard',
};

/** Lock-icon panel: what DASH knows and does for the page in this tab, with the controls that apply to this site only. */
export function SitePanel({ tab, onClose }: { tab: TabState; onClose: () => void }) {
  const [info, setInfo] = useState<SiteInfo | null>(null);
  const [message, setMessage] = useState('');

  const load = useCallback(() => {
    void window.dash.tabs.siteInfo(tab.id).then(setInfo);
  }, [tab.id]);

  useEffect(() => {
    load();
  }, [load, tab.url]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const toggleProtection = async () => {
    if (!info?.host) return;
    await window.dash.tabs.setSiteProtection(info.host, !info.blockingOff);
    setMessage('Reload the page for this to take effect.');
    load();
  };

  const clearData = async () => {
    const n = await window.dash.tabs.clearSiteData(tab.id);
    setMessage(n > 0 ? `Cleared ${n} cookie${n === 1 ? '' : 's'} and this site's stored data. Reload to start fresh.` : "Cleared this site's stored data.");
    load();
  };

  const forget = async (id: number) => {
    await window.dash.permissions.remove(id);
    load();
  };

  const isWeb = info?.scheme === 'https' || info?.scheme === 'http';
  const connection =
    info?.scheme === 'https'
      ? { title: 'Connection is encrypted', body: 'Data sent to this site is encrypted in transit (HTTPS).', tone: 'text-accent' }
      : info?.scheme === 'http'
        ? { title: 'Connection is not encrypted', body: "Anyone on your network could read what you send. Don't enter passwords or personal details.", tone: 'text-amber-500' }
        : info?.scheme === 'internal'
          ? { title: 'A DASH page', body: 'This page is part of DASH and does not use the network.', tone: 'text-text-secondary' }
          : info?.scheme === 'file'
            ? { title: 'A file on this computer', body: 'Opened from your own disk.', tone: 'text-text-secondary' }
            : { title: 'No details available', body: '', tone: 'text-text-secondary' };

  return (
    <>
      <div className="fixed inset-0 z-40 app-no-drag" onClick={onClose} />
      <div
        role="dialog"
        aria-label="Site information"
        className="absolute left-0 top-11 z-50 w-[340px] rounded-xl border border-border bg-surface-elevated shadow-2xl app-no-drag"
      >
        {!info ? (
          <div className="px-4 py-4 text-[13px] text-text-tertiary">Loading…</div>
        ) : (
          <div className="py-1">
            <div className="px-4 pt-3 pb-2">
              <div className="text-[14px] font-medium text-text-primary truncate">{info.host || tab.title || 'This page'}</div>
              <div className={`text-[12px] mt-0.5 ${connection.tone}`}>{connection.title}</div>
              {connection.body && <div className="text-[12px] text-text-tertiary mt-0.5">{connection.body}</div>}
              {info.isPrivate && <div className="text-[12px] text-purple-300 mt-1">Private tab: nothing from this tab is saved.</div>}
            </div>

            {isWeb && (
              <>
                <div className="border-t border-border/50 px-4 py-2.5 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] text-text-primary">Ad and tracker blocking</div>
                    <div className="text-[12px] text-text-tertiary">
                      {tab.blockedCount} blocked on this page{info.blockingOff ? ' (blocking is off for this site)' : ''}
                    </div>
                  </div>
                  <button
                    role="switch"
                    aria-checked={!info.blockingOff}
                    aria-label="Ad and tracker blocking on this site"
                    onClick={toggleProtection}
                    className={`relative h-5 w-9 rounded-full shrink-0 transition-colors ${info.blockingOff ? 'bg-surface-hover' : 'bg-accent'}`}
                  >
                    <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${info.blockingOff ? 'left-0.5' : 'left-[18px]'}`} />
                  </button>
                </div>

                <div className="border-t border-border/50 px-4 py-2.5 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] text-text-primary">Cookies</div>
                    <div className="text-[12px] text-text-tertiary">
                      {info.cookieCount === 0 ? 'None set for this site' : `${info.cookieCount} this page can send`}
                    </div>
                  </div>
                  <button
                    onClick={clearData}
                    className="text-[12px] px-2.5 py-1 rounded-md border border-border text-text-secondary hover:text-text-primary hover:bg-surface-hover shrink-0"
                  >
                    Clear site data
                  </button>
                </div>

                <div className="border-t border-border/50 px-4 py-2.5">
                  <div className="text-[13px] text-text-primary mb-1">Permissions</div>
                  {info.permissions.length === 0 ? (
                    <div className="text-[12px] text-text-tertiary">{info.isPrivate ? 'Not saved in private tabs.' : 'No saved choices for this site.'}</div>
                  ) : (
                    info.permissions.map((p) => (
                      <div key={p.id} className="flex items-center gap-2 py-1">
                        <span className="flex-1 text-[12px] text-text-secondary">{PERMISSION_LABEL[p.permission] ?? p.permission}</span>
                        <span className={`text-[11px] px-1.5 py-0.5 rounded ${p.decision === 'granted' ? 'text-accent bg-accent/15' : 'text-text-tertiary bg-surface'}`}>
                          {p.decision === 'granted' ? 'Allowed' : 'Blocked'}
                        </span>
                        <button onClick={() => forget(p.id)} className="text-[11px] text-text-tertiary hover:text-text-primary">
                          Reset
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </>
            )}

            {message && (
              <div className="border-t border-border/50 px-4 py-2 flex items-center gap-2">
                <span className="flex-1 text-[12px] text-text-secondary">{message}</span>
                <button onClick={() => window.dash.tabs.reload(tab.id)} className="text-[12px] text-accent hover:underline shrink-0">
                  Reload
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
