# Auth setup — capturing your Artifacts Beam session (one time)

Artifacts Beam is the **consumer** edition. Unlike the enterprise HTML Canvas skill,
it does **not** accept Azure AD / `az` bearer tokens. Every API call is authenticated
by an opaque, **HttpOnly session cookie** that the site issues after you sign in
interactively with a personal **Microsoft** (or **Google**) account.

Because the cookie is `HttpOnly` and the app's OAuth redirect is fixed to its own
domain, a CLI can't complete the sign-in headlessly. So the one-time step is simply
**capturing the cookie from a browser sign-in**. The cookie then lasts ~7 days of
sliding activity (30 days absolute), and the helper renews it automatically as you use it.

## Facts (not secrets)

| Item | Value |
|---|---|
| Site | `https://artifactbeam.azurewebsites.net` |
| Session cookie (prod) | `__Host-ab_session` |
| Session cookie (local dev) | `ab_session` |
| Providers | Microsoft (personal accounts) · Google |
| Session store | `~/.artifactsbeam/session.json` (mode 600) |

## Option 1 — DevTools copy (works everywhere, no extra tools)

```bash
node scripts/abeam.mjs login          # opens the sign-in page and prints these steps
```

1. The browser opens to `https://artifactbeam.azurewebsites.net/api/auth/login/microsoft?returnUrl=%2F`.
2. **Sign in** with your Microsoft or Google account. You'll land back on the app.
3. Open **DevTools** (F12) → **Application** (Chrome/Edge) or **Storage** (Firefox)
   → **Cookies** → `https://artifactbeam.azurewebsites.net`.
4. Find **`__Host-ab_session`** and copy its **Value** (a long opaque string).
5. Save it:
   ```bash
   node scripts/abeam.mjs login --cookie "<paste-the-value>"
   ```
   You can paste either the bare value or the full `__Host-ab_session=<value>` pair.

The helper validates the cookie against `/api/auth/me` and prints
`✓ Signed in as you@example.com`. Verify any time with:

```bash
node scripts/abeam.mjs whoami
```

## Option 2 — Browser-assisted capture (optional convenience)

If you have a browser-automation tool available (e.g. Playwright or Puppeteer), you
can script the launch-sign-in-and-read-cookie loop so you never touch DevTools. This
is optional and not required by the helper; a minimal pattern:

1. Launch a **headed** browser to the login URL above.
2. Let the user complete the Microsoft/Google sign-in.
3. Wait for navigation back to the `artifactbeam.azurewebsites.net` origin.
4. Read the `__Host-ab_session` cookie from the browser context (automation tools can
   read HttpOnly cookies) and pass it to `login --cookie`.

Keep this out of the core helper so the skill stays dependency-free; add it only if a
browser-automation package is already present in your environment.

## Refreshing / signing out

- The session **slides**: the helper saves any rotated cookie the server returns, so
  active use keeps you signed in up to the 30-day absolute cap.
- When it finally expires you'll see `Not signed in (HTTP 401)` — just repeat the
  capture above.
- To end the session everywhere:
  ```bash
  node scripts/abeam.mjs logout      # revokes server-side + deletes the local session file
  ```

## Targeting a different deployment

```bash
node scripts/abeam.mjs config --site https://localhost:5001     # persist an override
# or, per-invocation:
ARTIFACTSBEAM_SITE=https://localhost:5001 node scripts/abeam.mjs whoami
```

When the site is `http://` (local dev), the cookie name is `ab_session` (no `__Host-`
prefix, which requires HTTPS); the helper picks the right name automatically.

## Why a cookie and not a Personal Access Token?

The consumer app deliberately has no token/PAT surface — it keeps the consumer
attack surface minimal and reuses the same browser session you already have. If a
first-class CLI auth path (device code or PAT) is added to the service later, this
helper's `login` command is the natural place to wire it in.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `whoami` → "Not signed in" right after login | You copied the wrong cookie — make sure it's `__Host-ab_session`, not the antiforgery `ab.xsrf` cookie |
| `Cookie saved but … not authenticated` | The cookie is expired or truncated; sign in again and re-copy the full value |
| Browser didn't open on `login` | Open the printed URL manually, then run `login --cookie` |
| `node: command not found` | Install Node.js 18+ (the helper relies on the built-in global `fetch`) |
| Everything 401s on a self-hosted site | Confirm `config --site` matches where you signed in; the cookie is bound to that exact host |
