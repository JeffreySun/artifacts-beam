// Run with: node --test scripts/lib/deviceLogin.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { pollForToken, shouldUseDeviceFlow, formatInstructions } from "./deviceLogin.mjs";

// A fake transport: each call shifts the next canned response off the queue.
function fakeFetch(responses) {
  const calls = [];
  return {
    calls,
    fetch: async (url, init) => {
      calls.push({ url, body: JSON.parse(init.body), at: Date.now() });
      const next = responses.shift();
      if (!next) throw new Error("fakeFetch: ran out of canned responses");
      return {
        ok: next.status === 200,
        status: next.status,
        json: async () => next.body,
      };
    },
  };
}

const pair = { accessToken: "at", refreshToken: "rt", accessExpiresIn: 3600 };

test("returns the token pair once approval lands", async () => {
  const t = fakeFetch([
    { status: 400, body: { error: "authorization_pending" } },
    { status: 400, body: { error: "authorization_pending" } },
    { status: 200, body: pair },
  ]);
  const result = await pollForToken({
    site: "https://x", deviceCode: "dc", interval: 0, expiresIn: 60,
    fetchImpl: t.fetch, sleep: async () => {},
  });
  assert.deepEqual(result, pair);
  assert.equal(t.calls.length, 3);
  assert.equal(t.calls[0].body.deviceCode, "dc");
});

test("slow_down widens the interval by 5s each time", async () => {
  const waits = [];
  const t = fakeFetch([
    { status: 400, body: { error: "slow_down" } },
    { status: 400, body: { error: "slow_down" } },
    { status: 200, body: pair },
  ]);
  await pollForToken({
    site: "https://x", deviceCode: "dc", interval: 5, expiresIn: 600,
    fetchImpl: t.fetch, sleep: async (ms) => waits.push(ms),
  });
  // first wait at the base interval, then +5, then +5 again
  assert.deepEqual(waits, [5000, 10000, 15000]);
});

test("access_denied is surfaced as a clear error", async () => {
  const t = fakeFetch([{ status: 400, body: { error: "access_denied" } }]);
  await assert.rejects(
    pollForToken({ site: "https://x", deviceCode: "dc", interval: 0, expiresIn: 60, fetchImpl: t.fetch, sleep: async () => {} }),
    /declined/i,
  );
});

test("expired_token is surfaced as a clear error", async () => {
  const t = fakeFetch([{ status: 400, body: { error: "expired_token" } }]);
  await assert.rejects(
    pollForToken({ site: "https://x", deviceCode: "dc", interval: 0, expiresIn: 60, fetchImpl: t.fetch, sleep: async () => {} }),
    /expired/i,
  );
});

test("an unexpected error code is surfaced rather than swallowed", async () => {
  const t = fakeFetch([{ status: 400, body: { error: "invalid_grant" } }]);
  await assert.rejects(
    pollForToken({ site: "https://x", deviceCode: "dc", interval: 0, expiresIn: 60, fetchImpl: t.fetch, sleep: async () => {} }),
    /invalid_grant/,
  );
});

test("gives up at the deadline instead of polling forever", async () => {
  // Always pending; expiresIn 0 means the deadline has already passed.
  const t = fakeFetch(Array.from({ length: 50 }, () => ({ status: 400, body: { error: "authorization_pending" } })));
  await assert.rejects(
    pollForToken({ site: "https://x", deviceCode: "dc", interval: 0, expiresIn: 0, fetchImpl: t.fetch, sleep: async () => {} }),
    /expired|timed out/i,
  );
});

test("headless detection: SSH implies the device flow", () => {
  assert.equal(shouldUseDeviceFlow({ SSH_CONNECTION: "1.2.3.4 22" }, "linux"), true);
  assert.equal(shouldUseDeviceFlow({ SSH_TTY: "/dev/pts/0" }, "darwin"), true);
});

test("headless detection: Linux with no display implies the device flow", () => {
  assert.equal(shouldUseDeviceFlow({}, "linux"), true);
  assert.equal(shouldUseDeviceFlow({ DISPLAY: ":0" }, "linux"), false);
  assert.equal(shouldUseDeviceFlow({ WAYLAND_DISPLAY: "wayland-0" }, "linux"), false);
});

test("headless detection: a desktop mac or windows uses loopback", () => {
  assert.equal(shouldUseDeviceFlow({}, "darwin"), false);
  assert.equal(shouldUseDeviceFlow({}, "win32"), false);
});

test("the instructions put the URL and the code on their own lines", () => {
  const text = formatInstructions("https://artibeam.ai/device", "BCDF-GHJK");
  assert.match(text, /https:\/\/artibeam\.ai\/device/);
  assert.match(text, /BCDF-GHJK/);
  // The code must be visually separable — the user reads it off one screen and types on another.
  const codeLine = text.split("\n").find((l) => l.includes("BCDF-GHJK"));
  assert.ok(!codeLine.includes("https://"), "code and URL must not share a line");
});
