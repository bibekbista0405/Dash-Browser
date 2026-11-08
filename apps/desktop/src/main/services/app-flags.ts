import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';

export interface AppFlags {
  /** True from start-up until a normal quit. Still true at the next start means the last run ended abnormally. */
  running: boolean;
  /** Repeated graphics-process crashes: start with software rendering. */
  gpuFallback: boolean;
}

const DEFAULTS: AppFlags = { running: false, gpuFallback: false };

function flagsPath(): string {
  return path.join(app.getPath('userData'), 'dash-flags.json');
}

/** Reads the flags file. Missing or damaged means defaults. Works before `app.whenReady()`. */
export function readFlags(): AppFlags {
  try {
    const raw = JSON.parse(fs.readFileSync(flagsPath(), 'utf8')) as Partial<AppFlags>;
    return { running: raw.running === true, gpuFallback: raw.gpuFallback === true };
  } catch {
    return { ...DEFAULTS };
  }
}

/** Synchronous on purpose: it must land even while the process is shutting down. */
export function updateFlags(patch: Partial<AppFlags>): void {
  try {
    const next = { ...readFlags(), ...patch };
    const tmp = `${flagsPath()}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(next));
    fs.renameSync(tmp, flagsPath());
  } catch {
    /* a read-only profile must not stop the browser */
  }
}
