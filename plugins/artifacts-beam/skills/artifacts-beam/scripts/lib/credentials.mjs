// credentials.mjs — per-origin credential storage for the Artifacts Beam CLI.
//
// Credentials are keyed by ORIGIN. The v1 format was a single flat cookie jar, which silently
// broke whenever `config --site` pointed the helper at a different deployment: the session cookie
// is host-bound, so replaying it elsewhere always 401s. Keying by origin makes that impossible,
// and lets production and a local dev server be signed in at the same time.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const CONFIG_DIR = path.join(os.homedir(), ".artifactsbeam");
export const SESSION_FILE = path.join(CONFIG_DIR, "session.json");

/** Normalises any stored shape (v1 cookie jar, v2 store, or garbage) to the v2 store shape. */
export function migrate(raw, origin) {
  if (!raw || typeof raw !== "object") {
    return { version: 2, credentials: {} };
  }
  if (raw.version === 2 && raw.credentials && typeof raw.credentials === "object") {
    return raw;
  }
  const store = { version: 2, credentials: {} };
  const cookies = raw.cookies;
  if (cookies && typeof cookies === "object" && Object.keys(cookies).length > 0) {
    store.credentials[origin] = { cookies };
  }
  return store;
}

function readStore(origin) {
  let raw = null;
  try {
    raw = JSON.parse(fs.readFileSync(SESSION_FILE, "utf8"));
  } catch {
    raw = null;
  }
  return migrate(raw, origin);
}

function writeStore(store) {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.writeFileSync(SESSION_FILE, JSON.stringify(store, null, 2), { mode: 0o600 });
  try {
    fs.chmodSync(SESSION_FILE, 0o600); // best-effort: keep tokens private
  } catch {
    /* non-POSIX filesystems */
  }
}

export function loadCredentials(origin) {
  return readStore(origin).credentials[origin] || null;
}

export function saveCredentials(origin, credential) {
  const store = readStore(origin);
  store.credentials[origin] = credential;
  writeStore(store);
}

export function clearCredentials(origin) {
  const store = readStore(origin);
  delete store.credentials[origin];
  writeStore(store);
}
