import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';

const MAX_BYTES = 512 * 1024;

export function logPath(): string {
  return path.join(app.getPath('userData'), 'dash-startup.log');
}

/** Appends a line to the local log (never sent anywhere). Keeps the file small by rolling it over once. Never throws. */
export function appLog(line: string): void {
  try {
    const file = logPath();
    try {
      if (fs.statSync(file).size > MAX_BYTES) fs.renameSync(file, `${file}.old`);
    } catch {
      /* no log yet */
    }
    fs.appendFileSync(file, `[${new Date().toISOString()}] ${line}\n`);
  } catch {
    /* logging must never throw */
  }
}
