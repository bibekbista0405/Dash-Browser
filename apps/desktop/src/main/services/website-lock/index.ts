import { getDatabase } from '../../db/database';
import { WebsiteLockEngine } from './engine';
import { SqliteLockRepository } from './sqlite-repository';

let engine: WebsiteLockEngine | null = null;

/** The one Website Lock engine of this DASH process. Its unlock state lives in this process's memory only. */
export function getWebsiteLock(): WebsiteLockEngine {
  return (engine ??= new WebsiteLockEngine(new SqliteLockRepository(getDatabase().handle)));
}
