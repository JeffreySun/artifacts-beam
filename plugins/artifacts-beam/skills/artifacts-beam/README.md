# Artifacts Beam skill

An agent-agnostic skill for **[Artifacts Beam](https://artibeam.ai)** — publish HTML,
create revocable **share links** anyone can open without an account, pull reviewer
comments and annotations back into the chat, and iterate on the HTML against a
captured published revision. Anonymous viewing does not mean anonymous commenting:
reviewers sign in to comment. The same skill backs **GitHub
Copilot CLI**, **Claude Code**, and **OpenAI Codex**.

For team comments and feedback, return the normal spec link without creating a
public link or changing permissions. The website enforces visitor access.

When MCP tools are present, begin with `get_profile` and follow
[`references/mcp-workflow.md`](references/mcp-workflow.md). Codex bundles that
authenticated remote connection; it does not need a local runtime. Public sharing
requires the user's browser approval, and mutations retain the expected profile.

In the retained local integration, `login` uses your browser (loopback redirect + PKCE) with a personal
**Microsoft**, **Google**, or **Apple** account and stores a device-scoped bearer token,
refreshed automatically. On a machine with no reachable browser — SSH, containers, CI —
it falls back to a **device code** you approve elsewhere. See
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
    ├── auth-setup.md             # one-time browser sign-in
    ├── mcp-workflow.md           # remote-only, scope-bound workflow
    ├── api-reference.md          # command ↔ HTTP endpoint map
    └── refinement-guide.md       # how to apply review comments
```

## Local-helper requirements

- **Node.js 18+** (the helper uses the built-in global `fetch`, `FormData`, and
  `Blob` — no `npm install`, no dependencies).
- A browser, once, to sign in — nothing to copy or paste.

## Install

Windows (PowerShell):
```powershell
pwsh scripts/install-skill.ps1 -Force
```

macOS / Linux:
```bash
FORCE=1 bash scripts/install-skill.sh
```

Both copy the skill to `~/.agents/skills/artifacts-beam`, where the Copilot CLI
discovers it.

## Quick start

```bash
node scripts/abeam.mjs login        # sign in via your browser (see auth-setup.md)
node scripts/abeam.mjs whoami       # confirm identity
node scripts/abeam.mjs workspaces   # check destination workspace
node scripts/abeam.mjs publish ./mockup.html --open
# Only for an explicitly requested public share link:
node scripts/abeam.mjs share-create <specId> --permission comment --expires-days 7
node scripts/abeam.mjs help         # full command list
```

Use `publish <file> --spec <id>` to update an existing artifact even if the local
filename changed. For review-driven updates, save `review-packet <id> --state open
--out review.json` and publish with `--spec <id> --review-packet review.json`; a
concurrent publication is refused instead of silently appending stale changes.
The helper also supports pinned share versions, canonical workspace visibility,
raw annotations, and version diffs. See [the API map](references/api-reference.md).

Published/canvased output opens in **display mode by default**, including after
applying feedback. Reading comments or using a review packet does not select
the review UI. `--review` is for an explicit request to open the review/comment
panel.

## Portability (Codex / Claude)

The helper (`scripts/abeam.mjs`) is intentionally **agent-agnostic and
dependency-free**, so the equivalent Codex and Claude skills can reuse it verbatim —
only the plugin manifests change per agent. Codex prefers the separately registered
MCP connection. The OpenAI ZIP contains the remote-only workflow and no local helper
runtime; public submission uses With MCP and still requires portal verification.

## Security

- Tokens are stored per site at `~/.artifactsbeam/session.json` with mode `600`.
- The helper never prints the token; treat it like a password.
- `node scripts/abeam.mjs logout` revokes the session server-side and deletes the
  local file.
