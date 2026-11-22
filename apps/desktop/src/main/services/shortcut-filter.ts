/** Minimal shape of Electron's before-input-event `Input`, so this stays unit-testable. */
export interface KeyInput {
  type: string;
  key: string;
  control: boolean;
  meta: boolean;
  shift: boolean;
  alt: boolean;
}

const MOD_KEYS = new Set(['n', 't', 'w', 'l', 'k', 'e', 'g', 'r', 'h', 'j', 'd', 'f', 'p', 's', '=', '+', '-', '0', '_', 'tab', 'pageup', 'pagedown', '/']);
const MOD_SHIFT_KEYS = new Set(['b', 'o', 'a', 'i', 'r', 'j', 'w', 'delete', 't', 'n', 'g']);

/**
 * True for key combos that DASH handles at browser level. Web pages hold
 * keyboard focus when the user is reading them, so the main process
 * intercepts exactly these combos before the page sees them and forwards
 * them to the toolbar's handler. Anything else (Ctrl+C/V/X/A/Z, typing,
 * arrows) is left alone so pages and text fields behave normally.
 */
export function isBrowserShortcut(input: KeyInput): boolean {
  if (input.type !== 'keyDown') return false;
  const key = input.key.toLowerCase();
  const mod = input.control || input.meta;

  if (key === 'f12' || key === 'f5' || key === 'f6' || key === 'f3') return true;
  if (input.alt && !mod && (key === 'd' || key === 'home')) return true;
  if (key === 'escape' && input.shift) return true;
  if (input.alt && !mod && (key === 'arrowleft' || key === 'arrowright')) return true;
  if (mod && input.alt && key === 'l') return true; // Ctrl+Alt+L: lock DASH
  if (!mod || input.alt) return false;
  if (/^[1-9]$/.test(key)) return true;
  if (MOD_KEYS.has(key)) return true;
  return input.shift && MOD_SHIFT_KEYS.has(key);
}
