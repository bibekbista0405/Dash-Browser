import { useEffect, useState } from 'react';
import { Modal } from './website-lock/glass';
import { useDetachesActiveViewWhileOpen } from '../hooks/useDetachesActiveViewWhileOpen';

const mac = typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform);
const M = mac ? '⌘' : 'Ctrl';

const GROUPS: { title: string; rows: [string, string][] }[] = [
  { title: 'Tabs', rows: [
    ['New tab', `${M}+T`], ['Close tab', `${M}+W`], ['Reopen closed tab', `${M}+Shift+T`],
    ['Next / previous tab', `${M}+Tab / ${M}+Shift+Tab`], ['Go to tab 1–8 / last', `${M}+1…8 / ${M}+9`],
    ['New window', `${M}+N`], ['New private tab', `${M}+Shift+N`],
  ] },
  { title: 'Page', rows: [
    ['Focus address bar', `${M}+L  ·  F6  ·  Alt+D`], ['Reload', `${M}+R  ·  F5`], ['Find in page', `${M}+F  ·  F3`],
    ['Back / forward', 'Alt+← / Alt+→'], ['Home', 'Alt+Home'], ['Zoom in / out / reset', `${M}+ +  /  −  /  0`],
    ['Full screen', 'F11'], ['Print', `${M}+P`], ['Save page', `${M}+S`], ['Developer tools', 'F12'],
  ] },
  { title: 'DASH', rows: [
    ['Bookmark this page', `${M}+D`], ['Bookmarks', `${M}+Shift+O`], ['History', `${M}+H`], ['Downloads', `${M}+J`],
    ['AI helper', `${M}+Shift+A`], ['Lock DASH', `${M}+Alt+L`], ['This list', `${M}+/`],
  ] },
];

/** Cheat-sheet of every keyboard shortcut, opened with Ctrl+/ or from the menu. */
export function ShortcutsHelp() {
  const [open, setOpen] = useState(false);
  useDetachesActiveViewWhileOpen(open);
  useEffect(() => {
    const on = () => setOpen((v) => !v);
    window.addEventListener('dash:shortcuts-help', on);
    return () => window.removeEventListener('dash:shortcuts-help', on);
  }, []);
  if (!open) return null;
  return (
    <div className="wl-scope">
      <Modal title="Keyboard shortcuts" wide onClose={() => setOpen(false)}>
        <div className="grid gap-5 sm:grid-cols-2">
          {GROUPS.map((g) => (
            <section key={g.title} className={g.title === 'Page' ? 'sm:row-span-2' : ''}>
              <h3 className="text-[11px] font-semibold uppercase tracking-wider wl-muted mb-2">{g.title}</h3>
              <dl className="space-y-1.5">
                {g.rows.map(([a, k]) => (
                  <div key={a} className="flex items-baseline justify-between gap-3 text-[13px]">
                    <dt>{a}</dt>
                    <dd className="wl-muted text-[11.5px] text-right whitespace-nowrap">{k}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      </Modal>
    </div>
  );
}
