// Run with: node --test scripts/lib/credentials.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { migrate } from "./credentials.mjs";

test("a v1 cookie jar is discarded — cookie auth no longer exists", () => {
  // The user is left cleanly signed out and told to run `login`, rather than holding a
  // credential that looks valid but 401s on every call.
  const out = migrate({ cookies: { "__Host-ab_session": "abc" } }, "https://artibeam.ai");
  assert.equal(out.version, 2);
  assert.deepEqual(out.credentials, {});
});

test("a v2 store of token credentials is preserved", () => {
  const v2 = {
    version: 2,
    credentials: { "https://artibeam.ai": { accessToken: "at", refreshToken: "rt" } },
  };
  assert.deepEqual(migrate(v2, "https://artibeam.ai"), v2);
});

test("a stale cookie field is stripped but the tokens survive", () => {
  const out = migrate({
    version: 2,
    credentials: {
      "https://artibeam.ai": { accessToken: "at", refreshToken: "rt", cookies: { ab_session: "x" } },
    },
  }, "https://artibeam.ai");
  const cred = out.credentials["https://artibeam.ai"];
  assert.equal(cred.accessToken, "at");
  assert.equal(cred.refreshToken, "rt");
  assert.ok(!("cookies" in cred), "the dead cookie field must not survive");
});

test("a v2 entry holding only a cookie is dropped", () => {
  const out = migrate({
    version: 2,
    credentials: { "https://artibeam.ai": { cookies: { ab_session: "x" } } },
  }, "https://artibeam.ai");
  assert.deepEqual(out.credentials, {});
});

test("an empty or corrupt file yields an empty v2 store", () => {
  for (const input of [null, undefined, {}, "garbage", 42]) {
    const out = migrate(input, "https://artibeam.ai");
    assert.equal(out.version, 2);
    assert.deepEqual(out.credentials, {});
  }
});

test("origins are isolated from one another", () => {
  const out = migrate({
    version: 2,
    credentials: {
      "https://artibeam.ai": { accessToken: "prod" },
      "http://localhost:5001": { accessToken: "dev" },
    },
  }, "https://artibeam.ai");
  assert.equal(out.credentials["https://artibeam.ai"].accessToken, "prod");
  assert.equal(out.credentials["http://localhost:5001"].accessToken, "dev");
});

test("dropping one origin's dead cookie leaves the other signed in", () => {
  const out = migrate({
    version: 2,
    credentials: {
      "https://artibeam.ai": { accessToken: "prod", refreshToken: "r" },
      "http://localhost:5001": { cookies: { ab_session: "stale" } },
    },
  }, "https://artibeam.ai");
  assert.equal(out.credentials["https://artibeam.ai"].accessToken, "prod");
  assert.ok(!("http://localhost:5001" in out.credentials));
});

test("a refresh-only credential survives, with its account intact", () => {
  // The access token is short-lived and api() recovers from its absence by refreshing, so a
  // credential holding only a refresh token is still perfectly usable — dropping it would sign
  // the user out for no reason.
  const out = migrate({
    version: 2,
    credentials: {
      "https://artibeam.ai": { refreshToken: "rt", account: { email: "a@b.c" }, cookies: { x: "1" } },
    },
  }, "https://artibeam.ai");
  const cred = out.credentials["https://artibeam.ai"];
  assert.equal(cred.refreshToken, "rt");
  assert.deepEqual(cred.account, { email: "a@b.c" });
  assert.ok(!("cookies" in cred));
});

test("a credential with no token at all is dropped, however much else it carries", () => {
  const out = migrate({
    version: 2,
    credentials: { "https://artibeam.ai": { account: { email: "a@b.c" }, accessExpiresAt: "2026-01-01" } },
  }, "https://artibeam.ai");
  assert.deepEqual(out.credentials, {});
});
