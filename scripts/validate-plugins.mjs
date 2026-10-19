#!/usr/bin/env node
// validate-plugins.mjs — structural validation for the multi-agent (Copilot /
// Claude / Codex) packaging of the `artifacts-beam` plugin.
//
// Approach A ships ONE self-contained plugin folder (plugins/artifacts-beam/) that
// carries three manifests + one shared skill, exposed via three marketplace files.
// This validator guards against drift and typos across those wrappers. It is
// zero-dependency (Node 18+) and exits non-zero on the first batch of failures so
// it can gate CI.
//
// Checks:
//   1. All 3 plugin manifests + 3 marketplace files parse as valid JSON.
//   2. Plugin `name` and `version` agree across the three manifests.
//   3. Every marketplace entry's source resolves to plugins/artifacts-beam/, and
//      each entry names the `artifacts-beam` plugin. Codex entries additionally
//      carry a git-subdir source + policy.installation/authentication + category.
//   4. The shared skill exists (SKILL.md) and its frontmatter has `name` +
//      `description`, with name === 'artifacts-beam'.
//   5. agents/openai.yaml exists and sets policy.allow_implicit_invocation.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PLUGIN_REL = "plugins/artifacts-beam";
const PLUGIN_DIR = path.join(REPO_ROOT, PLUGIN_REL);
const SKILL_DIR = path.join(PLUGIN_DIR, "skills", "artifacts-beam");
const EXPECT_NAME = "artifacts-beam";
const EXPECT_PUBLISHER = "VertiWorks Labs";

const errors = [];
const notes = [];
const fail = (msg) => errors.push(msg);
const ok = (msg) => notes.push(msg);

function assertPublisher(label, name) {
  if (name !== EXPECT_PUBLISHER) fail(`${label}: publisher must be "${EXPECT_PUBLISHER}"`);
}

function assertHttps(label, value) {
  let url;
  try {
    url = typeof value === "string" ? new URL(value) : null;
  } catch (error) {
    if (!(error instanceof TypeError)) throw error;
    fail(`${label} must be an absolute HTTPS URL without credentials`);
    return;
  }
  if (!url || url.protocol !== "https:" || url.username || url.password)
    fail(`${label} must be an absolute HTTPS URL without credentials`);
}

function assertBundledAsset(label, asset) {
  if (typeof asset !== "string" || !asset.startsWith("./assets/")
      || !path.resolve(PLUGIN_DIR, asset).startsWith(PLUGIN_DIR + path.sep)) {
    fail(`${label} must point inside ./assets/`);
    return;
  }
  const file = path.resolve(PLUGIN_DIR, asset);
  if (!fs.existsSync(file) || !fs.lstatSync(file).isFile()) {
    fail(`${label} asset is missing or not a regular file`);
  } else if (!fs.realpathSync(file).startsWith(fs.realpathSync(PLUGIN_DIR) + path.sep)) {
    fail(`${label} asset must stay inside the plugin`);
  } else if (fs.statSync(file).size > 5 * 1024 * 1024) {
    fail(`${label} asset exceeds 5 MiB`);
  }
}

function readText(rel) {
  const abs = path.isAbsolute(rel) ? rel : path.join(REPO_ROOT, rel);
  return fs.readFileSync(abs, "utf8");
}

function readJson(rel) {
  const raw = readText(rel);
  try {
    return JSON.parse(raw);
  } catch (e) {
    throw new Error(`invalid JSON in ${rel}: ${e.message}`);
  }
}

// Resolve a marketplace `source` (all three marketplaces resolve relative to the
// repo root, which is each marketplace's root) and assert it points at PLUGIN_DIR.
function assertResolvesToPlugin(label, sourcePath) {
  const resolved = path.resolve(REPO_ROOT, sourcePath);
  if (resolved !== PLUGIN_DIR) {
    fail(`${label}: source "${sourcePath}" resolves to ${resolved}, expected ${PLUGIN_DIR}`);
    return;
  }
  if (!fs.existsSync(path.join(resolved, "skills", "artifacts-beam", "SKILL.md"))) {
    fail(`${label}: resolved plugin dir has no skills/artifacts-beam/SKILL.md`);
    return;
  }
  ok(`${label}: source → ${PLUGIN_REL} ✓`);
}

// ── 1 + 2: manifests parse, names/versions agree ─────────────────────────────
const manifests = {
  Copilot: `${PLUGIN_REL}/plugin.json`,
  Claude: `${PLUGIN_REL}/.claude-plugin/plugin.json`,
  Codex: `${PLUGIN_REL}/.codex-plugin/plugin.json`,
};

const parsed = {};
for (const [agent, rel] of Object.entries(manifests)) {
  try {
    parsed[agent] = readJson(rel);
    ok(`${agent} manifest parses (${rel}) ✓`);
  } catch (e) {
    fail(e.message);
  }
}

const names = new Set();
const versions = new Set();
for (const [agent, m] of Object.entries(parsed)) {
  if (!m) continue;
  if (!m.name) fail(`${agent} manifest missing "name"`);
  else names.add(m.name);
  if (!m.version) fail(`${agent} manifest missing "version"`);
  else versions.add(m.version);
  assertPublisher(`${agent} manifest author`, m.author?.name);
}
if (names.size > 1) fail(`manifest "name" disagrees across agents: ${[...names].join(", ")}`);
else if (names.size === 1 && !names.has(EXPECT_NAME))
  fail(`manifest name is "${[...names][0]}", expected "${EXPECT_NAME}"`);
else if (names.size === 1) ok(`manifest name agrees: "${EXPECT_NAME}" ✓`);
if (versions.size > 1) fail(`manifest "version" disagrees across agents: ${[...versions].join(", ")}`);
else if (versions.size === 1) ok(`manifest version agrees: "${[...versions][0]}" ✓`);

if (parsed.Copilot) {
  const manifest = parsed.Copilot;
  if (manifest.$schema !== "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json")
    fail("Copilot portable manifest $schema must select Agent Plugins 1.0.0");
  const allowed = new Set(["$schema", "name", "version", "description", "author",
    "homepage", "repository", "license", "keywords", "extensions"]);
  const extra = Object.keys(manifest).filter((key) => !allowed.has(key));
  if (extra.length) fail(`Copilot portable manifest has unsupported fields: ${extra.join(", ")}`);
}

if (parsed.Claude) {
  const manifest = parsed.Claude;
  if (typeof manifest.displayName !== "string" || !manifest.displayName.trim())
    fail("Claude plugin.json: displayName must be a non-empty string");
  assertBundledAsset("Claude plugin.json: icon", manifest.icon);
  for (const field of ["documentationUrl", "supportUrl", "privacyPolicyUrl", "termsOfServiceUrl"])
    assertHttps(`Claude plugin.json: ${field}`, manifest[field]);
}

try {
  const license = `${PLUGIN_REL}/LICENSE`;
  if (!fs.existsSync(path.join(REPO_ROOT, license))) fail("Plugin-local LICENSE is required for distribution");
  else if (readText(license) !== readText("LICENSE")) fail("Plugin LICENSE must match the original root LICENSE attribution");
  const prose = readText(`${PLUGIN_REL}/README.md`).replace(/```[\s\S]*?```|~~~[\s\S]*?~~~/g, "");
  const words = prose.split(/\s+/).filter((word) => /[a-z0-9]/i.test(word));
  if (words.length < 40) fail("Plugin README must contain at least 40 prose words outside code blocks");
} catch (error) {
  fail(error.message);
}

// Codex manifest must point `skills` at the bundled skills dir.
if (parsed.Codex) {
  const skillsField = parsed.Codex.skills;
  if (!skillsField) fail(`Codex manifest missing "skills" field`);
  else {
    const skillsDir = path.resolve(PLUGIN_DIR, skillsField);
    if (!fs.existsSync(skillsDir)) fail(`Codex manifest "skills" (${skillsField}) → missing dir ${skillsDir}`);
    else ok(`Codex manifest skills → ${skillsField} ✓`);
  }
}

// ── 3: marketplace files ──────────────────────────────────────────────────────
function validateMarketplacePlugin(label, entry) {
  if (!entry) return fail(`${label}: no plugin entry found`);
  if (entry.name !== EXPECT_NAME) fail(`${label}: plugin name "${entry.name}", expected "${EXPECT_NAME}"`);
}

// Copilot: .github/plugin/marketplace.json — source is a plain string.
try {
  const m = readJson(".github/plugin/marketplace.json");
  ok("Copilot marketplace parses ✓");
  assertPublisher("Copilot marketplace owner", m.owner?.name);
  const entry = (m.plugins || []).find((p) => p.name === EXPECT_NAME);
  validateMarketplacePlugin("Copilot marketplace", entry);
  if (entry) {
    assertResolvesToPlugin("Copilot marketplace", entry.source);
    if (entry.version !== parsed.Copilot?.version || m.metadata?.version !== parsed.Copilot?.version)
      fail("Copilot marketplace version must agree with the plugin manifest");
  }
} catch (e) {
  fail(e.message);
}

// Claude: .claude-plugin/marketplace.json — source is a plain string; requires owner.
try {
  const m = readJson(".claude-plugin/marketplace.json");
  ok("Claude marketplace parses ✓");
  if (!m.name) fail("Claude marketplace missing top-level \"name\"");
  if (!m.owner || !m.owner.name) fail("Claude marketplace missing owner.name");
  const description = m.description ?? m.metadata?.description;
  if (typeof description !== "string" || !description.trim()) fail("Claude marketplace missing description");
  if (m.version !== parsed.Claude?.version) fail("Claude marketplace version must agree with the plugin manifest");
  assertPublisher("Claude marketplace owner", m.owner?.name);
  const entry = (m.plugins || []).find((p) => p.name === EXPECT_NAME);
  validateMarketplacePlugin("Claude marketplace", entry);
  if (entry) assertResolvesToPlugin("Claude marketplace", entry.source);
} catch (e) {
  fail(e.message);
}

// Codex: .agents/plugins/marketplace.json — source is an object (git-subdir) with
// required policy + category fields.
try {
  const m = readJson(".agents/plugins/marketplace.json");
  ok("Codex marketplace parses ✓");
  const entry = (m.plugins || []).find((p) => p.name === EXPECT_NAME);
  validateMarketplacePlugin("Codex marketplace", entry);
  if (entry) {
    const src = entry.source;
    if (!src || typeof src !== "object") {
      fail("Codex marketplace: source must be an object (git-subdir)");
    } else {
      if (src.source !== "git-subdir") fail(`Codex marketplace: source.source "${src.source}", expected "git-subdir"`);
      if (!src.url || !/^https?:\/\/.+\.git$/.test(src.url)) fail(`Codex marketplace: source.url invalid: ${src.url}`);
      if (!src.ref && !src.sha) fail("Codex marketplace: source needs a ref or sha selector");
      if (!src.path) fail("Codex marketplace: source.path missing");
      else assertResolvesToPlugin("Codex marketplace", src.path);
    }
    const inst = entry.policy && entry.policy.installation;
    const auth = entry.policy && entry.policy.authentication;
    if (!["AVAILABLE", "INSTALLED_BY_DEFAULT", "NOT_AVAILABLE"].includes(inst))
      fail(`Codex marketplace: policy.installation "${inst}" invalid`);
    if (!auth) fail("Codex marketplace: policy.authentication missing");
    if (!entry.category) fail("Codex marketplace: category missing");
    if (inst && auth && entry.category) ok("Codex marketplace: policy + category ✓");
  }
} catch (e) {
  fail(e.message);
}

// ── 4: shared skill SKILL.md frontmatter ──────────────────────────────────────
try {
  const skillMd = readText(path.join(SKILL_DIR, "SKILL.md"));
  const fm = skillMd.match(/^---\n([\s\S]*?)\n---/);
  if (!fm) {
    fail("SKILL.md: no YAML frontmatter block found");
  } else {
    const block = fm[1];
    const nameMatch = block.match(/^name:\s*(.+)$/m);
    const descMatch = block.match(/^description:\s*(.+)$/m);
    if (!nameMatch) fail("SKILL.md frontmatter missing \"name\"");
    else {
      const skillName = nameMatch[1].trim().replace(/^["']|["']$/g, "");
      if (skillName !== EXPECT_NAME) fail(`SKILL.md name "${skillName}", expected "${EXPECT_NAME}"`);
      else ok(`SKILL.md name: "${EXPECT_NAME}" ✓`);
    }
    if (!descMatch) fail("SKILL.md frontmatter missing \"description\"");
    else if (descMatch[1].length > 1024) fail("SKILL.md description exceeds 1024 characters");
    else ok(`SKILL.md description present (${descMatch[1].length} chars) ✓`);
    const author = block.match(/^  author:\s*(.+)$/m)?.[1]?.trim().replace(/^["']|["']$/g, "");
    assertPublisher("SKILL.md metadata author", author);
    const version = block.match(/^  version:\s*["']?([^"'\n]+)["']?\s*$/m)?.[1]?.trim();
    if (version !== parsed.Codex?.version) fail("SKILL.md metadata version must agree with the plugin manifest");
  }
} catch (e) {
  fail(e.message);
}

// ── 5: Codex agents/openai.yaml ───────────────────────────────────────────────
// NOTE the casing split, which is genuinely part of the Codex contract and not a typo:
// openai.yaml uses snake_case, while the interface block in .codex-plugin/plugin.json
// uses camelCase. Don't "fix" one to match the other.
try {
  const yaml = readText(path.join(SKILL_DIR, "agents", "openai.yaml"));
  if (!/allow_implicit_invocation:\s*(true|false)\b/.test(yaml))
    fail("openai.yaml: missing policy.allow_implicit_invocation boolean");
  else ok("openai.yaml: allow_implicit_invocation set ✓");

  // Codex spec: short_description is a UI blurb constrained to 25–64 characters.
  const sd = yaml.match(/^\s*short_description:\s*"(.*)"\s*$/m);
  if (!sd) fail("openai.yaml: missing interface.short_description");
  else if (sd[1].length < 25 || sd[1].length > 64)
    fail(`openai.yaml: short_description is ${sd[1].length} chars, must be 25–64`);
  else ok(`openai.yaml: short_description length ${sd[1].length} ✓`);

  // The default prompt must name the skill as $<name> so Codex can render it.
  const dp = yaml.match(/^\s*default_prompt:\s*"(.*)"\s*$/m);
  if (!dp) fail("openai.yaml: missing interface.default_prompt");
  else if (!dp[1].includes(`$${EXPECT_NAME}`))
    fail(`openai.yaml: default_prompt must mention "$${EXPECT_NAME}"`);
  else ok("openai.yaml: default_prompt names the skill ✓");
} catch (e) {
  fail(e.message);
}

// ── 6: Codex .codex-plugin/plugin.json interface contract ─────────────────────
// Includes current public-submission limits and the desktop-only flag.
// https://developers.openai.com/plugins/deploy/submission
try {
  const m = readJson(path.join(PLUGIN_DIR, ".codex-plugin", "plugin.json"));
  const allowed = new Set(["id", "name", "version", "description", "skills", "apps",
    "mcpServers", "interface", "author", "homepage", "repository", "license", "keywords",
    "requires_local_executor"]);
  const extra = Object.keys(m).filter((k) => !allowed.has(k));
  if (extra.length) fail(`Codex plugin.json: fields not accepted by Codex: ${extra.join(", ")}`);

  if (!/^\d+\.\d+\.\d+(?:-[\w.]+)?(?:\+[\w.]+)?$/.test(m.version || ""))
    fail(`Codex plugin.json: version "${m.version}" must be strict semver`);

  if (!m.author || typeof m.author !== "object" || !m.author.name)
    fail("Codex plugin.json: author must be an object with a name");
  if (m.requires_local_executor !== true)
    fail("Codex plugin.json: requires_local_executor must be true for the local Node helper");

  const iface = m.interface;
  if (!iface || typeof iface !== "object") {
    fail("Codex plugin.json: interface must be an object");
  } else {
    for (const f of ["displayName", "shortDescription", "longDescription", "developerName", "category"]) {
      if (typeof iface[f] !== "string" || !iface[f].trim())
        fail(`Codex plugin.json: interface.${f} must be a non-empty string`);
    }
    assertPublisher("Codex interface developerName", iface.developerName);
    for (const [field, limit] of [["displayName", 30], ["shortDescription", 30],
      ["longDescription", 4000], ["developerName", 80]]) {
      if (typeof iface[field] === "string" && iface[field].length > limit)
        fail(`Codex plugin.json: interface.${field} must not exceed ${limit} characters`);
    }
    for (const field of ["composerIcon", "logo"]) {
      assertBundledAsset(`Codex plugin.json: interface.${field}`, iface[field]);
    }
    if (!("defaultPrompt" in iface) && !("default_prompt" in iface))
      fail("Codex plugin.json: interface.defaultPrompt is required");
    if (!Array.isArray(iface.capabilities) || !iface.capabilities.length ||
        !iface.capabilities.every((c) => typeof c === "string" && c.trim()))
      fail("Codex plugin.json: interface.capabilities must be a non-empty array of strings");
    if (iface.brandColor && !/^#[0-9A-Fa-f]{6}$/.test(iface.brandColor))
      fail("Codex plugin.json: interface.brandColor must be #RRGGBB");
    if (!errors.length) ok("Codex plugin.json: interface contract ✓");
  }
} catch (e) {
  fail(e.message);
}

// ── report ────────────────────────────────────────────────────────────────────
for (const n of notes) console.log(`  ✓ ${n.replace(/ ✓$/, "")}`);
if (errors.length) {
  console.error(`\n✗ plugin validation FAILED (${errors.length}):`);
  for (const e of errors) console.error(`  ✗ ${e}`);
  process.exit(1);
}
console.log(`\n✓ plugin validation passed (${notes.length} checks).`);
