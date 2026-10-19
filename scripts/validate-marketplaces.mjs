#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PLUGIN = path.join(ROOT, "plugins", "artifacts-beam");
const SKILL = path.join(PLUGIN, "skills", "artifacts-beam");
const NAME = "artifacts-beam";
const ID = `${NAME}@artibeam`;
const VERSION = JSON.parse(fs.readFileSync(path.join(PLUGIN, "plugin.json"), "utf8")).version;
const CLIENTS = { claude: "2.1.296", copilot: "1.0.98" };
const temporary = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "artibeam-native-marketplaces-")));
const neutral = path.join(temporary, "neutral");
fs.mkdirSync(neutral);

function environment(client) {
  const home = path.join(temporary, client);
  const env = {
    ...process.env,
    HOME: home,
    USERPROFILE: home,
    XDG_CONFIG_HOME: path.join(home, ".config"),
    CLAUDE_CONFIG_DIR: path.join(home, ".claude"),
    COPILOT_HOME: path.join(home, ".copilot"),
    CI: "1",
    NO_COLOR: "1",
    FORCE_COLOR: "0",
    CLICOLOR_FORCE: "0",
    GIT_TERMINAL_PROMPT: "0",
    DISABLE_AUTOUPDATER: "1",
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1",
    CLAUDE_CODE_DISABLE_ERROR_REPORTING: "1",
    COPILOT_AUTO_UPDATE: "false",
  };
  // Resource-only validation must not borrow the operator's vendor credentials.
  for (const key of ["ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN", "CLAUDE_CODE_OAUTH_TOKEN",
    "GITHUB_TOKEN", "GH_TOKEN", "COPILOT_GITHUB_TOKEN", "OPENAI_API_KEY", "CODEX_API_KEY",
    "COPILOT_CUSTOM_INSTRUCTIONS_DIRS", "NODE_OPTIONS"]) delete env[key];
  for (const dir of [home, env.XDG_CONFIG_HOME, env.CLAUDE_CONFIG_DIR, env.COPILOT_HOME])
    fs.mkdirSync(dir, { recursive: true });
  return env;
}

function run(client, args, env) {
  const result = spawnSync(client, args, {
    cwd: neutral, env, encoding: "utf8", timeout: 120_000, maxBuffer: 4 * 1024 * 1024,
  });
  if (result.error) throw new Error(`${client} ${args.join(" ")}: ${result.error.message}`);
  if (result.status !== 0)
    throw new Error(`${client} ${args.join(" ")} failed (${result.status}):\n${result.stderr}\n${result.stdout}`);
  return result.stdout;
}

function checkClient(client, env) {
  const version = run(client, ["--version"], env);
  assert.match(version, new RegExp(`\\b${CLIENTS[client].replaceAll(".", "\\.")}\\b`),
    `Use the pinned ${client} ${CLIENTS[client]} native validator`);
}

try {
  const claude = environment("claude");
  checkClient("claude", claude);
  run("claude", ["plugin", "validate", "--strict", PLUGIN], claude);
  run("claude", ["plugin", "validate", "--strict", ROOT], claude);
  run("claude", ["plugin", "marketplace", "add", ROOT], claude);
  run("claude", ["plugin", "install", ID], claude);
  const installed = JSON.parse(run("claude", ["plugin", "list", "--json"], claude));
  assert.ok(Array.isArray(installed), "Claude must report an installed-plugin array");
  const plugin = installed.find((entry) => entry.id === ID);
  assert.ok(plugin?.enabled, "Claude must enable the candidate plugin");
  assert.equal(plugin.version, VERSION, "Claude installed a different version");
  assert.equal(fs.realpathSync(plugin.readFromFolder), fs.realpathSync(PLUGIN),
    "Claude must read the candidate, not upstream main or another cache");
  const inventory = run("claude", ["plugin", "details", NAME], claude);
  assert.match(inventory, /Skills\s*\(1\)\s+artifacts-beam\b/, "Claude must discover the shared skill");
  for (const component of ["Agents", "Hooks", "MCP servers", "LSP servers"])
    assert.match(inventory, new RegExp(`${component}\\s*\\(0\\)`), "Candidate must remain skills-only");
  console.log(`PASS Claude ${CLIENTS.claude}: strict plugin/catalog, ${ID} ${VERSION}, one shared skill`);

  const copilot = environment("copilot");
  checkClient("copilot", copilot);
  run("copilot", ["plugin", "marketplace", "add", ROOT], copilot);
  run("copilot", ["plugin", "install", ID], copilot);
  const plugins = JSON.parse(run("copilot", ["plugin", "list", "--json"], copilot));
  assert.ok(Array.isArray(plugins), "Copilot must report an installed-plugin array");
  const candidate = plugins.find((entry) => entry.name === NAME && entry.marketplace === "artibeam");
  assert.ok(candidate?.enabled, "Copilot must enable the candidate plugin");
  assert.equal(candidate.version, VERSION, "Copilot installed a different version");
  const skills = JSON.parse(run("copilot", ["skill", "list", "--json"], copilot));
  assert.ok(Array.isArray(skills), "Copilot must report a skill array");
  const loaded = skills.filter((entry) => entry.name === NAME && entry.source === "plugin");
  assert.equal(loaded.length, 1, "Copilot must load exactly one candidate skill");
  assert.equal(loaded[0].enabled, true);
  assert.equal(fs.realpathSync(loaded[0].path), fs.realpathSync(SKILL),
    "Copilot must load the candidate skill, not the operator's installed copy");
  console.log(`PASS Copilot ${CLIENTS.copilot}: catalog/install, ${ID} ${VERSION}, candidate skill discovery`);
  console.log("No model sessions, vendor-account login, or directory submission performed.");
} catch (error) {
  console.error(`Native marketplace validation failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  if (fs.lstatSync(temporary).isSymbolicLink() || fs.realpathSync(temporary) !== temporary)
    throw new Error("Refusing cleanup of an unexpected native-validation profile path");
  fs.rmSync(temporary, { recursive: true, force: true });
}
