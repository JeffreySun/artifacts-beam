// Run with: node --test scripts/lib/credentials.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { migrate } from "./credentials.mjs";

test("a v1 cookie jar is migrated under the configured origin", () => {
  const v1 = { cookies: { "__Host-ab_session": "abc" } };
  const out = migrate(v1, "https://artibeam.ai");
  assert.equal(out.version, 2);
  assert.deepEqual(out.credentials["https://artibeam.ai"].cookies, { "__Host-ab_session": "abc" });
});

test("a v2 store is returned unchanged", () => {
  const v2 = { version: 2, credentials: { "https://artibeam.ai": { accessToken: "t" } } };
  assert.deepEqual(migrate(v2, "https://artibeam.ai"), v2);
});

test("an empty or corrupt file yields an empty v2 store", () => {
  for (const input of [null, undefined, {}, "garbage", 42]) {
    const out = migrate(input, "https://artibeam.ai");
    assert.equal(out.version, 2);
    assert.deepEqual(out.credentials, {});
  }
});

test("origins are isolated from one another", () => {
  const out = migrate(
    {
      version: 2,
      credentials: {
        "https://artibeam.ai": { accessToken: "prod" },
        "http://localhost:5001": { accessToken: "dev" },
      },
    },
    "https://artibeam.ai",
  );
  assert.equal(out.credentials["https://artibeam.ai"].accessToken, "prod");
  assert.equal(out.credentials["http://localhost:5001"].accessToken, "dev");
});

test("a v1 jar with no cookies does not create an empty origin entry", () => {
  const out = migrate({ cookies: {} }, "https://artibeam.ai");
  assert.deepEqual(out.credentials, {});
});
