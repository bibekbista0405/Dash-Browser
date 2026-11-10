import type { Session } from 'electron';
import type { DashSettings } from '../../shared/ipc-channels';
import { appLog } from './app-log';

/**
 * Applies the spell-check choices to a session. Only languages Chromium reports as available are used.
 * The dictionaries themselves are downloaded by Chromium the first time a language is used (Windows and Linux);
 * macOS uses the system spell checker and ignores the language list.
 */
export function applySpellcheck(ses: Session, settings: Pick<DashSettings, 'spellCheckEnabled' | 'spellCheckLanguages'>): void {
  try {
    ses.setSpellCheckerEnabled(settings.spellCheckEnabled);
    const wanted = settings.spellCheckLanguages.split(',').map((l) => l.trim()).filter(Boolean);
    if (wanted.length === 0) return; // keep Chromium's default (the system language)
    const available = new Set(ses.availableSpellCheckerLanguages);
    const usable = wanted.filter((l) => available.has(l));
    if (usable.length > 0) ses.setSpellCheckerLanguages(usable);
  } catch (err) {
    appLog(`Could not apply spell-check settings: ${String(err)}`);
  }
}
