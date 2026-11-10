import { useEffect } from 'react';
import type { DashSettings } from '../../shared/ipc-channels';

/** Applies the accessibility choices (Settings → Accessibility) to this window as classes on <html>. */
export function useAccessibility(settings: Pick<DashSettings, 'highContrast' | 'reduceMotion' | 'alwaysShowFocus'>): void {
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('a11y-high-contrast', settings.highContrast);
    root.classList.toggle('a11y-reduce-motion', settings.reduceMotion);
    root.classList.toggle('a11y-focus', settings.alwaysShowFocus);
  }, [settings.highContrast, settings.reduceMotion, settings.alwaysShowFocus]);
}
