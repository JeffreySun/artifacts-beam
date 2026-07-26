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

const errors = [];
const notes = [];
const fail = (msg) => errors.push(msg);
const ok = (msg) => notes.push(msg);

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
}
if (names.size > 1) fail(`manifest "name" disagrees across agents: ${[...names].join(", ")}`);
else if (names.size === 1 && !names.has(EXPECT_NAME))
  fail(`manifest name is "${[...names][0]}", expected "${EXPECT_NAME}"`);
else if (names.size === 1) ok(`manifest name agrees: "${EXPECT_NAME}" ✓`);
if (versions.size > 1) fail(`manifest "version" disagrees across agents: ${[...versions].join(", ")}`);
else if (versions.size === 1) ok(`manifest version agrees: "${[...versions][0]}" ✓`);

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
  const entry = (m.plugins || []).find((p) => p.name === EXPECT_NAME);
  validateMarketplacePlugin("Copilot marketplace", entry);
  if (entry) assertResolvesToPlugin("Copilot marketplace", entry.source);
} catch (e) {
  fail(e.message);
}

// Claude: .claude-plugin/marketplace.json — source is a plain string; requires owner.
try {
  const m = readJson(".claude-plugin/marketplace.json");
  ok("Claude marketplace parses ✓");
  if (!m.name) fail("Claude marketplace missing top-level \"name\"");
  if (!m.owner || !m.owner.name) fail("Claude marketplace missing owner.name");
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
    else ok(`SKILL.md description present (${descMatch[1].length} chars) ✓`);
  }
} catch (e) {
  fail(e.message);
}

// ── 5: Codex agents/openai.yaml ───────────────────────────────────────────────
try {
  const yaml = readText(path.join(SKILL_DIR, "agents", "openai.yaml"));
  if (!/allow_implicit_invocation:\s*(true|false)\b/.test(yaml))
    fail("openai.yaml: missing policy.allow_implicit_invocation boolean");
  else ok("openai.yaml: allow_implicit_invocation set ✓");
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
