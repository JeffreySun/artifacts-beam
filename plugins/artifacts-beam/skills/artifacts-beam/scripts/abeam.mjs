#!/usr/bin/env node
// abeam.mjs — Artifacts Beam CLI helper.
//
// A zero-dependency Node.js (18+) client for the Artifacts Beam service
// (https://artibeam.ai). It is intentionally agent-agnostic so
// the same helper backs the Copilot CLI, Codex, and Claude skills — only the
// SKILL.md wrapper differs per agent.
//
// AUTH MODEL: `login` signs in through the browser using a loopback redirect and
// PKCE (RFC 8252) — the user never copies or pastes anything. That yields a
// device-scoped access + refresh token pair, stored per site in
// ~/.artifactsbeam/session.json (mode 600). Every API call then carries
// `Authorization: Bearer <accessToken>`, and the short-lived access token is
// refreshed transparently on a 401.
//
// Because bearer callers send no ambient credential, they are exempt from the
// antiforgery token the cookie-authenticated web app needs — so no endpoint here
// requires one. See `references/auth-setup.md`.
//
// Usage:  node abeam.mjs <command> [args] [--flags]
//         node abeam.mjs help

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  loadCredentials,
  saveCredentials,
  clearCredentials,
  CONFIG_DIR,
  SESSION_FILE,
} from "./lib/credentials.mjs";
import { browserLogin } from "./lib/login.mjs";
import { deviceLogin, shouldUseDeviceFlow } from "./lib/deviceLogin.mjs";

const DEFAULT_SITE = "https://artibeam.ai";
const CONFIG_FILE = path.join(CONFIG_DIR, "config.json");

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
    fs.chmodSync(file, 0o600); // best-effort: keep the tokens private
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

// ─── auth transport ──────────────────────────────────────────────────────────
function storeTokens(pair, account) {
  saveCredentials(getSite(), {
    accessToken: pair.accessToken,
    refreshToken: pair.refreshToken,
    accessExpiresAt: new Date(Date.now() + (pair.accessExpiresIn || 0) * 1000).toISOString(),
    account,
  });
}

// Rotate the short-lived access token rather than making the user sign in again. Rotation
// invalidates the presented refresh token server-side, so the new pair must always be saved.
async function refreshTokens() {
  const site = getSite();
  const cred = loadCredentials(site);
  if (!cred || !cred.refreshToken) return false;
  try {
    const res = await fetch(`${site}/api/auth/token/refresh`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ refreshToken: cred.refreshToken }),
    });
    if (!res.ok) return false;
    storeTokens(await res.json(), cred.account);
    return true;
  } catch {
    return false;
  }
}

// ─── HTTP ──────────────────────────────────────────────────────────────────────
async function api(pathname, { method = "GET", headers = {}, body, retryOn401 = true } = {}) {
  const site = getSite();
  const cred = loadCredentials(site);
  const h = { Accept: "application/json, text/html", ...headers };
  if (cred && cred.accessToken) {
    h.Authorization = `Bearer ${cred.accessToken}`;
  }

  let res;
  try {
    res = await fetch(site + pathname, { method, headers: h, body, redirect: "manual" });
  } catch (e) {
    fail(`Network error calling ${pathname}: ${e.message}`);
  }

  if (res.status === 401 && retryOn401 && cred && cred.refreshToken && (await refreshTokens())) {
    return api(pathname, { method, headers, body, retryOn401: false });
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
      fail(NOT_SIGNED_IN);
    }
    if (res.status === 403) {
      fail(`Forbidden (HTTP 403): ${msg}. Check artifact access, workspace membership, and sharing policy.`);
    }
    fail(`Request failed (HTTP ${res.status}): ${msg}`);
  }
  return body;
}

// /api/auth/me is anonymous-but-identity-aware: when the bearer token has expired it
// answers 200 with {authenticated:false} rather than 401, so the generic 401 refresh in
// api() never fires for it. Without this, `whoami` would report "Not signed in" an hour
// after login even though the refresh token is still perfectly good.
async function fetchIdentity() {
  const me = await apiJson("/api/auth/me");
  if (me && me.authenticated) return me;
  return (await refreshTokens()) ? await apiJson("/api/auth/me") : me;
}

// ─── helpers ─────────────────────────────────────────────────────────────────
function fail(message) {
  console.error(`✗ ${message}`);
  process.exit(1);
}

const NOT_SIGNED_IN = "Not signed in (HTTP 401). Run:  node abeam.mjs login";

// Commands that read a raw response instead of going through apiJson() have to map 401
// themselves. This is not hoisted into api(): fail() exits the process, and logout()
// deliberately tolerates a 401 so it can still clear the local credential.
function failIfUnauthorized(res) {
  if (res.status === 401) {
    fail(NOT_SIGNED_IN);
  }
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
    // Keep URL metacharacters out of shell source, including OAuth '&' and '%' values.
    spawn("powershell.exe", [
      "-NoLogo", "-NoProfile", "-NonInteractive", "-Command",
      "Start-Process -FilePath $env:ARTIFACTSBEAM_BROWSER_URL",
    ], {
      stdio: "ignore",
      detached: true,
      windowsHide: true,
      env: { ...process.env, ARTIFACTSBEAM_BROWSER_URL: url },
    }).unref();
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

function stringOption(flags, key) {
  const value = flags[key];
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !value.trim()) fail(`--${key} requires a value.`);
  return value;
}

function positiveInteger(value, label) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 1) fail(`${label} must be a positive integer.`);
  return number;
}

function integerOption(flags, key) {
  const value = stringOption(flags, key);
  return value === undefined ? undefined : positiveInteger(value, `--${key}`);
}

function uploadFormData(filePath, fields = {}) {
  const buf = fs.readFileSync(filePath);
  const fd = new FormData();
  fd.append("file", new Blob([buf], { type: "text/html" }), path.basename(filePath));
  for (const [name, value] of Object.entries(fields)) fd.append(name, value);
  return fd;
}

function publicationBase(file, specId) {
  let packet;
  try {
    packet = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (e) {
    fail(`Could not read review packet: ${e.message}`);
  }
  const base = packet?.baseRevision;
  if (packet?.contractVersion !== 1 || packet.artifactId !== specId || base?.entityId !== specId
      || !Number.isSafeInteger(base.publishedVersion) || base.publishedVersion < 1
      || base.draftETag !== null || !/^[0-9a-f]{64}$/.test(base.revisionId || "")
      || !/^[0-9a-f]{64}$/.test(base.contentSha256 || "")) {
    fail("Review packet must contain a valid published base revision for the selected artifact.");
  }
  return base;
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

  // login [--provider microsoft|google|apple] [--device] [--no-browser]
  async login(_pos, flags) {
    // Fail loudly rather than ignoring the flag: anyone still passing it has it baked into a
    // script, and silently opening a browser instead would be baffling.
    if (flags.cookie) {
      fail(
        "The --cookie flag has been removed. Sign in with:  node abeam.mjs login\n" +
          "  On a machine with no browser (SSH, containers), use:  node abeam.mjs login --device",
      );
    }
    const log = (m) => console.log(m);
    const site = getSite();
    // Over SSH or in a container the loopback callback is unreachable from the user's browser,
    // so start with the device flow rather than hanging until it times out.
    let useDevice = Boolean(flags.device) || shouldUseDeviceFlow();
    let pair;

    if (!useDevice) {
      try {
        pair = await browserLogin({
          site,
          provider: flags.provider || "microsoft",
          noBrowser: Boolean(flags["no-browser"]),
          openBrowser,
          log,
        });
      } catch (e) {
        // A listener that won't bind means loopback can never work here; anything else is a
        // real failure the user needs to see rather than a reason to change flows.
        if (!/EACCES|EADDRINUSE|EAFNOSUPPORT|listen/i.test(e.message)) {
          fail(`Sign-in failed: ${e.message}`);
        }
        log("Couldn't open a local callback port — falling back to device sign-in.\n");
        useDevice = true;
      }
    }

    if (useDevice) {
      try {
        pair = await deviceLogin({
          site,
          log,
          openBrowser: flags["no-browser"] ? null : openBrowser,
        });
      } catch (e) {
        fail(`Sign-in failed: ${e.message}`);
      }
    }
    storeTokens(pair, null);

    const me = await fetchIdentity();
    if (!me || !me.authenticated) {
      fail("Signed in, but the server does not recognise the credential. Please try again.");
    }
    const cred = loadCredentials(getSite());
    saveCredentials(getSite(), { ...cred, account: { email: me.email, alias: me.alias } });
    ok(`Signed in as ${me.email || me.alias || me.fullName}`);
  },

  async logout() {
    try {
      await api("/api/auth/token/revoke", { method: "POST" });
    } catch {
      /* best-effort server-side revoke */
    }
    clearCredentials(getSite());
    ok("Signed out.");
  },

  async whoami() {
    const me = await fetchIdentity();
    if (!me || !me.authenticated) {
      console.log("Not signed in.  Run:  node abeam.mjs login");
      if (me && Array.isArray(me.providers)) {
        console.log("Available providers: " + me.providers.map((p) => p.displayName).join(", "));
      }
      process.exit(2);
    }
    print({ authenticated: true, email: me.email, alias: me.alias, fullName: me.fullName });
  },

  async workspaces() {
    print(await apiJson("/api/orgs"));
  },

  async "workspace-use"(pos) {
    if (!pos[0]) fail("Usage: workspace-use <orgId>");
    print(await apiJson("/api/mobile/active-org", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orgId: pos[0] }),
    }));
  },

  async publish(pos, flags) {
    for (const key of Object.keys(flags)) {
      if (!["spec", "new", "review-packet", "operation-id", "open", "review"].includes(key))
        fail(`Unknown publication option --${key}. Run: node abeam.mjs help`);
    }
    const file = pos[0];
    if (!file) fail("Usage: publish <file.html> [--spec <id> | --new] [--review-packet <json>] [--operation-id <key>] [--open] [--review]");
    if (!fs.existsSync(file)) fail(`File not found: ${file}`);
    if (!/\.html$/i.test(file)) fail("Only .html files can be published.");
    const specId = stringOption(flags, "spec");
    const packetFile = stringOption(flags, "review-packet");
    if (flags.new !== undefined && flags.new !== true) fail("--new does not take a value.");
    if (flags.new && specId) fail("--new and --spec cannot be combined.");
    if (packetFile && !specId) fail("--review-packet requires --spec to select the artifact.");
    const fields = {};
    if (flags.new) fields.forceNewSpec = "true";
    if (packetFile) {
      fields.submissionMode = "replaceIfCurrent";
      fields.expectedBaseRevision = JSON.stringify(publicationBase(packetFile, specId));
    }
    const operationId = stringOption(flags, "operation-id") || randomUUID();
    if (operationId.length > 128 || /[^\x21-\x7e]|,/.test(operationId))
      fail("--operation-id must be 1-128 printable ASCII characters without spaces or commas.");

    const endpoint = specId ? `/api/specs/${encodeURIComponent(specId)}/versions` : "/api/specs";
    console.error(`Publication operation: ${operationId}`);
    const res = await api(endpoint, {
      method: "POST",
      headers: { "Idempotency-Key": operationId },
      body: uploadFormData(file, fields),
    });
    failIfUnauthorized(res);
    const body = await readBody(res);
    if (!res.ok) {
      const msg = (body && body.error) || `HTTP ${res.status}`;
      fail(`Upload failed (HTTP ${res.status}): ${msg}`);
    }
    const publishedId = body?.spec?.specId;
    const version = body?.version?.versionNumber;
    if (!publishedId || !Number.isSafeInteger(version) || version < 1)
      fail("Upload returned an invalid publication response.");
    const url = detailUrl(publishedId, version, flags.review);
    body.detailUrl = url;
    body.operationId = operationId;
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

  async diff(pos) {
    if (pos.length !== 3) fail("Usage: diff <specId> <fromVersion> <toVersion>");
    const from = positiveInteger(pos[1], "fromVersion");
    const to = positiveInteger(pos[2], "toVersion");
    print(await apiJson(`/api/specs/${encodeURIComponent(pos[0])}/versions/${from}/diff/${to}`));
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
    failIfUnauthorized(res);
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
    const filter = flags.filter || "all";
    if (!["all", "open", "resolved"].includes(filter)) fail("--filter must be open, resolved, or all.");
    const all = await apiJson(`/api/specs/${encodeURIComponent(pos[0])}/comments`);
    if (!Array.isArray(all)) fail("Invalid comments response: expected an array.");
    print(filter === "all" ? all : all.filter((c) => c.state === filter));
  },

  async annotations(pos, flags) {
    if (!pos[0]) fail("Usage: annotations <specId> [--version n]");
    const version = integerOption(flags, "version");
    const query = version === undefined ? "" : `?version=${version}`;
    print(await apiJson(`/api/specs/${encodeURIComponent(pos[0])}/annotations${query}`));
  },

  async "review-packet"(pos, flags) {
    if (!pos[0]) fail("Usage: review-packet <specId> [--state open|resolved|all] [--base-version n] [--authored-version n] [--selected comment:id,annotation:id] [--format json|markdown] [--out file]");
    const state = stringOption(flags, "state") || "all";
    const format = stringOption(flags, "format") || "json";
    if (!["all", "open", "resolved"].includes(state)) fail("--state must be open, resolved, or all.");
    if (!["json", "markdown"].includes(format)) fail("--format must be json or markdown.");
    const params = new URLSearchParams({ state, format });
    for (const [flag, key] of [["base-version", "baseVersion"], ["authored-version", "authoredVersion"]]) {
      const value = integerOption(flags, flag);
      if (value !== undefined) params.set(key, String(value));
    }
    const selected = stringOption(flags, "selected");
    if (selected !== undefined) {
      const ids = selected.split(",").map((id) => id.trim());
      if (ids.some((id) => !/^(comment|annotation):[^\s:,]+$/.test(id))
          || new Set(ids).size !== ids.length) fail("--selected needs unique comment:<id> or annotation:<id> values.");
      for (const id of ids) params.append("selected", id);
    }
    const output = stringOption(flags, "out");
    const data = await apiJson(`/api/specs/${encodeURIComponent(pos[0])}/review-packet?${params}`);
    if (format === "json" && (!data || data.contractVersion !== 1 || data.artifactId !== pos[0]))
      fail("Invalid review packet response.");
    if (format === "markdown" && typeof data !== "string") fail("Invalid Markdown review packet response.");
    if (output) {
      fs.writeFileSync(output, typeof data === "string" ? data : JSON.stringify(data, null, 2) + "\n");
      ok(`Wrote review packet to ${output}.`);
    } else {
      print(data);
    }
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
    if (!pos[0]) fail("Usage: share-create <specId> [--permission view|comment] [--version n] [--expires-days n] [--passcode x]");
    const permission = stringOption(flags, "permission") || "view";
    if (!["view", "comment"].includes(permission)) fail("--permission must be view or comment.");
    const expiresInDays = integerOption(flags, "expires-days");
    if (expiresInDays > 3650) fail("--expires-days must not exceed 3650.");
    const payload = {
      permission,
      passcode: stringOption(flags, "passcode") ?? null,
      expiresInDays: expiresInDays ?? null,
      versionPin: integerOption(flags, "version") ?? null,
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

  async "privacy-set"(pos, flags) {
    const [specId, requested] = pos;
    const visibility = requested === "public" ? "link" : requested;
    if (!specId || !["private", "internal", "restricted", "link"].includes(visibility)) {
      fail("Usage: privacy-set <specId> <private|internal|restricted|link> [--users email,email]");
    }
    const users = stringOption(flags, "users");
    const scopedUsers = users ? users.split(",").map((email) => email.trim()).filter(Boolean) : [];
    if (visibility === "restricted" && !scopedUsers.length) fail("Restricted visibility requires --users with recipient emails.");
    if (visibility !== "restricted" && users !== undefined) fail("--users applies only to restricted visibility.");
    print(await apiJson(`/api/specs/${encodeURIComponent(specId)}/access`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ visibility, scopedUsers }),
    }));
    ok(`Visibility set to ${visibility}.`);
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
  login [--provider p] [--device] [--no-browser]
                                  Sign in through your browser (p: microsoft|google|apple)
                                  --device: show a code to enter on another device (SSH, containers)
  logout                          Revoke this device's token + clear local state
  whoami                          Show the signed-in account
  workspaces                      List memberships and the active workspace
  workspace-use <orgId>            Switch this device's active workspace

Artifacts:
  publish <file> [--spec <id> | --new] [--review-packet <json>] [--operation-id <key>]
                [--open] [--review]   Upload in the active workspace; target an id for updates
  list [query] [--tag a,b] [--page n]  List your visible artifacts
  get <specId>                         Spec metadata + versions
  versions <specId>                    Version list
  diff <specId> <fromVersion> <toVersion>   Compare visible text
  content <specId> [--version n] [--out f]   Download a version's HTML
  open <specId> [--version n] [--review]     Open in the browser

Share links:
  share-create <specId> [--permission view|comment] [--version n] [--expires-days n] [--passcode x]
  share-list <specId>
  share-revoke <specId> <shareId>

Review loop:
  comments <specId> [--filter open|resolved|all]
  annotations <specId> [--version n]
  review-packet <specId> [--state open|resolved|all] [--base-version n]
                [--authored-version n] [--selected comment:id,annotation:id]
                [--format json|markdown] [--out file]
  reply <specId> <commentId> "<text>"
  comment-state <specId> <commentId> <open|resolved>

Privacy & tags:
  privacy-get <specId> | privacy-set <specId> <private|internal|restricted|link> [--users email,email]
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
