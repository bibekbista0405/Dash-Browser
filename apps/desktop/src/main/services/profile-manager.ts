import { app } from 'electron';
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export interface ProfileInfo {
  id: string;
  name: string;
  isCurrent: boolean;
}

const DEFAULT_ID = 'default';
const ID_PATTERN = /^[a-z0-9]{6,32}$/;
const MAX_PROFILES = 10;

/** Where the first ("default") profile lives, captured before any profile redirects userData. */
const BASE_DIR = app.getPath('userData');
let currentId = DEFAULT_ID;

/**
 * Profiles are separate data folders: history, bookmarks, passwords, cookies, settings and containers all live under
 * the profile's own userData directory, so nothing is shared between them. Each profile runs in its own DASH
 * process (started with --dash-profile=<id>), which also gives it its own single-instance lock.
 * Call `initProfile()` before anything reads userData or requests the instance lock.
 */
export function initProfile(): string {
  const arg = process.argv.find((a) => a.startsWith('--dash-profile='));
  const id = arg?.slice('--dash-profile='.length) ?? DEFAULT_ID;
  if (id !== DEFAULT_ID && ID_PATTERN.test(id) && readRegistry().some((p) => p.id === id)) {
    currentId = id;
    app.setPath('userData', profileDir(id));
  }
  return currentId;
}

export function currentProfileId(): string {
  return currentId;
}

const registryPath = () => path.join(BASE_DIR, 'profiles.json');
const profileDir = (id: string) => path.join(BASE_DIR, 'profiles', id);

function readRegistry(): { id: string; name: string }[] {
  try {
    const raw = JSON.parse(fs.readFileSync(registryPath(), 'utf-8')) as unknown;
    if (!Array.isArray(raw)) return [];
    return raw.filter(
      (p): p is { id: string; name: string } => !!p && typeof p.id === 'string' && ID_PATTERN.test(p.id) && typeof p.name === 'string'
    );
  } catch {
    return [];
  }
}

function writeRegistry(list: { id: string; name: string }[]): void {
  fs.mkdirSync(BASE_DIR, { recursive: true });
  const tmp = `${registryPath()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(list, null, 2), 'utf-8');
  fs.renameSync(tmp, registryPath());
}

export class ProfileManager {
  list(): ProfileInfo[] {
    return [
      { id: DEFAULT_ID, name: 'Default', isCurrent: currentId === DEFAULT_ID },
      ...readRegistry().map((p) => ({ ...p, isCurrent: p.id === currentId })),
    ];
  }

  create(name: string): ProfileInfo {
    const clean = name.trim().slice(0, 30);
    if (!clean) throw new Error('DASH: a profile needs a name');
    const all = this.list();
    if (all.length >= MAX_PROFILES) throw new Error(`DASH: at most ${MAX_PROFILES} profiles`);
    if (all.some((p) => p.name.toLowerCase() === clean.toLowerCase())) throw new Error('DASH: a profile with that name exists');
    const id = randomBytes(6).toString('hex');
    fs.mkdirSync(profileDir(id), { recursive: true });
    writeRegistry([...readRegistry(), { id, name: clean }]);
    return { id, name: clean, isCurrent: false };
  }

  rename(id: string, name: string): void {
    const clean = name.trim().slice(0, 30);
    if (!clean) throw new Error('DASH: a profile needs a name');
    const reg = readRegistry();
    const found = reg.find((p) => p.id === id);
    if (!found) throw new Error('DASH: unknown profile (the Default profile cannot be renamed)');
    if (this.list().some((p) => p.id !== id && p.name.toLowerCase() === clean.toLowerCase())) throw new Error('DASH: a profile with that name exists');
    found.name = clean;
    writeRegistry(reg);
  }

  /** Deletes a profile and ALL its data. Refuses the Default profile and the profile that is running this window. */
  remove(id: string): void {
    if (id === currentId) throw new Error('DASH: switch to another profile before deleting this one');
    if (!readRegistry().some((p) => p.id === id)) throw new Error('DASH: unknown profile (the Default profile cannot be deleted)');
    if (this.isRunning(id)) throw new Error('DASH: close that profile’s window first');
    fs.rmSync(profileDir(id), { recursive: true, force: true });
    writeRegistry(readRegistry().filter((p) => p.id !== id));
  }

  /** Starts DASH for another profile in its own process (or does nothing if that profile is already open — its instance lock hands focus over). */
  open(id: string): void {
    if (id !== DEFAULT_ID && !readRegistry().some((p) => p.id === id)) throw new Error('DASH: unknown profile');
    if (id === currentId) return;
    const flag = `--dash-profile=${id}`;
    // A custom data folder (and Linux's --no-sandbox) given to this process must reach the new one, or it would look elsewhere.
    const forwarded = process.argv.filter((x) => x.startsWith('--user-data-dir=') || x === '--no-sandbox');
    const args = app.isPackaged ? [...forwarded, flag] : [...forwarded, app.getAppPath(), flag];
    const child = spawn(process.execPath, args, { detached: true, stdio: 'ignore' });
    child.unref();
  }

  /**
   * True while a DASH instance is using the profile. macOS/Linux: Chromium's SingletonLock is a symlink "host-pid";
   * it counts only if that process is alive (a crash leaves a stale link behind). Windows: the `lockfile` is held
   * open by the running instance, so it cannot be deleted while in use.
   */
  private isRunning(id: string): boolean {
    const dir = profileDir(id);
    try {
      const target = fs.readlinkSync(path.join(dir, 'SingletonLock'));
      const pid = Number(target.split('-').pop());
      if (Number.isInteger(pid) && pid > 0) {
        try {
          process.kill(pid, 0);
          return true;
        } catch (e) {
          if ((e as NodeJS.ErrnoException).code === 'EPERM') return true;
        }
      }
    } catch {
      /* no symlink lock */
    }
    const winLock = path.join(dir, 'lockfile');
    if (fs.existsSync(winLock)) {
      try {
        fs.unlinkSync(winLock);
      } catch {
        return true;
      }
    }
    return false;
  }
}
