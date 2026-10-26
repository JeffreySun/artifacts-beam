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
const CLAUDE = `${PLUGIN}/.claude-plugin/plugin.json`;

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

function archivePath(root, local = false) {
  const version = JSON.parse(fs.readFileSync(path.join(root, CODEX), "utf8")).version;
  return path.join(root, `dist/artifacts-beam-${local ? "chatgpt-local" : "openai"}-${version}.zip`);
}

function entries(root, local = false) {
  const result = spawnSync("unzip", ["-Z1", archivePath(root, local)], { encoding: "utf8" });
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

for (const value of [undefined, true]) {
  test(`validation refuses a ${value === undefined ? "missing" : "true"} local-executor requirement for remote MCP`, (t) => {
    const root = fixture(t);
    editJson(root, CODEX, (m) => {
      if (value === undefined) delete m.requires_local_executor;
      else m.requires_local_executor = value;
    });
    const result = run(root, "validate-plugins.mjs");
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.match(result.stderr, /requires_local_executor.*false/);
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

test("the upload ZIP includes authenticated remote MCP and a cloud-safe company-owned skill", (t) => {
  const root = trackedFixture(t);
  const result = run(root, "package-openai.mjs");
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const manifestEntry = spawnSync("unzip", ["-p", archivePath(root), "plugin.json"], { encoding: "utf8" });
  assert.equal(manifestEntry.status, 0, manifestEntry.stderr);
  const manifest = JSON.parse(manifestEntry.stdout);
  assert.equal(manifest.$schema, "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json");
  assert.equal(manifest.name, "artifacts-beam");
  assert.equal(manifest.version, "0.3.0");
  assert.equal(manifest.author.name, "VertiWorks Labs");
  assert.equal(manifest.extensions["com.openai"].interface.developerName, "VertiWorks Labs");
  assert.equal(manifest.extensions["com.openai"].interface.displayName, "Artifacts Beam");
  assert.equal(manifest.extensions["com.openai"].requires_local_executor, false);
  assert.equal(manifest.extensions["com.openai"].interface.logo, "./assets/icon.svg");
  assert.ok(!("interface" in manifest));
  assert.ok(!("skills" in manifest));
  assert.ok(entries(root).includes("assets/icon.svg"));
  assert.ok(entries(root).includes("skills/artifacts-beam/SKILL.md"));
  assert.ok(entries(root).includes("mcp.json"));
  assert.equal(manifest.extensions["com.openai"].apps, undefined);
  assert.ok(!entries(root).includes(".app.json"));
  const extracted = path.join(root, "extracted");
  const unzip = spawnSync("unzip", ["-q", archivePath(root), "-d", extracted], { encoding: "utf8" });
  assert.equal(unzip.status, 0, unzip.stderr);
  assert.equal(fs.readFileSync(path.join(extracted, "LICENSE"), "utf8"), fs.readFileSync(path.join(ROOT, "LICENSE"), "utf8"));
  const mcp = JSON.parse(fs.readFileSync(path.join(extracted, "mcp.json"), "utf8"));
  assert.equal(mcp.mcpServers["artifacts-beam"].type, "streamable-http");
  assert.equal(mcp.mcpServers["artifacts-beam"].url, "https://artibeam.ai/mcp");
  assert.deepEqual(mcp.mcpServers["artifacts-beam"].extensions["com.openai"].auth.client, {
    mode: "provided", clientId: "artifacts-beam-openai", tokenEndpointAuthMethod: "none",
  });
  const skill = fs.readFileSync(path.join(extracted, "skills/artifacts-beam/SKILL.md"), "utf8");
  assert.match(skill, /get_profile/);
  assert.match(skill, /expectedProfileId/);
  assert.match(skill, /approval_required/);
  assert.doesNotMatch(skill, /abeam\.mjs|session\.json|node scripts|local Node/i);
  assert.ok(!entries(root).some((file) => file.endsWith(".mjs")));
});

for (const id of [
  "asdk_app_0123456789abcdef0123456789abcdef",
  "plugin_asdk_app_0123456789abcdef0123456789abcdef",
]) {
  test(`local ChatGPT packaging binds a registered ${id.startsWith("plugin_") ? "plugin" : "app"} ID without changing the submission archive`, (t) => {
    const root = trackedFixture(t);
    const submission = run(root, "package-openai.mjs");
    assert.equal(submission.status, 0, submission.stdout + submission.stderr);
    const submissionBefore = fs.readFileSync(archivePath(root));
    const nativeBefore = fs.readFileSync(path.join(root, CODEX), "utf8");
    const result = run(root, "package-openai.mjs", "--chatgpt-app-id", id);

    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.deepEqual(entries(root, true), [
      ".app.json", "LICENSE", "assets/icon.svg", "plugin.json",
      "skills/artifacts-beam/SKILL.md", "skills/artifacts-beam/agents/openai.yaml",
    ]);
    const extract = (file, local) => {
      const entry = spawnSync("unzip", ["-p", archivePath(root, local), file], { encoding: "utf8" });
      assert.equal(entry.status, 0, entry.stderr);
      return entry.stdout;
    };
    const manifest = JSON.parse(extract("plugin.json", true));
    assert.equal(manifest.name, "artifacts-beam");
    assert.equal(manifest.version, "0.3.0");
    assert.equal(manifest.extensions["com.openai"].interface.displayName, "Artifacts Beam");
    assert.equal(manifest.extensions["com.openai"].apps, "./.app.json");
    assert.deepEqual(JSON.parse(extract(".app.json", true)), {
      apps: { "artifacts-beam": { id: "asdk_app_0123456789abcdef0123456789abcdef" } },
    });
    delete manifest.extensions["com.openai"].apps;
    assert.deepEqual(manifest, JSON.parse(extract("plugin.json", false)));
    for (const file of ["LICENSE", "assets/icon.svg", "skills/artifacts-beam/SKILL.md", "skills/artifacts-beam/agents/openai.yaml"])
      assert.equal(extract(file, true), extract(file, false));
    assert.deepEqual(fs.readFileSync(archivePath(root)), submissionBefore);
    assert.equal(fs.readFileSync(path.join(root, CODEX), "utf8"), nativeBefore);
    assert.match(result.stdout, /local.*ChatGPT|ChatGPT.*local/i);
    assert.match(result.stdout, /not.*submission|not.*directory/i);
    const first = fs.readFileSync(archivePath(root, true));
    assert.equal(run(root, "package-openai.mjs", "--chatgpt-app-id", id).status, 0);
    assert.deepEqual(fs.readFileSync(archivePath(root, true)), first);
  });
}

test("local ChatGPT packaging rejects missing, unrelated and unsafe connection identifiers without replacing either ZIP", (t) => {
  const root = trackedFixture(t);
  const validId = "asdk_app_0123456789abcdef0123456789abcdef";
  assert.equal(run(root, "package-openai.mjs").status, 0);
  assert.equal(run(root, "package-openai.mjs", "--chatgpt-app-id", validId).status, 0);
  const before = [fs.readFileSync(archivePath(root)), fs.readFileSync(archivePath(root, true))];
  for (const args of [
    ["--chatgpt-app-id"],
    ["--chatgpt-app-id", ""],
    ["--chatgpt-app-id", "artifacts-beam-openai"],
    ["--chatgpt-app-id", "Plugin_0123456789abcdef0123456789abcdef"],
    ["--chatgpt-app-id", "https://chatgpt.com/plugins/plugin_asdk_app_0123456789abcdef0123456789abcdef?token=do-not-log"],
    ["--chatgpt-app-id", `${validId}\n`],
    ["--chatgpt-app-id", validId, "--extra"],
    ["--unknown", validId],
  ]) {
    const result = run(root, "package-openai.mjs", ...args);
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.match(result.stderr, /Usage|registered.*app.*ID/i);
    assert.doesNotMatch(result.stdout + result.stderr, /do-not-log/);
    assert.deepEqual(fs.readFileSync(archivePath(root)), before[0]);
    assert.deepEqual(fs.readFileSync(archivePath(root, true)), before[1]);
  }
});

test("the OpenAI package preserves an assigned identity without rewriting native manifests or MCP configuration", (t) => {
  const root = trackedFixture(t);
  editJson(root, CODEX, (manifest) => { manifest.id = "plugin_test_existing_listing"; });
  const nativeBefore = fs.readFileSync(path.join(root, CODEX), "utf8");
  const hostedBefore = fs.readFileSync(path.join(root, PLUGIN, ".codex-plugin/openai-mcp.json"), "utf8");

  const result = run(root, "package-openai.mjs");

  assert.equal(result.status, 0, result.stdout + result.stderr);
  const entry = spawnSync("unzip", ["-p", archivePath(root), "plugin.json"], { encoding: "utf8" });
  assert.equal(entry.status, 0, entry.stderr);
  const manifest = JSON.parse(entry.stdout);
  assert.equal(manifest.id, undefined);
  assert.equal(manifest.extensions["com.openai"].id, "plugin_test_existing_listing");
  assert.equal(fs.readFileSync(path.join(root, CODEX), "utf8"), nativeBefore);
  for (const file of [CODEX, CLAUDE, `${PLUGIN}/plugin.json`])
    assert.equal(JSON.parse(fs.readFileSync(path.join(root, file), "utf8")).name, "artifacts-beam");
  const mcp = spawnSync("unzip", ["-p", archivePath(root), "mcp.json"], { encoding: "utf8" });
  assert.equal(mcp.status, 0, mcp.stderr);
  assert.equal(mcp.stdout, hostedBefore);
});

test("the upload ZIP provides the required positive and negative review cases in the OpenAI extension", (t) => {
  const root = trackedFixture(t);
  const result = run(root, "package-openai.mjs");
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const archives = fs.readdirSync(path.join(root, "dist")).filter((file) => file.endsWith(".zip"));
  assert.equal(archives.length, 1);
  const entry = spawnSync("unzip", ["-p", path.join(root, "dist", archives[0]), "plugin.json"], { encoding: "utf8" });
  assert.equal(entry.status, 0, entry.stderr);
  const openai = JSON.parse(entry.stdout).extensions["com.openai"];
  assert.equal(openai.review?.test_cases?.positive?.length, 5);
  assert.equal(openai.review?.test_cases?.negative?.length, 3);
  const tools = new Set();
  for (const cases of Object.values(openai.review.test_cases)) {
    for (const reviewCase of cases) {
      for (const field of ["description", "prompt", "tools_triggered", "expected_behavior"]) {
        assert.equal(typeof reviewCase[field], "string", field);
        assert.ok(reviewCase[field].trim(), field);
      }
      assert.ok(reviewCase.description.length <= 4000);
    }
  }
  for (const reviewCase of openai.review.test_cases.positive) {
    for (const tool of reviewCase.tools_triggered.split(",").map((name) => name.trim()))
      tools.add(tool);
  }
  assert.deepEqual([...tools].sort(), [
    "create_artifact", "create_share_link", "get_artifact", "get_profile",
    "get_review_packet", "list_share_links", "publish_revision", "revoke_share_link", "search_artifacts",
  ]);
  assert.equal(typeof openai.publication.release_notes, "string");
  assert.ok(openai.publication.release_notes.trim());
  assert.equal(openai.review.test_credentials, undefined);
  assert.equal(openai.review.reviewer_instructions, undefined);
  assert.equal(openai.review.demo_recording_url, undefined);
  assert.equal(openai.publication.countries, undefined);
  assert.equal(openai.publication.translations, undefined);
});

test("native Codex declares its own registered OAuth client, not the portal-only extension", (t) => {
  const root = fixture(t);
  const manifest = JSON.parse(fs.readFileSync(path.join(root, CODEX), "utf8"));
  assert.equal(manifest.mcpServers, "./.codex-plugin/mcp.json");
  const mcp = JSON.parse(fs.readFileSync(path.join(root, PLUGIN, manifest.mcpServers), "utf8"));
  assert.deepEqual(mcp.mcpServers["artifacts-beam"], {
    type: "http",
    url: "https://artibeam.ai/mcp",
    oauth: { clientId: "artifacts-beam-codex-cli" },
  });
  assert.ok(!fs.existsSync(path.join(root, PLUGIN, ".mcp.json")));
});

for (const [label, file, edit] of [
  ["native credential header", ".codex-plugin/mcp.json", (m) => {
    m.mcpServers["artifacts-beam"].headers = { Authorization: "Bearer fake-test-credential" };
  }],
  ["wrong native client", ".codex-plugin/mcp.json", (m) => {
    m.mcpServers["artifacts-beam"].oauth.clientId = "artifacts-beam-openai";
  }],
  ["hosted client secret", ".codex-plugin/openai-mcp.json", (m) => {
    m.mcpServers["artifacts-beam"].extensions["com.openai"].auth.client.clientSecret = "fake-test-secret";
  }],
  ["untrusted endpoint", ".codex-plugin/openai-mcp.json", (m) => {
    m.mcpServers["artifacts-beam"].url = "http://untrusted.example/mcp";
  }],
]) {
  test(`packaging refuses ${label}`, (t) => {
    const root = trackedFixture(t);
    editJson(root, `${PLUGIN}/${file}`, edit);
    const result = run(root, "package-openai.mjs");
    assert.equal(result.status, 1);
    assert.match(result.stderr, /MCP|OAuth|client|endpoint/i);
    assert.ok(!fs.existsSync(archivePath(root)));
    assert.doesNotMatch(result.stderr, /fake-test-credential|fake-test-secret/);
  });
}

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
  assert.ok(files.every((file) => file === "plugin.json" || file === "mcp.json" || file === "LICENSE"
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
  assert.deepEqual(fs.readdirSync(path.join(root, "dist")), [path.basename(archivePath(root))]);
});

test("publisher validation cannot be bypassed by calling the packager directly", (t) => {
  const root = trackedFixture(t);
  editJson(root, CODEX, (m) => { m.author.name = "Personal Publisher"; });
  const result = run(root, "package-openai.mjs");
  assert.equal(result.status, 1);
  assert.match(result.stderr, /publisher|VertiWorks Labs/i);
  assert.ok(!fs.existsSync(archivePath(root)));
});

test("packaging refuses an unexpected MCP configuration path rather than dropping it", (t) => {
  const root = trackedFixture(t);
  editJson(root, CODEX, (m) => { m.mcpServers = "./.mcp.json"; });
  const result = run(root, "package-openai.mjs");
  assert.equal(result.status, 1);
  assert.match(result.stderr, /MCP|mcp/i);
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

for (const field of ["displayName", "icon", "documentationUrl", "supportUrl", "privacyPolicyUrl", "termsOfServiceUrl"]) {
  test(`marketplace readiness refuses missing Claude ${field}`, (t) => {
    const root = fixture(t);
    editJson(root, CLAUDE, (manifest) => { delete manifest[field]; });
    const result = run(root, "validate-plugins.mjs");
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.match(result.stderr, new RegExp(`Claude.*${field}`));
  });
}

for (const value of ["http://example.test/privacy", "https://user:password@example.test/privacy"]) {
  test(`marketplace readiness rejects an unsafe Claude privacy URL: ${new URL(value).protocol}`, (t) => {
    const root = fixture(t);
    editJson(root, CLAUDE, (manifest) => { manifest.privacyPolicyUrl = value; });
    const result = run(root, "validate-plugins.mjs");
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.match(result.stderr, /Claude.*privacyPolicyUrl.*HTTPS/);
  });
}

test("marketplace readiness rejects a Claude icon outside the plugin", (t) => {
  const root = fixture(t);
  editJson(root, CLAUDE, (manifest) => { manifest.icon = "../../LICENSE"; });
  const result = run(root, "validate-plugins.mjs");
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stderr, /Claude.*icon.*assets/);
});

test("marketplace readiness requires a Claude catalog description", (t) => {
  const root = fixture(t);
  editJson(root, ".claude-plugin/marketplace.json", (manifest) => {
    delete manifest.description;
    if (manifest.metadata) delete manifest.metadata.description;
  });
  const result = run(root, "validate-plugins.mjs");
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stderr, /Claude marketplace.*description/);
});

test("marketplace readiness requires the supported portable Copilot manifest", (t) => {
  const root = fixture(t);
  editJson(root, `${PLUGIN}/plugin.json`, (manifest) => { delete manifest.$schema; });
  const result = run(root, "validate-plugins.mjs");
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stderr, /Copilot.*schema/);
});

test("portable Copilot metadata cannot override fixed skill discovery", (t) => {
  const root = fixture(t);
  editJson(root, `${PLUGIN}/plugin.json`, (manifest) => { manifest.skills = "./elsewhere"; });
  const result = run(root, "validate-plugins.mjs");
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stderr, /Copilot.*(portable|fields|skills)/);
});

test("subdirectory distribution retains a plugin-local license", (t) => {
  const root = fixture(t);
  fs.rmSync(path.join(root, PLUGIN, "LICENSE"), { force: true });
  const result = run(root, "validate-plugins.mjs");
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stderr, /plugin.*LICENSE|LICENSE.*plugin/i);
});

test("plugin-local license preserves the original attribution", (t) => {
  const root = fixture(t);
  fs.writeFileSync(path.join(root, PLUGIN, "LICENSE"), "A different attribution\n");
  const result = run(root, "validate-plugins.mjs");
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stderr, /LICENSE.*match|license.*attribution/i);
});

test("directory README minimum counts prose rather than code blocks", (t) => {
  const root = fixture(t);
  fs.writeFileSync(path.join(root, PLUGIN, "README.md"), `# Artifact\n\n\`\`\`text\n${"example ".repeat(60)}\n\`\`\`\n`);
  const result = run(root, "validate-plugins.mjs");
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stderr, /README.*40.*words/);
});
