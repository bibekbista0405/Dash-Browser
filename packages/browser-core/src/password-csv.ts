/** Minimal WHATWG URL surface; core has no DOM/Node typings. */
declare class URL {
  constructor(input: string);
  protocol: string;
  origin: string;
}

export interface ImportedLogin {
  origin: string;
  username: string;
  password: string;
}

export interface PasswordCsvResult {
  logins: ImportedLogin[];
  /** Rows that were not usable: no web address, no password, or not http(s). */
  invalid: number;
  /** Set when the file is not a password export at all. */
  error?: string;
}

/** RFC 4180: quoted fields, "" for a quote, commas and line breaks allowed inside quotes. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  const src = text.replace(/^﻿/, '');
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
    } else if (c === '"' && field === '') quoted = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      if (row.some((x) => x !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((x) => x !== '')) rows.push(row);
  return rows;
}

/** Reads the CSV that Chrome and Edge export (columns name, url, username, password, optionally note). */
export function parsePasswordCsv(text: string): PasswordCsvResult {
  const rows = parseCsv(text);
  if (rows.length === 0) return { logins: [], invalid: 0, error: 'The file is empty.' };
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const col = (name: string): number => header.indexOf(name);
  const urlCol = col('url') >= 0 ? col('url') : col('origin') >= 0 ? col('origin') : col('login_uri');
  const userCol = col('username') >= 0 ? col('username') : col('login_username');
  const passCol = col('password') >= 0 ? col('password') : col('login_password');
  if (urlCol < 0 || userCol < 0 || passCol < 0) {
    return { logins: [], invalid: 0, error: 'This does not look like a password export: expected columns url, username and password.' };
  }
  const logins: ImportedLogin[] = [];
  let invalid = 0;
  for (const r of rows.slice(1)) {
    const url = (r[urlCol] ?? '').trim();
    const username = r[userCol] ?? '';
    const password = r[passCol] ?? '';
    let origin = '';
    try {
      const u = new URL(url);
      if (u.protocol === 'https:' || u.protocol === 'http:') origin = u.origin;
    } catch {
      /* not a web address */
    }
    if (!origin || !password) {
      invalid++;
      continue;
    }
    logins.push({ origin, username, password });
  }
  return { logins, invalid };
}
