# Artifacts Beam skill

A Copilot CLI skill for **[Artifacts Beam](https://artifactbeam.azurewebsites.net)** —
the consumer edition of the HTML review platform. Publish HTML artifacts, create
revocable **share links** anyone can open, gather collaborator comments, and iterate
on the HTML — signed in with a personal **Microsoft** or **Google** account (no Azure
AD / `az` required).

This is the consumer counterpart to the enterprise `htmlcanvas` skill. The core
difference is **authentication**: Artifacts Beam authenticates API calls with a
browser **session cookie**, not an AAD bearer token. See
[`references/auth-setup.md`](references/auth-setup.md).

## Layout

```
artifacts-beam/
├── SKILL.md                      # workflows (the skill the agent reads)
├── README.md                     # this file
├── scripts/
│   ├── abeam.mjs                 # zero-dependency Node.js CLI helper (the engine)
│   ├── install-skill.ps1         # install to ~/.agents/skills (Windows)
│   └── install-skill.sh          # install to ~/.agents/skills (macOS/Linux)
└── references/
    ├── auth-setup.md             # one-time session-cookie capture
    ├── api-reference.md          # command ↔ HTTP endpoint map
    └── refinement-guide.md       # how to apply review comments
```

## Requirements

- **Node.js 18+** (the helper uses the built-in global `fetch`, `FormData`, and
  `Blob` — no `npm install`, no dependencies).
- A browser, once, to sign in and capture the session cookie.

## Install

Windows (PowerShell):
```powershell
./scripts/install-skill.ps1 -Force
```

macOS / Linux:
```bash
FORCE=1 ./scripts/install-skill.sh
```

Both copy the skill to `~/.agents/skills/artifacts-beam`, where the Copilot CLI
discovers it.

## Quick start

```bash
node scripts/abeam.mjs login        # sign in once, capture the cookie (see auth-setup.md)
node scripts/abeam.mjs whoami       # confirm
node scripts/abeam.mjs publish ./mockup.html --open
node scripts/abeam.mjs share-create <specId> --permission comment --expires-days 7
node scripts/abeam.mjs help         # full command list
```

## Portability (Codex / Claude)

The helper (`scripts/abeam.mjs`) is intentionally **agent-agnostic and
dependency-free**, so the equivalent Codex and Claude skills can reuse it verbatim —
only the `SKILL.md` wrapper (trigger phrasing and tool-call conventions) changes per
agent. Keep new product behavior in `abeam.mjs` so all three skills stay in sync.

## Security

- The session cookie is stored at `~/.artifactsbeam/session.json` with mode `600`.
- The helper never prints the cookie; treat it like a password.
- `node scripts/abeam.mjs logout` revokes the session server-side and deletes the
  local file.
