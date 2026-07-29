// deviceLogin.mjs — device-code sign-in for the Artifacts Beam CLI (RFC 8628).
//
// Used when the browser and the CLI are not on the same machine — over SSH, in a container, on a
// CI runner. The loopback flow cannot work there: its callback goes to 127.0.0.1 on the machine
// running the CLI, which the user's browser can never reach.
//
// Instead the CLI shows a short code and a URL. The user opens that URL on ANY device with a
// browser, signs in normally, and approves. The CLI polls until that happens.

import os from "node:os";

const DEFAULT_INTERVAL_SECONDS = 5;
const SLOW_DOWN_BACKOFF_SECONDS = 5; // RFC 8628 §3.5: add 5s to the interval on every slow_down

const sleepMs = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * True when this machine almost certainly cannot receive a loopback callback from the user's
 * browser. Being wrong in the cautious direction is cheap — the device flow works everywhere,
 * it is just slightly more typing — whereas guessing "loopback" on a remote box produces a
 * sign-in that hangs until it times out.
 */
export function shouldUseDeviceFlow(env = process.env, platform = process.platform) {
  if (env.SSH_CONNECTION || env.SSH_TTY || env.SSH_CLIENT) return true;
  if (platform === "linux" && !env.DISPLAY && !env.WAYLAND_DISPLAY) return true;
  return false;
}

/** The user reads this off one screen and types it on another, so keep the parts on separate lines. */
export function formatInstructions(verificationUri, userCode) {
  return `To sign in, visit:\n\n    ${verificationUri}\n\nand enter this code:\n\n    ${userCode}\n`;
}

/** Asks the server to start a device authorization and returns its response verbatim. */
export async function requestDeviceCode({ site, fetchImpl = fetch }) {
  const res = await fetchImpl(`${site}/api/auth/device/code`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ deviceName: `CLI on ${os.hostname()}` }),
  });
  if (!res.ok) {
    throw new Error(`could not start device sign-in (HTTP ${res.status})`);
  }
  return await res.json();
}

/**
 * Polls until the user approves, declines, or the grant expires.
 * `sleep` and `fetchImpl` are injected so the tests can run instantly and deterministically.
 */
export async function pollForToken({
  site,
  deviceCode,
  interval = DEFAULT_INTERVAL_SECONDS,
  expiresIn = 900,
  fetchImpl = fetch,
  sleep = sleepMs,
}) {
  let waitSeconds = interval;
  const deadline = Date.now() + expiresIn * 1000;

  for (;;) {
    await sleep(waitSeconds * 1000);

    const res = await fetchImpl(`${site}/api/auth/device/token`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ deviceCode, deviceName: `CLI on ${os.hostname()}` }),
    });

    if (res.status === 200) {
      return await res.json();
    }

    let error = "unknown_error";
    try {
      error = (await res.json())?.error || error;
    } catch {
      /* a non-JSON body leaves the default */
    }

    if (error === "authorization_pending") {
      if (Date.now() >= deadline) {
        throw new Error("the sign-in request expired before it was approved — run login again");
      }
      continue;
    }
    if (error === "slow_down") {
      // The server says we are polling too fast. Widen the interval permanently, per the RFC.
      waitSeconds += SLOW_DOWN_BACKOFF_SECONDS;
      continue;
    }
    if (error === "access_denied") {
      throw new Error("the sign-in request was declined");
    }
    if (error === "expired_token") {
      throw new Error("the sign-in request expired before it was approved — run login again");
    }
    throw new Error(`device sign-in failed: ${error}`);
  }
}

/** Runs the whole device flow and returns the server's token pair. */
export async function deviceLogin({ site, log, openBrowser, fetchImpl = fetch, sleep = sleepMs }) {
  const grant = await requestDeviceCode({ site, fetchImpl });
  log(formatInstructions(grant.verificationUri, grant.userCode));

  // Opening the prefilled URL is a convenience for the case where a browser IS reachable but the
  // loopback port is not. It never replaces the printed instructions, because most callers of this
  // flow have no browser at all.
  if (openBrowser && grant.verificationUriComplete) {
    openBrowser(grant.verificationUriComplete);
  }

  log("Waiting for approval…");
  return await pollForToken({
    site,
    deviceCode: grant.deviceCode,
    interval: grant.interval,
    expiresIn: grant.expiresIn,
    fetchImpl,
    sleep,
  });
}
