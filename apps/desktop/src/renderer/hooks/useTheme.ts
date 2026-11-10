import { useEffect, useRef } from 'react';
import type { ThemeMode } from '../../shared/ipc-channels';

type ViewTransitionDocument = Document & { startViewTransition?: (update: () => void) => { finished: Promise<void> } };

/**
 * Applies the colour theme to <html>.
 *
 * Switching is done as ONE cross-fade of the whole window (View Transitions), with per-element CSS transitions
 * paused for the swap. Before this, each control faded on its own timer while plain backgrounds and text snapped,
 * so for a few frames the window was half old theme, half new (the flicker people saw). With "reduce motion" on,
 * or where View Transitions are missing, the swap is a single instant repaint instead.
 */
export function useTheme(theme: ThemeMode): void {
  const first = useRef(true);

  useEffect(() => {
    const root = document.documentElement;

    const paint = (isDark: boolean) => {
      root.classList.toggle('dark', isDark);
      root.classList.toggle('light', !isDark);
    };

    const apply = (isDark: boolean) => {
      if (root.classList.contains(isDark ? 'dark' : 'light') && !root.classList.contains(isDark ? 'light' : 'dark')) return;
      const initial = first.current;
      first.current = false;
      if (initial) {
        paint(isDark); // first paint: no animation
        return;
      }
      const reduce = root.classList.contains('a11y-reduce-motion') || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const doc = document as ViewTransitionDocument;
      root.classList.add('theme-swap');
      const done = () => root.classList.remove('theme-swap');
      if (!reduce && !document.hidden && typeof doc.startViewTransition === 'function') {
        const t = doc.startViewTransition(() => paint(isDark));
        void t.finished.then(done, done);
      } else {
        paint(isDark);
        // Hidden pages don't run animation frames, so a timer clears the pause as well.
        window.setTimeout(done, 80);
      }
    };

    if (theme === 'system') {
      const media = window.matchMedia('(prefers-color-scheme: dark)');
      apply(media.matches);
      const listener = (e: MediaQueryListEvent) => apply(e.matches);
      media.addEventListener('change', listener);
      return () => media.removeEventListener('change', listener);
    }

    apply(theme === 'dark');
    return undefined;
  }, [theme]);
}
