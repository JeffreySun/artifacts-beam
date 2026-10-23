#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PLUGIN = "plugins/artifacts-beam";
const CODEX = `${PLUGIN}/.codex-plugin/plugin.json`;
const NATIVE_MCP = `${PLUGIN}/.codex-plugin/mcp.json`;
const HOSTED_MCP = `${PLUGIN}/.codex-plugin/openai-mcp.json`;
const SKILL = `${PLUGIN}/skills/artifacts-beam`;
const REMOTE_SKILL = `${SKILL}/references/mcp-workflow.md`;
const TIMESTAMP = new Date("2000-01-01T00:00:00Z");

function command(program, args, options = {}) {
  const result = spawnSync(program, args, {
    cwd: ROOT,
    encoding: "utf8",
    ...options,
  });
  if (result.error) throw new Error(`Could not run ${program}: ${result.error.message}`);
  if (result.status !== 0)
    throw new Error(`${program} failed (${result.status}): ${(result.stderr || result.stdout).trim()}`);
  return result.stdout;
}

function regularFile(relative) {
  let file = ROOT;
  const parts = relative.split("/");
  for (const [index, part] of parts.entries()) {
    file = path.join(file, part);
    const stat = fs.lstatSync(file);
    if (stat.isSymbolicLink() || (index === parts.length - 1 ? !stat.isFile() : !stat.isDirectory()))
      throw new Error(`Package input must be a regular file with no symlink components: ${relative}`);
  }
  return file;
}

let temporary;
try {
  if (process.argv.length !== 2) throw new Error("Usage: node scripts/package-openai.mjs");
  command(process.execPath, [path.join(ROOT, "scripts/validate-plugins.mjs")]);
  const source = JSON.parse(fs.readFileSync(regularFile(CODEX), "utf8"));
  if (source.mcpServers !== "./.codex-plugin/mcp.json" || "apps" in source)
    throw new Error("The MCP archive requires the approved native MCP source and no unregistered app references.");
  if (typeof source.skills !== "string"
      || path.resolve(ROOT, PLUGIN, source.skills) !== path.join(ROOT, PLUGIN, "skills"))
    throw new Error("The OpenAI package requires the bundled ./skills/ directory.");

  const tracked = new Set(command("git", ["-C", ROOT, "ls-files", "-z", "--",
    "LICENSE", CODEX, NATIVE_MCP, HOSTED_MCP, SKILL, `${PLUGIN}/assets`]).split("\0").filter(Boolean));
  for (const required of ["LICENSE", CODEX, NATIVE_MCP, HOSTED_MCP, `${SKILL}/SKILL.md`, REMOTE_SKILL, `${SKILL}/agents/openai.yaml`]) {
    if (!tracked.has(required)) throw new Error(`Required package input must be tracked: ${required}`);
  }
  for (const field of ["logo", "composerIcon"]) {
    const asset = path.posix.normalize(`${PLUGIN}/${source.interface[field]}`);
    if (!tracked.has(asset)) throw new Error(`Listing asset must be tracked before packaging: ${asset}`);
  }

  const manifest = { $schema: "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json" };
  for (const key of ["name", "version", "description", "author", "homepage", "repository", "license", "keywords"]) {
    if (source[key] !== undefined) manifest[key] = source[key];
  }
  const openai = {
    requires_local_executor: source.requires_local_executor,
    interface: source.interface,
  };
  if (source.id !== undefined) openai.id = source.id;
  manifest.extensions = { "com.openai": openai };
  for (const relative of tracked) {
    regularFile(relative);
    if (/(^|\/)(\.env(?:\.[^/]*)?|\.artifactsbeam|\.abeam|abeam-cookies\.txt|session\.json)(\/|$)/i.test(relative))
      throw new Error(`Refusing to package credential or private auth state: ${relative}`);
  }

  const outputDir = path.join(ROOT, "dist");
  fs.mkdirSync(outputDir, { recursive: true });
  temporary = fs.mkdtempSync(path.join(outputDir, ".openai-package-"));
  const staging = path.join(temporary, "plugin");
  function stage(relative, contents) {
    const file = path.join(staging, relative);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, contents);
    fs.chmodSync(file, 0o644);
    fs.utimesSync(file, TIMESTAMP, TIMESTAMP);
  }
  stage("plugin.json", JSON.stringify(manifest, null, 2) + "\n");
  stage("mcp.json", fs.readFileSync(regularFile(HOSTED_MCP)));
  stage("skills/artifacts-beam/SKILL.md", fs.readFileSync(regularFile(REMOTE_SKILL)));
  const files = ["plugin.json", "mcp.json", "skills/artifacts-beam/SKILL.md"];
  for (const relative of [...tracked].sort()) {
    if (relative !== "LICENSE" && !relative.startsWith(`${PLUGIN}/assets/`)
        && relative !== `${SKILL}/agents/openai.yaml`) continue;
    const target = relative === "LICENSE" ? "LICENSE" : relative.slice(PLUGIN.length + 1);
    stage(target, fs.readFileSync(regularFile(relative)));
    files.push(target);
  }
  const name = `artifacts-beam-openai-${source.version}.zip`;
  const archive = path.join(temporary, name);
  command("zip", ["-X", "-q", archive, ...files.sort()], {
    cwd: staging,
    env: { ...process.env, TZ: "UTC", ZIPOPT: "", COPYFILE_DISABLE: "1" },
  });
  const output = path.join(outputDir, name);
  fs.renameSync(archive, output);
  console.log(`Created ${output} (${files.length} files). No upload or publication performed.`);
} catch (error) {
  console.error(`OpenAI packaging failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  if (temporary) fs.rmSync(temporary, { recursive: true, force: true });
}
