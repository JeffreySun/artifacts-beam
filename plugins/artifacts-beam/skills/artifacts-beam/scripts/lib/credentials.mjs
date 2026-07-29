// credentials.mjs — per-origin credential storage for the Artifacts Beam CLI.
//
// Credentials are keyed by ORIGIN. The v1 format was a single flat cookie jar, which silently
// broke whenever `config --site` pointed the helper at a different deployment: the session cookie
// is host-bound, so replaying it elsewhere always 401s. Keying by origin makes that impossible,
// and lets production and a local dev server be signed in at the same time.
//
// Cookie auth is gone entirely. Any cookie left in a stored credential is inert, so migration
// strips it rather than carrying a dead field forward — which leaves the user cleanly "not
// signed in" and pointed at `login`, instead of authenticated-looking but 401ing on every call.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const CONFIG_DIR = path.join(os.homedir(), ".artifactsbeam");
export const SESSION_FILE = path.join(CONFIG_DIR, "session.json");

/** A credential is usable only if it carries a token; a leftover cookie is dead weight. */
function withoutCookies(credential) {
  if (!credential || typeof credential !== "object") return null;
  const { cookies, ...rest } = credential;
  return rest.accessToken || rest.refreshToken ? rest : null;
}

/**
 * Normalises any stored shape (v1 cookie jar, v2 store, or garbage) to the v2 store shape,
 * dropping credentials that only ever held a now-unusable cookie.
 */
export function migrate(raw, origin) {
  const empty = { version: 2, credentials: {} };
  if (!raw || typeof raw !== "object") {
    return empty;
  }
  if (raw.version === 2 && raw.credentials && typeof raw.credentials === "object") {
    const credentials = {};
    for (const [key, value] of Object.entries(raw.credentials)) {
      const usable = withoutCookies(value);
      if (usable) credentials[key] = usable;
    }
    return { version: 2, credentials };
  }
  // v1 was a bare cookie jar. Nothing in it can authenticate anything now.
  return empty;
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
