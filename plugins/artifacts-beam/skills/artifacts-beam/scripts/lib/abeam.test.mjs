import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const CLI = fileURLToPath(new URL("../abeam.mjs", import.meta.url));
const revision = {
  entityId: "artifact-42",
  revisionId: "a".repeat(64),
  publishedVersion: 7,
  draftETag: null,
  contentSha256: "b".repeat(64),
};
const packet = { contractVersion: 1, artifactId: "artifact-42", baseRevision: revision, feedback: [] };
const published = {
  spec: { specId: "artifact-42", displayName: "original.html", latestVersionNumber: 8 },
  version: { versionNumber: 8 },
  wasExistingSpec: true,
};

async function fixture(t, response = published) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "abeam-contract-"));
  const requests = [];
  const server = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    requests.push({
      method: req.method,
      url: req.url,
      headers: req.headers,
      body: Buffer.concat(chunks).toString("utf8"),
    });
    const result = typeof response === "function" ? response(req) : { body: response };
    res.writeHead(result.status || 200, { "content-type": result.type || "application/json" });
    res.end(typeof result.body === "string" ? result.body : JSON.stringify(result.body));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const site = `http://127.0.0.1:${server.address().port}`;
  fs.mkdirSync(path.join(home, ".artifactsbeam"));
  fs.writeFileSync(path.join(home, ".artifactsbeam", "session.json"), JSON.stringify({
    version: 2,
    credentials: { [site]: { accessToken: "local-test-token" } },
  }));
  const html = path.join(home, "renamed.html");
  fs.writeFileSync(html, "<!doctype html><html><body>Reviewed</body></html>");
  const packetFile = path.join(home, "review.json");
  fs.writeFileSync(packetFile, JSON.stringify(packet));
  t.after(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(home, { recursive: true, force: true });
  });
  async function run(...args) {
    const child = spawn(process.execPath, [CLI, ...args], {
      env: { ...process.env, HOME: home, USERPROFILE: home, ARTIFACTSBEAM_SITE: site },
      timeout: 10_000,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    return new Promise((resolve, reject) => {
      child.on("error", reject);
      child.on("close", (code) => resolve({ code, stdout, stderr }));
    });
  }
  return { run, requests, html, home, packetFile };
}

test("publishing a renamed working copy targets the selected artifact", async (t) => {
  const f = await fixture(t);
  const result = await f.run("publish", f.html, "--spec", "artifact-42");
  assert.equal(result.code, 0, result.stderr);
  assert.equal(f.requests[0].url, "/api/specs/artifact-42/versions");
  assert.equal(f.requests[0].method, "POST");
  assert.match(f.requests[0].body, /filename="renamed.html"/);
});

test("explicitly creating a separate artifact disables filename grouping", async (t) => {
  const f = await fixture(t);
  const result = await f.run("publish", f.html, "--new");
  assert.equal(result.code, 0, result.stderr);
  assert.match(f.requests[0].body, /name="forceNewSpec"\r\n\r\ntrue/);
});

test("review publication sends the captured revision and a stable operation key", async (t) => {
  const f = await fixture(t);
  const result = await f.run("publish", f.html, "--spec", "artifact-42",
    "--review-packet", f.packetFile, "--operation-id", "apply-review-7");
  assert.equal(result.code, 0, result.stderr);
  const request = f.requests[0];
  assert.equal(request.url, "/api/specs/artifact-42/versions");
  assert.equal(request.headers["idempotency-key"], "apply-review-7");
  assert.match(request.body, /name="submissionMode"\r\n\r\nreplaceIfCurrent/);
  assert.ok(request.body.includes(JSON.stringify(revision)));
});

test("a packet for another artifact is refused before uploading", async (t) => {
  const f = await fixture(t);
  const result = await f.run("publish", f.html, "--spec", "different-artifact",
    "--review-packet", f.packetFile);
  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /artifact/i);
  assert.equal(f.requests.length, 0);
});

test("misspelled publication options cannot silently upload to a different artifact", async (t) => {
  const f = await fixture(t);
  const result = await f.run("publish", f.html, "--spec-id", "artifact-42");
  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /unknown.*spec-id/i);
  assert.equal(f.requests.length, 0);
});

test("a stale-base conflict is reported without falling back to another upload", async (t) => {
  const f = await fixture(t, () => ({ status: 409, body: { error: "base-moved" } }));
  const result = await f.run("publish", f.html, "--spec", "artifact-42",
    "--review-packet", f.packetFile);
  assert.equal(result.code, 1);
  assert.match(result.stderr, /base-moved/);
  assert.equal(f.requests.length, 1);
  assert.equal(f.requests[0].url, "/api/specs/artifact-42/versions");
});

test("workspace discovery returns the current token's organization context", async (t) => {
  const f = await fixture(t, { activeOrgId: "team-1", orgs: [{ orgId: "team-1", isActive: true }] });
  const result = await f.run("workspaces");
  assert.equal(result.code, 0, result.stderr);
  assert.equal(f.requests[0].url, "/api/orgs");
  assert.equal(JSON.parse(result.stdout).activeOrgId, "team-1");
});

test("workspace selection updates the bearer token rather than a browser session", async (t) => {
  const f = await fixture(t, { activeOrgId: "team-1" });
  const result = await f.run("workspace-use", "team-1");
  assert.equal(result.code, 0, result.stderr);
  assert.equal(f.requests[0].url, "/api/mobile/active-org");
  assert.equal(f.requests[0].method, "POST");
  assert.deepEqual(JSON.parse(f.requests[0].body), { orgId: "team-1" });
});

test("visibility uses canonical workspace-aware values and scoped recipients", async (t) => {
  const f = await fixture(t, { visibility: "restricted", canManage: true });
  for (const [input, visibility, extra, users] of [
    ["internal", "internal", [], []],
    ["public", "link", [], []],
    ["restricted", "restricted", ["--users", "sam@example.com,lee@example.com"], ["sam@example.com", "lee@example.com"]],
  ]) {
    const result = await f.run("privacy-set", "artifact-42", input, ...extra);
    assert.equal(result.code, 0, result.stderr);
    assert.deepEqual(JSON.parse(f.requests.at(-1).body), { visibility, scopedUsers: users });
  }
});

test("restricted visibility without recipients is refused locally", async (t) => {
  const f = await fixture(t);
  const result = await f.run("privacy-set", "artifact-42", "restricted");
  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /users|recipient/i);
  assert.equal(f.requests.length, 0);
});

test("share creation can pin an immutable version", async (t) => {
  const f = await fixture(t, { shareId: "share-1", url: "https://example.test/s/once" });
  const result = await f.run("share-create", "artifact-42", "--permission", "comment",
    "--version", "7", "--expires-days", "7");
  assert.equal(result.code, 0, result.stderr);
  assert.deepEqual(JSON.parse(f.requests[0].body), {
    permission: "comment", passcode: null, expiresInDays: 7, versionPin: 7,
  });
});

test("an invalid share permission is not silently converted to view access", async (t) => {
  const f = await fixture(t);
  const result = await f.run("share-create", "artifact-42", "--permission", "edit");
  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /permission/i);
  assert.equal(f.requests.length, 0);
});

test("review packets preserve scoped feedback selection and save JSON", async (t) => {
  const f = await fixture(t, packet);
  const output = path.join(f.home, "packet.json");
  const result = await f.run("review-packet", "artifact-42", "--state", "open",
    "--base-version", "7", "--authored-version", "6", "--selected", "comment:a,annotation:b",
    "--out", output);
  assert.equal(result.code, 0, result.stderr);
  const url = new URL(f.requests[0].url, "http://localhost");
  assert.equal(url.pathname, "/api/specs/artifact-42/review-packet");
  assert.equal(url.searchParams.get("baseVersion"), "7");
  assert.equal(url.searchParams.get("authoredVersion"), "6");
  assert.equal(url.searchParams.get("state"), "open");
  assert.deepEqual(url.searchParams.getAll("selected"), ["comment:a", "annotation:b"]);
  assert.deepEqual(JSON.parse(fs.readFileSync(output, "utf8")), packet);
});

test("Markdown review packets are written verbatim rather than JSON-quoted", async (t) => {
  const markdown = "# Artifact review packet\n\n```json\n{}\n```\n";
  const f = await fixture(t, () => ({ type: "text/markdown", body: markdown }));
  const output = path.join(f.home, "packet.md");
  const result = await f.run("review-packet", "artifact-42", "--format", "markdown", "--out", output);
  assert.equal(result.code, 0, result.stderr);
  assert.equal(fs.readFileSync(output, "utf8"), markdown);
});

test("annotations can be restricted to the revision being reviewed", async (t) => {
  const f = await fixture(t, [{ id: "ink-1", versionNumber: 7, instruction: "Move this" }]);
  const result = await f.run("annotations", "artifact-42", "--version", "7");
  assert.equal(result.code, 0, result.stderr);
  assert.equal(f.requests[0].url, "/api/specs/artifact-42/annotations?version=7");
  assert.equal(JSON.parse(result.stdout)[0].id, "ink-1");
});

test("version comparison uses the server's visible-text diff", async (t) => {
  const f = await fixture(t, { fromVersion: 6, toVersion: 7, rows: [] });
  const result = await f.run("diff", "artifact-42", "6", "7");
  assert.equal(result.code, 0, result.stderr);
  assert.equal(f.requests[0].url, "/api/specs/artifact-42/versions/6/diff/7");
});

test("a malformed comments response does not pretend there is no feedback", async (t) => {
  const f = await fixture(t, { unexpected: "not a comments list" });
  const result = await f.run("comments", "artifact-42");
  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /comments|array|response/i);
  assert.doesNotMatch(result.stdout, /^\[\]/);
});

test("unsupported .htm uploads are refused before making a request", async (t) => {
  const f = await fixture(t);
  const htm = path.join(f.home, "unsupported.htm");
  fs.copyFileSync(f.html, htm);
  const result = await f.run("publish", htm);
  assert.notEqual(result.code, 0);
  assert.equal(f.requests.length, 0);
});
