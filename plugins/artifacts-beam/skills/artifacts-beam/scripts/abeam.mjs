#!/usr/bin/env node
// abeam.mjs — Artifacts Beam CLI helper.
//
// A zero-dependency Node.js (18+) client for the Artifacts Beam service
// (https://artibeam.ai). It is intentionally agent-agnostic so
// the same helper backs the Copilot CLI, Codex, and Claude skills — only the
// SKILL.md wrapper differs per agent.
//
// AUTH MODEL (important): every API call is authenticated by an opaque,
// HttpOnly **session cookie** (`__Host-ab_session` over https) that the site issues
// after an interactive Microsoft-account (or Google) sign-in; there is no bearer
// token path. This helper keeps a
// small cookie jar in ~/.artifactsbeam/session.json and replays it on each call.
// See `references/auth-setup.md` for how to capture the cookie once.
//
// Mutating endpoints that browsers can trigger cross-site (multipart uploads and
// logout) additionally require an antiforgery token; this helper fetches and
// attaches it automatically. All other JSON mutations ride on the session cookie.
//
// Usage:  node abeam.mjs <command> [args] [--flags]
//         node abeam.mjs help

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

const DEFAULT_SITE = "https://artibeam.ai";
const CONFIG_DIR = path.join(os.homedir(), ".artifactsbeam");
const CONFIG_FILE = path.join(CONFIG_DIR, "config.json");
const SESSION_FILE = path.join(CONFIG_DIR, "session.json");

// ─── tiny JSON file store ────────────────────────────────────────────────────
function loadJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function saveJson(file, data) {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2), { mode: 0o600 });
  try {
    fs.chmodSync(file, 0o600); // best-effort: keep the session cookie private
  } catch {
    /* non-POSIX filesystems */
  }
}

// ─── config ──────────────────────────────────────────────────────────────────
function getSite() {
  const fromEnv = process.env.ARTIFACTSBEAM_SITE;
  if (fromEnv) return fromEnv.replace(/\/+$/, "");
  const cfg = loadJson(CONFIG_FILE, {});
  return (cfg.site || DEFAULT_SITE).replace(/\/+$/, "");
}

function defaultCookieName() {
  // __Host- cookies require https; the dev server uses the plain name.
  return getSite().startsWith("https://") ? "__Host-ab_session" : "ab_session";
}

// ─── cookie jar ────────────────────────────────────────────────────────────────
function loadJar() {
  return loadJson(SESSION_FILE, { cookies: {} });
}

function saveJar(jar) {
  saveJson(SESSION_FILE, jar);
}

function cookieHeader(jar) {
  return Object.entries(jar.cookies || {})
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
}

function mergeSetCookie(jar, setCookies) {
  jar.cookies = jar.cookies || {};
  for (const line of setCookies) {
    const first = line.split(";")[0];
    const eq = first.indexOf("=");
    if (eq <= 0) continue;
    const name = first.slice(0, eq).trim();
    const value = first.slice(eq + 1).trim();
    // A deletion (empty value + past expiry) drops the cookie from the jar.
    if (value === "" || /expires=Thu, 01 Jan 1970/i.test(line)) {
      delete jar.cookies[name];
    } else {
      jar.cookies[name] = value;
    }
  }
}

function getSetCookies(res) {
  if (typeof res.headers.getSetCookie === "function") {
    return res.headers.getSetCookie();
  }
  const raw = res.headers.get("set-cookie");
  return raw ? [raw] : [];
}

// ─── HTTP ──────────────────────────────────────────────────────────────────────
async function api(pathname, { method = "GET", headers = {}, body } = {}) {
  const jar = loadJar();
  const h = { Accept: "application/json, text/html", ...headers };
  const cookie = cookieHeader(jar);
  if (cookie) h.Cookie = cookie;

  let res;
  try {
    res = await fetch(getSite() + pathname, { method, headers: h, body, redirect: "manual" });
  } catch (e) {
    fail(`Network error calling ${pathname}: ${e.message}`);
  }

  const setCookies = getSetCookies(res);
  if (setCookies.length) {
    mergeSetCookie(jar, setCookies);
    saveJar(jar);
  }
  return res;
}

async function readBody(res) {
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) {
    try {
      return await res.json();
    } catch {
      return null;
    }
  }
  return await res.text();
}

async function apiJson(pathname, opts = {}) {
  const res = await api(pathname, opts);
  const body = await readBody(res);
  if (!res.ok) {
    const msg =
      (body && typeof body === "object" && body.error) ||
      (typeof body === "string" && body.slice(0, 300)) ||
      `HTTP ${res.status}`;
    if (res.status === 401) {
      fail("Not signed in (HTTP 401). Run:  node abeam.mjs login   (see references/auth-setup.md)");
    }
    if (res.status === 403) {
      fail(`Forbidden (HTTP 403): ${msg}. You may not be the owner of this artifact.`);
    }
    fail(`Request failed (HTTP ${res.status}): ${msg}`);
  }
  return body;
}

// Antiforgery token for multipart uploads + logout. The GET also drops the
// matching antiforgery cookie into the jar, which the POST then replays.
async function csrfToken() {
  const data = await apiJson("/api/antiforgery/token");
  return data && data.token;
}

// ─── helpers ─────────────────────────────────────────────────────────────────
function fail(message) {
  console.error(`✗ ${message}`);
  process.exit(1);
}

function ok(message) {
  console.log(`✓ ${message}`);
}

function print(obj) {
  console.log(typeof obj === "string" ? obj : JSON.stringify(obj, null, 2));
}

function detailUrl(specId, version, review) {
  let url = `${getSite()}/#/specs/${encodeURIComponent(specId)}`;
  if (version) url += `/v${version}`;
  if (review) url += "/review";
  return url;
}

function openBrowser(url) {
  const p = process.platform;
  if (p === "win32") {
    spawn("cmd", ["/c", "start", "", url], { stdio: "ignore", detached: true }).unref();
  } else if (p === "darwin") {
    spawn("open", [url], { stdio: "ignore", detached: true }).unref();
  } else {
    spawn("xdg-open", [url], { stdio: "ignore", detached: true }).unref();
  }
}

// minimal arg parser: positionals + --key value / --flag
function parseArgs(argv) {
  const positionals = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith("--")) {
        flags[key] = true;
      } else {
        flags[key] = next;
        i++;
      }
    } else {
      positionals.push(a);
    }
  }
  return { positionals, flags };
}

function uploadFormData(filePath) {
  const buf = fs.readFileSync(filePath);
  const fd = new FormData();
  fd.append("file", new Blob([buf], { type: "text/html" }), path.basename(filePath));
  return fd;
}

// ─── commands ──────────────────────────────────────────────────────────────────
const commands = {
  async config(_pos, flags) {
    if (flags.site) {
      const cfg = loadJson(CONFIG_FILE, {});
      cfg.site = String(flags.site).replace(/\/+$/, "");
      saveJson(CONFIG_FILE, cfg);
      ok(`Saved site = ${cfg.site}`);
    }
    print({ site: getSite(), configFile: CONFIG_FILE, sessionFile: SESSION_FILE });
  },

  // login --cookie "<value>"  (value, or "name=value", from the browser session cookie)
  async login(_pos, flags) {
    if (!flags.cookie) {
      const loginUrl = `${getSite()}/api/auth/login/microsoft?returnUrl=%2F`;
      console.log("Artifacts Beam uses an interactive sign-in. One-time setup:\n");
      console.log(`  1. A browser will open to: ${loginUrl}`);
      console.log("  2. Sign in with your Microsoft (or Google) account.");
      console.log("  3. Once you land back on the app, open DevTools (F12) →");
      console.log("     Application/Storage → Cookies → copy the value of");
      console.log(`     '${defaultCookieName()}'.`);
      console.log("  4. Re-run:  node abeam.mjs login --cookie \"<paste-value>\"\n");
      console.log("See references/auth-setup.md for screenshots and a browser-assisted option.");
      openBrowser(loginUrl);
      return;
    }
    const raw = String(flags.cookie).trim();
    let name = defaultCookieName();
    let value = raw;
    const eq = raw.indexOf("=");
    if (eq > 0 && /^__?[A-Za-z]/.test(raw)) {
      name = raw.slice(0, eq).trim();
      value = raw.slice(eq + 1).trim();
    }
    const jar = { cookies: { [name]: value } };
    saveJar(jar);
    const me = await apiJson("/api/auth/me");
    if (!me || !me.authenticated) {
      fail("Cookie saved but the server says you are not authenticated. It may be expired — sign in again and re-copy.");
    }
    ok(`Signed in as ${me.email || me.alias || me.displayName}`);
  },

  async logout() {
    try {
      const token = await csrfToken();
      await api("/api/auth/logout", { method: "POST", headers: { "X-CSRF-TOKEN": token } });
    } catch {
      /* best-effort server-side revoke */
    }
    try {
      fs.rmSync(SESSION_FILE, { force: true });
    } catch {
      /* ignore */
    }
    ok("Signed out (local session cleared).");
  },

  async whoami() {
    const me = await apiJson("/api/auth/me");
    if (!me || !me.authenticated) {
      console.log("Not signed in.");
      if (me && Array.isArray(me.providers)) {
        console.log("Available providers: " + me.providers.map((p) => p.displayName).join(", "));
      }
      process.exit(2);
    }
    print({ authenticated: true, email: me.email, alias: me.alias, fullName: me.fullName });
  },

  // publish <file> [--open] [--review]
  async publish(pos, flags) {
    const file = pos[0];
    if (!file) fail("Usage: publish <file.html> [--open] [--review]");
    if (!fs.existsSync(file)) fail(`File not found: ${file}`);
    if (!/\.(html?|htm)$/i.test(file)) fail("Only .html/.htm files can be published.");

    const token = await csrfToken();
    const res = await api("/api/specs", {
      method: "POST",
      headers: { "X-CSRF-TOKEN": token },
      body: uploadFormData(file),
    });
    const body = await readBody(res);
    if (!res.ok) {
      const msg = (body && body.error) || `HTTP ${res.status}`;
      fail(`Upload failed: ${msg}`);
    }
    const specId = body.spec && body.spec.specId;
    const version = body.version && body.version.versionNumber;
    const url = detailUrl(specId, version, flags.review);
    body.detailUrl = url;
    print(body);
    if (body.wasExistingSpec) {
      ok(`Added as v${version} of "${body.spec.displayName}".`);
    } else {
      ok(`Published new artifact "${body.spec.displayName}" (v${version}).`);
    }
    console.log(`  ${url}`);
    if (flags.open) openBrowser(url);
  },

  // list [query] [--tag t1,t2] [--page n] [--page-size n]
  async list(pos, flags) {
    const params = new URLSearchParams();
    if (pos[0]) params.set("q", pos[0]);
    if (flags.tag) params.set("tags", String(flags.tag));
    params.set("page", String(flags.page || 1));
    params.set("pageSize", String(flags["page-size"] || 20));
    const data = await apiJson(`/api/specs?${params.toString()}`);
    print(data);
  },

  async get(pos) {
    if (!pos[0]) fail("Usage: get <specId>");
    print(await apiJson(`/api/specs/${encodeURIComponent(pos[0])}`));
  },

  async versions(pos) {
    if (!pos[0]) fail("Usage: versions <specId>");
    print(await apiJson(`/api/specs/${encodeURIComponent(pos[0])}/versions`));
  },

  // content <specId> [--version n] [--out file]
  async content(pos, flags) {
    if (!pos[0]) fail("Usage: content <specId> [--version n] [--out file]");
    let version = flags.version;
    if (!version) {
      const spec = await apiJson(`/api/specs/${encodeURIComponent(pos[0])}`);
      version = (spec.spec && spec.spec.latestVersionNumber) || spec.latestVersionNumber;
    }
    const res = await api(
      `/api/specs/${encodeURIComponent(pos[0])}/versions/${version}/content`,
      { headers: { Accept: "text/html, application/json" } }
    );
    if (!res.ok) fail(`Could not fetch content (HTTP ${res.status}).`);
    const html = await res.text();
    if (flags.out) {
      fs.writeFileSync(flags.out, html);
      ok(`Wrote v${version} to ${flags.out} (${html.length} bytes).`);
    } else {
      process.stdout.write(html);
    }
  },

  // open <specId> [--version n] [--review]
  async open(pos, flags) {
    if (!pos[0]) fail("Usage: open <specId> [--version n] [--review]");
    const url = detailUrl(pos[0], flags.version, flags.review);
    openBrowser(url);
    ok(`Opening ${url}`);
  },

  // ── comments ──────────────────────────────────────────────────────────────
  // comments <specId> [--filter open|resolved|all]
  async comments(pos, flags) {
    if (!pos[0]) fail("Usage: comments <specId> [--filter open|resolved|all]");
    const all = await apiJson(`/api/specs/${encodeURIComponent(pos[0])}/comments`);
    const filter = flags.filter || "all";
    const list = Array.isArray(all) ? all : [];
    print(filter === "all" ? list : list.filter((c) => c.state === filter));
  },

  // reply <specId> <commentId> <text...>
  async reply(pos) {
    const [specId, commentId, ...rest] = pos;
    if (!specId || !commentId || rest.length === 0) {
      fail('Usage: reply <specId> <commentId> "<text>"');
    }
    const body = await apiJson(
      `/api/specs/${encodeURIComponent(specId)}/comments/${encodeURIComponent(commentId)}/replies`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: rest.join(" ") }) }
    );
    print(body);
    ok("Reply posted.");
  },

  // comment-state <specId> <commentId> <open|resolved>
  async "comment-state"(pos) {
    const [specId, commentId, state] = pos;
    if (!specId || !commentId || !["open", "resolved"].includes(state)) {
      fail("Usage: comment-state <specId> <commentId> <open|resolved>");
    }
    await apiJson(
      `/api/specs/${encodeURIComponent(specId)}/comments/${encodeURIComponent(commentId)}/state`,
      { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ state }) }
    );
    ok(`Comment ${commentId} → ${state}.`);
  },

  // ── share links (the consumer headline feature) ────────────────────────────
  // share-create <specId> [--permission view|comment] [--expires-days n] [--passcode x]
  async "share-create"(pos, flags) {
    if (!pos[0]) fail("Usage: share-create <specId> [--permission view|comment] [--expires-days n] [--passcode x]");
    const payload = {
      permission: flags.permission === "comment" ? "comment" : "view",
      passcode: flags.passcode ? String(flags.passcode) : null,
      expiresInDays: flags["expires-days"] ? Number(flags["expires-days"]) : null,
    };
    const link = await apiJson(`/api/specs/${encodeURIComponent(pos[0])}/shares`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    print(link);
    if (link && link.url) {
      ok("Share link created — copy it now, it is not shown again:");
      console.log(`  ${link.url}`);
    }
  },

  async "share-list"(pos) {
    if (!pos[0]) fail("Usage: share-list <specId>");
    print(await apiJson(`/api/specs/${encodeURIComponent(pos[0])}/shares`));
  },

  async "share-revoke"(pos) {
    const [specId, shareId] = pos;
    if (!specId || !shareId) fail("Usage: share-revoke <specId> <shareId>");
    await apiJson(
      `/api/specs/${encodeURIComponent(specId)}/shares/${encodeURIComponent(shareId)}`,
      { method: "DELETE" }
    );
    ok(`Revoked share ${shareId}.`);
  },

  // ── privacy ────────────────────────────────────────────────────────────────
  async "privacy-get"(pos) {
    if (!pos[0]) fail("Usage: privacy-get <specId>");
    print(await apiJson(`/api/specs/${encodeURIComponent(pos[0])}/access`));
  },

  // privacy-set <specId> <private|public>
  async "privacy-set"(pos) {
    const [specId, mode] = pos;
    if (!specId || !["private", "public"].includes(mode)) {
      fail("Usage: privacy-set <specId> <private|public>");
    }
    print(await apiJson(`/api/specs/${encodeURIComponent(specId)}/access`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode }),
    }));
    ok(`Privacy set to ${mode}.`);
  },

  // ── tags ─────────────────────────────────────────────────────────────────────
  async "tags-get"(pos) {
    if (!pos[0]) fail("Usage: tags-get <specId>");
    const spec = await apiJson(`/api/specs/${encodeURIComponent(pos[0])}`);
    print((spec.spec && spec.spec.tags) || spec.tags || []);
  },

  // tags-set <specId> <t1,t2,...>   (replaces full set; empty string clears)
  async "tags-set"(pos) {
    if (!pos[0]) fail('Usage: tags-set <specId> "t1,t2"   (empty clears)');
    const tags = (pos[1] || "").split(",").map((t) => t.trim()).filter(Boolean);
    print(await apiJson(`/api/specs/${encodeURIComponent(pos[0])}/tags`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tags }),
    }));
    ok(`Tags set: ${tags.join(", ") || "(cleared)"}.`);
  },

  async "tags-all"() {
    print(await apiJson("/api/specs/tags"));
  },

  async dashboard() {
    print(await apiJson("/api/owner/summary"));
  },

  // ── delete (guarded: require --yes; the agent must confirm in chat first) ───
  async delete(pos, flags) {
    if (!pos[0]) fail("Usage: delete <specId> --yes");
    if (!flags.yes) fail("Refusing to delete without --yes. Confirm with the user first, then pass --yes.");
    await apiJson(`/api/specs/${encodeURIComponent(pos[0])}`, { method: "DELETE" });
    ok(`Deleted artifact ${pos[0]} (and all its versions + comments).`);
  },

  async "delete-version"(pos, flags) {
    const [specId, version] = pos;
    if (!specId || !version) fail("Usage: delete-version <specId> <n> --yes");
    if (!flags.yes) fail("Refusing to delete without --yes. Confirm with the user first, then pass --yes.");
    print(await apiJson(`/api/specs/${encodeURIComponent(specId)}/versions/${version}`, { method: "DELETE" }));
    ok(`Deleted v${version} of ${specId}.`);
  },

  help() {
    console.log(`Artifacts Beam CLI helper — node abeam.mjs <command> [args] [--flags]

Auth (see references/auth-setup.md):
  login [--cookie "<value>"]      Capture/save the browser session cookie
  logout                          Revoke server-side + clear local session
  whoami                          Show the signed-in account

Artifacts:
  publish <file> [--open] [--review]   Upload (auto-versions by name+owner)
  list [query] [--tag a,b] [--page n]  List your visible artifacts
  get <specId>                         Spec metadata + versions
  versions <specId>                    Version list
  content <specId> [--version n] [--out f]   Download a version's HTML
  open <specId> [--version n] [--review]     Open in the browser

Share links:
  share-create <specId> [--permission view|comment] [--expires-days n] [--passcode x]
  share-list <specId>
  share-revoke <specId> <shareId>

Review loop:
  comments <specId> [--filter open|resolved|all]
  reply <specId> <commentId> "<text>"
  comment-state <specId> <commentId> <open|resolved>

Privacy & tags:
  privacy-get <specId> | privacy-set <specId> <private|public>
  tags-get <specId> | tags-set <specId> "a,b" | tags-all

Other:
  dashboard                       Owner KPI summary
  delete <specId> --yes
  delete-version <specId> <n> --yes
  config [--site <url>]           Show/override the target site
`);
  },
};

// ─── entrypoint ────────────────────────────────────────────────────────────────
async function main() {
  const [, , command, ...rest] = process.argv;
  if (!command || command === "help" || command === "--help" || command === "-h") {
    commands.help();
    return;
  }
  const handler = commands[command];
  if (!handler) {
    fail(`Unknown command '${command}'. Run:  node abeam.mjs help`);
  }
  const { positionals, flags } = parseArgs(rest);
  await handler(positionals, flags);
}

main().catch((e) => fail(e && e.stack ? e.stack : String(e)));
