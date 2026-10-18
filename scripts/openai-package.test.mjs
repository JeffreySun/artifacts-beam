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
