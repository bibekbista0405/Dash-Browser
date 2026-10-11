import { useEffect } from 'react';
import type { ThemeMode } from '../../shared/ipc-channels';

export function useTheme(theme: ThemeMode): void {
  useEffect(() => {
    const root = document.documentElement;

    const applyResolved = (isDark: boolean) => {
      root.classList.toggle('dark', isDark);
      root.classList.toggle('light', !isDark);
    };

    if (theme === 'system') {
      const media = window.matchMedia('(prefers-color-scheme: dark)');
      applyResolved(media.matches);
      const listener = (e: MediaQueryListEvent) => applyResolved(e.matches);
      media.addEventListener('change', listener);
      return () => media.removeEventListener('change', listener);
    }

    applyResolved(theme === 'dark');
    return undefined;
  }, [theme]);
}
