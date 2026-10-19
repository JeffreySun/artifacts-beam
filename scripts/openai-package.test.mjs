import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const PLUGIN = "plugins/artifacts-beam";
const CODEX = `${PLUGIN}/.codex-plugin/plugin.json`;

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "abeam-package-"));
  for (const rel of [".agents", ".claude-plugin", ".github/plugin", "plugins", "scripts"]) {
    const target = path.join(root, rel);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.cpSync(path.join(ROOT, rel), target, { recursive: true });
  }
  fs.copyFileSync(path.join(ROOT, "LICENSE"), path.join(root, "LICENSE"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

function editJson(root, rel, edit) {
  const file = path.join(root, rel);
  const data = JSON.parse(fs.readFileSync(file, "utf8"));
  edit(data);
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function run(root, script, ...args) {
  return spawnSync(process.execPath, [path.join(root, "scripts", script), ...args], {
    cwd: root,
    encoding: "utf8",
    timeout: 20_000,
  });
}

function trackedFixture(t) {
  const root = fixture(t);
  for (const args of [["init", "--quiet"], ["add", "--all"]]) {
    const result = spawnSync("git", ["-C", root, ...args], { encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
  }
  return root;
}

function archivePath(root) {
  return path.join(root, "dist/artifacts-beam-openai-0.2.2.zip");
}

function entries(root) {
  const result = spawnSync("unzip", ["-Z1", archivePath(root)], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim().split("\n");
}

for (const [label, rel, edit] of [
  ["Copilot author", `${PLUGIN}/plugin.json`, (m) => { m.author.name = "Personal Publisher"; }],
  ["Claude author", `${PLUGIN}/.claude-plugin/plugin.json`, (m) => { m.author.name = "Personal Publisher"; }],
  ["Codex author", CODEX, (m) => { m.author.name = "Personal Publisher"; }],
  ["OpenAI developer identity", CODEX, (m) => { m.interface.developerName = "Personal Publisher"; }],
  ["Copilot marketplace owner", ".github/plugin/marketplace.json", (m) => { m.owner.name = "Personal Publisher"; }],
  ["Claude marketplace owner", ".claude-plugin/marketplace.json", (m) => { m.owner.name = "Personal Publisher"; }],
]) {
  test(`validation refuses drift in the ${label}`, (t) => {
    const root = fixture(t);
    editJson(root, rel, edit);
    const result = run(root, "validate-plugins.mjs");
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.match(result.stderr, /publisher|VertiWorks Labs/i);
  });
}

for (const value of [undefined, false]) {
  test(`validation refuses a ${value === undefined ? "missing" : "false"} desktop-only declaration`, (t) => {
    const root = fixture(t);
    editJson(root, CODEX, (m) => {
      if (value === undefined) delete m.requires_local_executor;
      else m.requires_local_executor = value;
    });
    const result = run(root, "validate-plugins.mjs");
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.match(result.stderr, /requires_local_executor.*true/);
  });
}

test("validation catches a personal author left in the shared skill", (t) => {
  const root = fixture(t);
  const file = path.join(root, PLUGIN, "skills/artifacts-beam/SKILL.md");
  fs.writeFileSync(file, fs.readFileSync(file, "utf8").replace(/^  author:.*$/m, "  author: Personal Publisher"));
  const result = run(root, "validate-plugins.mjs");
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stderr, /SKILL\.md.*publisher|SKILL\.md.*author/);
});

test("validation catches a marketplace entry advertising a different release", (t) => {
  const root = fixture(t);
  editJson(root, ".github/plugin/marketplace.json", (m) => { m.plugins[0].version = "99.0.0"; });
  const result = run(root, "validate-plugins.mjs");
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stderr, /marketplace.*version/i);
});

test("validation refuses a subtitle too long for public submission", (t) => {
  const root = fixture(t);
  editJson(root, CODEX, (m) => { m.interface.shortDescription = "x".repeat(31); });
  const result = run(root, "validate-plugins.mjs");
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stderr, /shortDescription.*30/);
});

test("validation refuses a listing icon outside the plugin package", (t) => {
  const root = fixture(t);
  editJson(root, CODEX, (m) => { m.interface.logo = "../../LICENSE"; });
  const result = run(root, "validate-plugins.mjs");
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stderr, /logo|asset|icon/i);
});

test("the upload ZIP is portable, company-owned, and runnable after extraction", (t) => {
  const root = trackedFixture(t);
  const result = run(root, "package-openai.mjs");
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const manifestEntry = spawnSync("unzip", ["-p", archivePath(root), "plugin.json"], { encoding: "utf8" });
  assert.equal(manifestEntry.status, 0, manifestEntry.stderr);
  const manifest = JSON.parse(manifestEntry.stdout);
  assert.equal(manifest.$schema, "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json");
  assert.equal(manifest.name, "artifacts-beam");
  assert.equal(manifest.version, "0.2.2");
  assert.equal(manifest.author.name, "VertiWorks Labs");
  assert.equal(manifest.extensions["com.openai"].interface.developerName, "VertiWorks Labs");
  assert.equal(manifest.extensions["com.openai"].requires_local_executor, true);
  assert.equal(manifest.extensions["com.openai"].interface.logo, "./assets/icon.svg");
  assert.ok(!("interface" in manifest));
  assert.ok(!("skills" in manifest));
  assert.ok(entries(root).includes("assets/icon.svg"));
  assert.ok(entries(root).includes("skills/artifacts-beam/SKILL.md"));
  const extracted = path.join(root, "extracted");
  const unzip = spawnSync("unzip", ["-q", archivePath(root), "-d", extracted], { encoding: "utf8" });
  assert.equal(unzip.status, 0, unzip.stderr);
  assert.equal(fs.readFileSync(path.join(extracted, "LICENSE"), "utf8"), fs.readFileSync(path.join(ROOT, "LICENSE"), "utf8"));
  const help = spawnSync(process.execPath, [path.join(extracted, "skills/artifacts-beam/scripts/abeam.mjs"), "help"], { encoding: "utf8" });
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /review-packet/);
});

test("the upload allowlist excludes wrappers, tests, and untracked credentials", (t) => {
  const root = trackedFixture(t);
  const skill = path.join(root, PLUGIN, "skills/artifacts-beam");
  fs.writeFileSync(path.join(skill, ".env"), "PRIVATE_TEST_STATE=not-for-upload");
  fs.writeFileSync(path.join(skill, "untracked.mjs"), "throw new Error('not-for-upload');");
  fs.mkdirSync(path.join(skill, ".artifactsbeam"));
  fs.writeFileSync(path.join(skill, ".artifactsbeam/session.json"), "{}");
  const result = run(root, "package-openai.mjs");
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const files = entries(root);
  assert.ok(files.every((file) => file === "plugin.json" || file === "LICENSE"
    || file.startsWith("skills/") || file.startsWith("assets/")), files.join("\n"));
  assert.ok(!files.some((file) => /\.test\.mjs$|\.env$|session\.json$|untracked|\.claude-plugin|\.codex-plugin|\.git\//.test(file)));
});

test("accidentally tracked device credentials are refused rather than archived", (t) => {
  const root = trackedFixture(t);
  const state = `${PLUGIN}/skills/artifacts-beam/.artifactsbeam/session.json`;
  fs.mkdirSync(path.dirname(path.join(root, state)), { recursive: true });
  fs.writeFileSync(path.join(root, state), JSON.stringify({ accessToken: "fake-test-credential" }));
  const tracked = spawnSync("git", ["-C", root, "add", "-f", "--", state], { encoding: "utf8" });
  assert.equal(tracked.status, 0, tracked.stderr);
  const result = run(root, "package-openai.mjs");
  assert.equal(result.status, 1);
  assert.match(result.stderr, /credential|auth.*state|private.*state/i);
  assert.ok(!fs.existsSync(archivePath(root)));
});

test("rebuilding unchanged contents is independent of source timestamps", (t) => {
  const root = trackedFixture(t);
  const first = run(root, "package-openai.mjs");
  assert.equal(first.status, 0, first.stdout + first.stderr);
  const before = fs.readFileSync(archivePath(root));
  const future = new Date("2030-01-01T00:00:00Z");
  fs.utimesSync(path.join(root, PLUGIN, "skills/artifacts-beam/SKILL.md"), future, future);
  const second = run(root, "package-openai.mjs");
  assert.equal(second.status, 0, second.stdout + second.stderr);
  assert.deepEqual(fs.readFileSync(archivePath(root)), before);
});

test("tracked symlinks fail without leaking data or replacing the last good ZIP", (t) => {
  const root = trackedFixture(t);
  const first = run(root, "package-openai.mjs");
  assert.equal(first.status, 0, first.stdout + first.stderr);
  const before = fs.readFileSync(archivePath(root));
  const outside = path.join(root, "outside.txt");
  fs.writeFileSync(outside, "private-test-state");
  const link = `${PLUGIN}/skills/artifacts-beam/scripts/leak.mjs`;
  fs.symlinkSync(outside, path.join(root, link));
  const tracked = spawnSync("git", ["-C", root, "add", "--", link], { encoding: "utf8" });
  assert.equal(tracked.status, 0, tracked.stderr);
  const result = run(root, "package-openai.mjs");
  assert.equal(result.status, 1);
  assert.match(result.stderr, /symlink|regular file/i);
  assert.deepEqual(fs.readFileSync(archivePath(root)), before);
  assert.deepEqual(fs.readdirSync(path.join(root, "dist")), ["artifacts-beam-openai-0.2.2.zip"]);
});

test("publisher validation cannot be bypassed by calling the packager directly", (t) => {
  const root = trackedFixture(t);
  editJson(root, CODEX, (m) => { m.author.name = "Personal Publisher"; });
  const result = run(root, "package-openai.mjs");
  assert.equal(result.status, 1);
  assert.match(result.stderr, /publisher|VertiWorks Labs/i);
  assert.ok(!fs.existsSync(archivePath(root)));
});

test("a skills-only archive refuses MCP declarations instead of silently dropping them", (t) => {
  const root = trackedFixture(t);
  editJson(root, CODEX, (m) => { m.mcpServers = "./.mcp.json"; });
  const result = run(root, "package-openai.mjs");
  assert.equal(result.status, 1);
  assert.match(result.stderr, /skills-only|MCP/i);
  assert.ok(!fs.existsSync(archivePath(root)));
});

test("every referenced listing asset must be tracked before packaging", (t) => {
  const root = trackedFixture(t);
  fs.copyFileSync(path.join(root, PLUGIN, "assets/icon.svg"), path.join(root, PLUGIN, "assets/untracked.svg"));
  editJson(root, CODEX, (m) => { m.interface.logo = "./assets/untracked.svg"; });
  const result = run(root, "package-openai.mjs");
  assert.equal(result.status, 1);
  assert.match(result.stderr, /tracked.*asset|asset.*tracked/i);
  assert.ok(!fs.existsSync(archivePath(root)));
});
