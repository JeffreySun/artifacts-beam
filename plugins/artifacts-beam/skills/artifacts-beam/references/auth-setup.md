# Auth setup — signing in (one time)

```bash
node scripts/abeam.mjs login
```

Your browser opens, you sign in with your **Microsoft**, **Google**, or **Apple** account, and
the terminal is signed in. There is nothing to copy and nothing to paste.

```
$ node scripts/abeam.mjs login
Opening your browser to sign in…
  https://artibeam.ai/api/auth/login/microsoft?mode=cli&redirect_uri=http://127.0.0.1:54321/callback&…

✓ Signed in as you@example.com
```

Verify any time:

```bash
node scripts/abeam.mjs whoami
```

## How it works

The CLI starts a one-shot web server on `127.0.0.1` on a random free port and asks the site to
send the sign-in result straight back to it. The site returns a **single-use authorization code**,
which the CLI trades for an access token.

The code is bound to a one-time secret (PKCE) that never leaves the CLI process, so it is useless
to anything else that might observe it — that is what makes it safe to receive over plain HTTP on
a loopback address.

| Item | Value |
|---|---|
| Site | `https://artibeam.ai` |
| Providers | Microsoft · Google · Apple |
| Token store | `~/.artifactsbeam/session.json` (mode 600, keyed by site) |
| Access token | 1 hour, refreshed automatically |
| Refresh token | 60 days, rotates on every use |

The CLI holds **its own** token rather than a copy of your browser session. Signing out of the
website does not sign out your terminal, and signing out of the terminal does not sign out your
browser.

## Options

```bash
node scripts/abeam.mjs login --provider google    # microsoft (default), google, apple
node scripts/abeam.mjs login --no-browser         # print the URL instead of opening it
```

`--no-browser` helps when the CLI can't launch a browser for you but you can still open a URL on
the same machine (some Linux desktops, WSL). It does **not** help over SSH: the callback goes to
`127.0.0.1` on the machine running the CLI, which is not the machine running your browser.

## Signing out

```bash
node scripts/abeam.mjs logout
```

Revokes this device's token server-side and clears the local file. Other devices, and your
browser session, are untouched.

## Targeting a different deployment

```bash
node scripts/abeam.mjs config --site http://localhost:5001     # persist an override
ARTIFACTSBEAM_SITE=http://localhost:5001 node scripts/abeam.mjs whoami   # or per-invocation
```

Credentials are stored per site, so you can stay signed in to production and to a local dev
server at the same time.

## Troubleshooting

| Symptom | Fix |
|---|---|
| Browser didn't open | Run `login --no-browser` and open the printed URL yourself |
| `timed out … waiting for the browser sign-in` | The sign-in wasn't finished within 3 minutes — run `login` again |
| `state mismatch` | Something else answered the callback. Run `login` again; if it repeats, check what else is listening on loopback ports |
| Everything 401s after switching sites | Run `login` again for that site — credentials are per-site |
| `node: command not found` | Install Node.js 18+ (the helper relies on the built-in global `fetch`) |
