/** Tabs from a session that ended abnormally, offered once on the New Tab page. In memory only. */
let pending: string[] = [];

const MAX_TABS = 40;

/** Keeps only real web pages, de-duplicated; ignores a session that was just an empty New Tab. */
export function setRecoverable(perWindowUrls: string[][]): void {
  const seen = new Set<string>();
  for (const urls of perWindowUrls) {
    for (const u of urls) if (/^https?:\/\//i.test(u)) seen.add(u);
  }
  pending = [...seen].slice(0, MAX_TABS);
}

export function recoverableCount(): number {
  return pending.length;
}

/** Hands the tabs over exactly once. */
export function takeRecoverable(): string[] {
  const urls = pending;
  pending = [];
  return urls;
}

export function dismissRecoverable(): void {
  pending = [];
}
