// Run with: node --test scripts/lib/login.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { newVerifier, challengeFor, startLoopbackServer } from "./login.mjs";

test("the verifier is base64url and within the RFC 7636 length bounds", () => {
  const v = newVerifier();
  assert.match(v, /^[A-Za-z0-9\-._~]+$/);
  assert.ok(v.length >= 43 && v.length <= 128, `length was ${v.length}`);
});

test("verifiers are not repeated", () => {
  assert.notEqual(newVerifier(), newVerifier());
});

test("the challenge is the base64url SHA-256 of the verifier", () => {
  const v = newVerifier();
  const expected = createHash("sha256").update(v).digest("base64url");
  assert.equal(challengeFor(v), expected);
});

test("the RFC 7636 reference vector round-trips", () => {
  assert.equal(
    challengeFor("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"),
    "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
  );
});

test("the loopback server binds 127.0.0.1 on an ephemeral port", async () => {
  const server = await startLoopbackServer();
  assert.match(server.redirectUri, /^http:\/\/127\.0\.0\.1:\d+\/callback$/);
  assert.ok(server.port > 0);
  server.close();
});

test("the loopback server resolves with the code and state it receives", async () => {
  const server = await startLoopbackServer();
  const pending = server.waitForCode(5000);
  const res = await fetch(`${server.redirectUri}?code=the-code&state=the-state`);
  assert.equal(res.status, 200);
  assert.match(await res.text(), /you can close this tab/i);
  assert.deepEqual(await pending, { code: "the-code", state: "the-state" });
  server.close();
});

// The browser can reach the callback before the caller awaits; a listener attached later
// must still see the result rather than hanging forever.
test("a callback that arrives before waitForCode is not lost", async () => {
  const server = await startLoopbackServer();
  await fetch(`${server.redirectUri}?code=early&state=s`);
  assert.deepEqual(await server.waitForCode(5000), { code: "early", state: "s" });
  server.close();
});

test("the loopback server surfaces a provider error instead of hanging", async () => {
  const server = await startLoopbackServer();
  // Attach the rejection handler BEFORE triggering the callback: the rejection would otherwise
  // land with no handler attached and register as an unhandled rejection.
  const asserted = assert.rejects(server.waitForCode(5000), /access_denied/);
  await fetch(`${server.redirectUri}?error=access_denied`);
  await asserted;
  server.close();
});

test("waitForCode times out rather than hanging forever", async () => {
  const server = await startLoopbackServer();
  await assert.rejects(server.waitForCode(150), /timed out/i);
  server.close();
});

test("a request to any other path is a 404 and does not settle the flow", async () => {
  const server = await startLoopbackServer();
  const res = await fetch(`http://127.0.0.1:${server.port}/not-the-callback`);
  assert.equal(res.status, 404);
  await assert.rejects(server.waitForCode(150), /timed out/i);
  server.close();
});
