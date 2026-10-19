import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const CLI = fileURLToPath(new URL("../abeam.mjs", import.meta.url));

test("Windows browser sign-in preserves the complete OAuth URL as data", { timeout: 30_000 }, async (t) => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "abeam browser &'% \u03a9-"));
  const capture = path.join(home, "launch.json");
  const received = path.join(home, "received-url.txt");
  let authorizationUrl;
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://127.0.0.1");
    if (url.pathname === "/api/auth/login/microsoft") {
      authorizationUrl = site + req.url;
      const callback = new URL(url.searchParams.get("redirect_uri"));
      callback.searchParams.set("code", "fixture-code");
      callback.searchParams.set("state", url.searchParams.get("state"));
      res.writeHead(302, { location: callback.href }).end();
    } else if (url.pathname === "/api/auth/token" && req.method === "POST") {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      const challenge = createHash("sha256").update(body.codeVerifier || "").digest("base64url");
      if (body.code !== "fixture-code"
          || challenge !== new URL(authorizationUrl).searchParams.get("code_challenge")) {
        res.writeHead(400, { "content-type": "application/json" }).end('{"error":"invalid_grant"}');
        return;
      }
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ accessToken: "fixture-access", refreshToken: "fixture-refresh", accessExpiresIn: 3600 }));
    } else if (url.pathname === "/api/auth/me" && req.headers.authorization === "Bearer fixture-access") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ authenticated: true, email: "fixture@example.test", alias: "Fixture", fullName: "Fixture" }));
    } else {
      res.writeHead(404, { "content-type": "application/json" }).end('{"error":"not_found"}');
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const site = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(home, { recursive: true, force: true });
  });

  const preload = path.join(home, "browser-probe.cjs");
  fs.writeFileSync(preload, String.raw`
const fs = require("node:fs");
const processes = require("node:child_process");
const originalSpawn = processes.spawn;
const nativeWindows = process.platform === "win32";
Object.defineProperty(process, "platform", { value: "win32" });
processes.spawn = (file, args, options) => {
  const supplied = options.env?.ARTIFACTSBEAM_BROWSER_URL;
  fs.writeFileSync(process.env.ABEAM_TEST_LAUNCH, JSON.stringify({ file, args, supplied }));
  const visit = (url) => fetch(url).catch((error) => {
    console.error(error);
    process.exit(1);
  });
  if (nativeWindows) {
    const index = args.indexOf("-Command") + 1;
    if (!index || supplied === undefined) {
      console.error("The browser URL would be interpreted as command source.");
      process.exit(1);
    }
    const prelude = "function Start-Process { param([string]$FilePath) " +
      "[System.IO.File]::WriteAllText($env:ABEAM_TEST_RECEIVED_URL, $FilePath, " +
      "[System.Text.UTF8Encoding]::new($false)) }; ";
    const command = [...args];
    command[index] = prelude + command[index];
    const child = originalSpawn(file, command, { ...options, detached: false, stdio: "pipe" });
    child.stdin.end();
    child.stderr.on("data", (data) => process.stderr.write(data));
    child.once("error", (error) => { console.error(error); process.exit(1); });
    child.once("close", (code) => {
      if (code !== 0) process.exit(1);
      visit(fs.readFileSync(process.env.ABEAM_TEST_RECEIVED_URL, "utf8"));
    });
    return child;
  }
  // Only the GUI effect is substituted; Windows CI runs the actual PowerShell parser.
  const url = supplied ?? args.at(-1);
  fs.writeFileSync(process.env.ABEAM_TEST_RECEIVED_URL, url);
  visit(url);
  return { unref() {} };
};
require("node:module").syncBuiltinESMExports();
`);

  const env = {
    ...process.env,
    NODE_OPTIONS: "",
    HOME: home,
    USERPROFILE: home,
    ARTIFACTSBEAM_SITE: site,
    ABEAM_TEST_LAUNCH: capture,
    ABEAM_TEST_RECEIVED_URL: received,
  };
  for (const key of ["SSH_CONNECTION", "SSH_TTY", "SSH_CLIENT"]) delete env[key];
  const child = spawn(process.execPath, ["--require", preload, CLI, "login"], {
    env,
    timeout: 20_000,
  });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => { stdout += chunk; });
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  const code = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", resolve);
  });
  assert.equal(code, 0, stderr);
  assert.match(stdout, /Signed in as fixture@example\.test/);
  const launch = JSON.parse(fs.readFileSync(capture, "utf8"));
  assert.equal(launch.supplied, authorizationUrl);
  assert.equal(fs.readFileSync(received, "utf8"), authorizationUrl);
  assert.ok(!launch.args.some((arg) => arg.includes(authorizationUrl)));
  const url = new URL(authorizationUrl);
  assert.equal(url.searchParams.get("mode"), "cli");
  assert.match(url.searchParams.get("redirect_uri"), /^http:\/\/127\.0\.0\.1:\d+\/callback$/);
  assert.ok(url.searchParams.get("code_challenge"));
  assert.ok(url.searchParams.get("state"));
});
