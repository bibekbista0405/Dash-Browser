import { randomUUID } from 'node:crypto';
import { session, type Session } from 'electron';
import { CONTAINER_COLORS, type ContainerColor, type ContainerInfo } from '../../shared/ipc-channels';
import { getDatabase } from '../db/database';

const MAX_CONTAINERS = 12;

/**
 * Container tabs: each container is its own persistent Electron session (`persist:container-<id>`), so cookies,
 * localStorage, IndexedDB, service workers and the HTTP cache are never shared with normal tabs or other containers.
 * Blocking, header policy, permissions, VPN and spell check are attached to a container's session the first time
 * it is used (`configure`, supplied by main/index.ts), exactly as for the default session.
 */
export class ContainerManager {
  private sessions = new Map<string, Session>();

  constructor(private configure: (sess: Session) => void) {}

  list(): ContainerInfo[] {
    return getDatabase().listContainers();
  }

  get(id: string | null | undefined): ContainerInfo | null {
    if (!id) return null;
    return this.list().find((c) => c.id === id) ?? null;
  }

  /** The session for an existing container, configured on first use; null when the container no longer exists. */
  sessionFor(id: string): Session | null {
    if (!this.get(id)) return null;
    let sess = this.sessions.get(id);
    if (!sess) {
      sess = session.fromPartition(`persist:container-${id}`);
      this.configure(sess);
      this.sessions.set(id, sess);
    }
    return sess;
  }

  /** Sessions opened so far this run (used to apply settings changes and exit clean-up). */
  openSessions(): Session[] {
    return [...this.sessions.values()];
  }

  create(name: string, color: string): ContainerInfo {
    const clean = name.trim().slice(0, 30);
    if (!clean) throw new Error('DASH: a container needs a name');
    if (!(CONTAINER_COLORS as readonly string[]).includes(color)) throw new Error('DASH: unknown container colour');
    if (this.list().length >= MAX_CONTAINERS) throw new Error(`DASH: at most ${MAX_CONTAINERS} containers`);
    if (this.list().some((c) => c.name.toLowerCase() === clean.toLowerCase())) throw new Error('DASH: a container with that name exists');
    return getDatabase().addContainer(randomUUID(), clean, color as ContainerColor);
  }

  update(id: string, name: string, color: string): void {
    const clean = name.trim().slice(0, 30);
    if (!this.get(id) || !clean || !(CONTAINER_COLORS as readonly string[]).includes(color)) throw new Error('DASH: invalid container');
    getDatabase().renameContainer(id, clean, color as ContainerColor);
  }

  /** Deletes the container and everything it stored. The caller closes its open tabs first. */
  async remove(id: string): Promise<void> {
    if (!this.get(id)) return;
    const sess = this.sessionFor(id) ?? session.fromPartition(`persist:container-${id}`);
    await sess.clearStorageData();
    await sess.clearCache();
    this.sessions.delete(id);
    getDatabase().removeContainer(id);
  }
}
