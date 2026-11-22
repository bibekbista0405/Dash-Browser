import { useCallback, useEffect, useRef, useState } from 'react';
import type { AiChatMessage, AiStatus } from '../../shared/ipc-channels';

interface Turn extends AiChatMessage {
  error?: boolean;
}

const MODEL_KEY = 'dash.ai.model';
const readModel = (): string => {
  try {
    return localStorage.getItem(MODEL_KEY) ?? '';
  } catch {
    return '';
  }
};

/**
 * Chat with a model running on this computer through Ollama. Nothing is sent to any online service; if Ollama isn't
 * installed or running this page says so instead of pretending.
 */
export function AiPage({ compact = false }: { compact?: boolean }) {
  const [status, setStatus] = useState<AiStatus | null>(null);
  const [model, setModel] = useState(readModel);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState('');
  const [usePage, setUsePage] = useState(true);
  const [pageUrl, setPageUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const currentId = useRef<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    setStatus(null);
    const s = await window.dash.ai.status();
    setStatus(s);
    setModel((m) => (s.models.includes(m) ? m : s.models[0] ?? ''));
    setPageUrl(await window.dash.sidePanel.activeUrl().catch(() => null));
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    try {
      if (model) localStorage.setItem(MODEL_KEY, model);
    } catch {
      /* storage unavailable: choice just isn't remembered */
    }
  }, [model]);

  useEffect(
    () =>
      window.dash.ai.onEvent((ev) => {
        if (ev.id !== currentId.current) return;
        if (ev.delta) {
          setTurns((t) => {
            const last = t[t.length - 1];
            return last?.role === 'assistant' && !last.error ? [...t.slice(0, -1), { ...last, content: last.content + ev.delta }] : t;
          });
        }
        if (ev.error) {
          setTurns((t) => [...t.filter((x, i) => !(i === t.length - 1 && x.role === 'assistant' && x.content === '')), { role: 'assistant', content: ev.error ?? 'Request failed', error: true }]);
        }
        if (ev.done || ev.error) {
          setBusy(false);
          currentId.current = null;
        }
      }),
    []
  );

  useEffect(() => endRef.current?.scrollIntoView({ block: 'end' }), [turns]);

  const send = async (text: string) => {
    const content = text.trim();
    if (!content || busy || !model) return;
    const history: AiChatMessage[] = [...turns.filter((t) => !t.error).map(({ role, content: c }) => ({ role, content: c })), { role: 'user', content }];
    const id = crypto.randomUUID();
    currentId.current = id;
    setBusy(true);
    setInput('');
    setTurns([...turns, { role: 'user', content }, { role: 'assistant', content: '' }]);
    try {
      await window.dash.ai.chat(id, model, history.slice(-20), usePage && !!pageUrl);
    } catch (e) {
      setBusy(false);
      currentId.current = null;
      setTurns((t) => [...t.slice(0, -1), { role: 'assistant', content: e instanceof Error ? e.message : 'Request failed', error: true }]);
    }
  };

  const stop = () => {
    if (currentId.current) void window.dash.ai.cancel(currentId.current);
  };

  const chip = 'h-7 px-3 rounded-full border border-border text-[12px] text-text-secondary hover:text-text-primary hover:border-text-tertiary disabled:opacity-40';

  return (
    <div className={`h-full flex flex-col ${compact ? 'p-3' : 'p-8 max-w-2xl mx-auto'}`}>
      {!compact && <h1 className="text-[22px] font-semibold mb-1">AI helper</h1>}
      <p className="text-[11px] text-text-tertiary leading-relaxed">
        Runs on a model on your own computer through Ollama. Nothing leaves this device. Answers can be wrong.
      </p>

      {status === null && <p className="mt-4 text-[13px] text-text-secondary">Looking for Ollama…</p>}

      {status && !status.available && (
        <div className="mt-4 rounded-lg border border-border bg-surface-elevated p-4 text-[13px] space-y-2">
          <p className="text-text-primary font-medium">Local AI isn&apos;t set up yet</p>
          <p className="text-text-secondary">{status.reason}</p>
          <ol className="list-decimal pl-5 text-text-secondary space-y-1">
            <li>Install Ollama from ollama.com</li>
            <li>
              In a terminal, run <code className="px-1 rounded bg-surface">ollama pull llama3.2</code>
            </li>
            <li>Come back here and press Retry</li>
          </ol>
          <button className={chip} onClick={() => void refresh()}>
            Retry
          </button>
        </div>
      )}

      {status?.available && (
        <>
          <div className="mt-3 flex items-center gap-2">
            <select
              aria-label="Model"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="h-7 flex-1 min-w-0 rounded-md bg-surface border border-border/60 text-[12px] text-text-primary px-2"
            >
              {status.models.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
            <button className={chip} onClick={() => setTurns([])} disabled={busy || turns.length === 0}>
              Clear
            </button>
          </div>

          <label className={`mt-2 flex items-center gap-1.5 text-[12px] ${pageUrl ? 'text-text-secondary' : 'text-text-tertiary'}`} title={pageUrl ?? 'Open a web page to ask about it'}>
            <input type="checkbox" disabled={!pageUrl} checked={usePage && !!pageUrl} onChange={(e) => setUsePage(e.target.checked)} />
            Let it read the current page
          </label>

          <div className="mt-3 flex-1 min-h-0 overflow-y-auto space-y-3 pr-0.5" aria-live="polite">
            {turns.length === 0 && (
              <div className="py-4 space-y-2">
                <p className="text-[12px] text-text-tertiary">Ask anything, or:</p>
                <div className="flex flex-wrap gap-2">
                  <button className={chip} disabled={!pageUrl || busy} onClick={() => { setUsePage(true); void send('Summarize this page in a few short bullet points.'); }}>
                    Summarize page
                  </button>
                  <button className={chip} disabled={!pageUrl || busy} onClick={() => { setUsePage(true); void send('What are the key facts and takeaways on this page?'); }}>
                    Key points
                  </button>
                </div>
              </div>
            )}
            {turns.map((t, i) => (
              <div key={i} className={t.role === 'user' ? 'text-right' : ''}>
                <div
                  className={`inline-block max-w-[92%] text-left rounded-xl px-3 py-2 text-[13px] whitespace-pre-wrap break-words ${
                    t.role === 'user' ? 'bg-accent text-white' : t.error ? 'bg-red-500/10 text-red-500 border border-red-500/30' : 'bg-surface-elevated text-text-primary border border-border/70'
                  }`}
                >
                  {t.content || (busy && i === turns.length - 1 ? '…' : '')}
                </div>
              </div>
            ))}
            <div ref={endRef} />
          </div>

          <div className="mt-3 flex items-end gap-2">
            <textarea
              aria-label="Message"
              value={input}
              rows={2}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void send(input);
                }
              }}
              placeholder="Ask about this page or anything else"
              className="flex-1 resize-none rounded-lg bg-surface border border-border/70 text-[13px] text-text-primary px-3 py-2 outline-none focus:border-accent"
            />
            {busy ? (
              <button onClick={stop} className="h-9 px-4 rounded-full bg-surface-elevated border border-border text-[12px]">
                Stop
              </button>
            ) : (
              <button onClick={() => void send(input)} disabled={!input.trim()} className="h-9 px-4 rounded-full bg-accent text-white text-[12px] font-medium disabled:opacity-40">
                Send
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
