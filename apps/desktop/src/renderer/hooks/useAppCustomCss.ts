import { useEffect } from 'react';
import type { DashSettings } from '../../shared/ipc-channels';

const STYLE_ID = 'dash-app-custom-css';

/** Applies the user's browser-theme CSS (Settings → Appearance) to this renderer window, live. */
export function useAppCustomCss(settings: Pick<DashSettings, 'appCustomCss' | 'appCustomCssEnabled'>): void {
  const css = settings.appCustomCssEnabled ? settings.appCustomCss : '';
  useEffect(() => {
    let el = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
    if (!css) {
      el?.remove();
      return;
    }
    if (!el) {
      el = document.createElement('style');
      el.id = STYLE_ID;
    }
    el.textContent = css;
    // Last in <head>, so it wins over the built-in theme at equal specificity.
    document.head.appendChild(el);
  }, [css]);
}
