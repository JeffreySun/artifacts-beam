// login.mjs — browser sign-in for the Artifacts Beam CLI (loopback redirect + PKCE, RFC 8252).
//
// The CLI binds an ephemeral port on 127.0.0.1, sends the user to the site's normal sign-in page
// with that address as the redirect target, and receives a single-use authorization code straight
// back on the loopback. The code is bound to a one-time secret (PKCE) that never leaves this
// process, so it is useless to anything else that might observe it. Nothing is ever copied or
// pasted by the user — which is the entire point of this module.

import http from "node:http";
import os from "node:os";
import { createHash, randomBytes } from "node:crypto";

const CALLBACK_PATH = "/callback";
const DEFAULT_TIMEOUT_MS = 180000;

/** RFC 7636 code verifier: 32 random bytes, base64url — 43 characters, inside the 43–128 bound. */
export function newVerifier() {
  return randomBytes(32).toString("base64url");
}

export function challengeFor(verifier) {
  return createHash("sha256").update(verifier).digest("base64url");
}

const PAGE_STYLE =
  "body{font:16px/1.6 system-ui,-apple-system,sans-serif;display:grid;place-items:center;" +
  "height:100vh;margin:0;color:#111}div{text-align:center}h1{font-size:20px;margin:0 0 .3em}" +
  "p{margin:0;color:#555}";

const SUCCESS_PAGE = `<!doctype html><meta charset="utf-8"><title>Signed in</title>
<style>${PAGE_STYLE}</style>
<div><h1>&#10003; Signed in to Artifacts Beam</h1><p>You can close this tab and return to your terminal.</p></div>`;

const FAILURE_PAGE = `<!doctype html><meta charset="utf-8"><title>Sign-in failed</title>
<style>${PAGE_STYLE}</style>
<div><h1>Sign-in failed</h1><p>Return to your terminal for details.</p></div>`;

/** Binds 127.0.0.1 on an OS-assigned port and waits for exactly one OAuth callback. */
export async function startLoopbackServer() {
  // The result promise is created UP FRONT, not inside waitForCode(). The browser can reach the
  // callback before the caller gets round to awaiting, and a listener attached afterwards would
  // miss it — so the outcome is buffered here instead.
  let settle;
  const received = new Promise((resolve, reject) => {
    settle = { resolve, reject };
  });
  received.catch(() => {}); // don't trip unhandled-rejection before waitForCode attaches

  const server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://127.0.0.1");
    if (url.pathname !== CALLBACK_PATH) {
      res.writeHead(404).end();
      return;
    }
    const error = url.searchParams.get("error");
    const code = url.searchParams.get("code");
    const bad = Boolean(error) || !code;
    res.writeHead(bad ? 400 : 200, { "content-type": "text/html; charset=utf-8" });
    res.end(bad ? FAILURE_PAGE : SUCCESS_PAGE);

    if (error) settle.reject(new Error(`the sign-in page returned "${error}"`));
    else if (!code) settle.reject(new Error("the sign-in callback carried no authorization code"));
    else settle.resolve({ code, state: url.searchParams.get("state") });
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    // Port 0 = let the OS pick a free port. RFC 8252 §7.3 requires the authorization server to
    // accept any port for a loopback redirect, precisely because the client cannot reserve one.
    server.listen(0, "127.0.0.1", resolve);
  });

  const port = server.address().port;
  return {
    port,
    redirectUri: `http://127.0.0.1:${port}${CALLBACK_PATH}`,
    waitForCode(timeoutMs = DEFAULT_TIMEOUT_MS) {
      let timer;
      const timeout = new Promise((_, reject) => {
        timer = setTimeout(
          () =>
            reject(
              new Error(
                `timed out after ${Math.round(timeoutMs / 1000)}s waiting for the browser sign-in`,
              ),
            ),
          timeoutMs,
        );
      });
      return Promise.race([received, timeout]).finally(() => clearTimeout(timer));
    },
    close() {
      server.close();
      server.closeAllConnections?.();
    },
  };
}

/** Runs the whole browser sign-in and returns the server's token pair. */
export async function browserLogin({
  site,
  provider = "microsoft",
  openBrowser,
  log,
  noBrowser = false,
}) {
  const verifier = newVerifier();
  const state = randomBytes(16).toString("base64url");
  const server = await startLoopbackServer();
  try {
    const url =
      `${site}/api/auth/login/${encodeURIComponent(provider)}?mode=cli` +
      `&redirect_uri=${encodeURIComponent(server.redirectUri)}` +
      `&code_challenge=${encodeURIComponent(challengeFor(verifier))}` +
      `&state=${encodeURIComponent(state)}`;

    if (noBrowser) {
      log(`Open this URL in your browser to sign in:\n\n  ${url}\n`);
    } else {
      log(`Opening your browser to sign in…\n  ${url}\n`);
      openBrowser(url);
    }

    const received = await server.waitForCode();
    // The state echo proves this callback belongs to the flow we started, and not to one injected
    // by another process on this machine.
    if (received.state !== state) {
      throw new Error("the sign-in callback did not match this request (state mismatch)");
    }

    const res = await fetch(`${site}/api/auth/token`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        code: received.code,
        codeVerifier: verifier,
        deviceName: `CLI on ${os.hostname()}`,
      }),
    });
    if (!res.ok) {
      throw new Error(`the token exchange failed (HTTP ${res.status})`);
    }
    return await res.json();
  } finally {
    server.close();
  }
}
