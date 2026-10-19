# artifacts-beam — multi-agent plugin

Publisher: **VertiWorks Labs**. The public service is operated by VertiWorks Labs LLC.

This is a **single, self-contained plugin folder** that installs the `artifacts-beam`
skill into three coding agents — **GitHub Copilot CLI**, **Claude Code**, and **OpenAI
Codex / ChatGPT desktop** — from one source of truth. There is exactly one copy of the skill; each agent
reads its own manifest and they all load the same `skills/artifacts-beam/`.

The skill lets you publish local HTML to **Artifacts Beam**, create revocable **share
links** anyone can open without an account, pull reviewer comments back into your chat,
and iterate on the HTML. You sign in once through your browser with an enabled
Microsoft, Google, or Apple provider. Anonymous share-link viewing does not imply
anonymous commenting; reviewers sign in to leave feedback. See
[`skills/artifacts-beam/SKILL.md`](skills/artifacts-beam/SKILL.md).

## Layout

```
plugins/artifacts-beam/
├── plugin.json                     # Copilot CLI manifest
├── .claude-plugin/plugin.json      # Claude Code manifest
├── .codex-plugin/plugin.json       # Codex manifest
├── assets/icon.svg                # listing/composer icon
└── skills/artifacts-beam/          # the ONE shared skill
    ├── SKILL.md                    # instructions + triggers (the implicit-trigger source)
    ├── scripts/abeam.mjs           # portable, zero-dependency Node helper
    ├── references/                 # auth setup, API map, refinement guide
    └── agents/openai.yaml          # Codex-only UI metadata (ignored by the others)
```

Each agent looks for its manifest at a different path, so all three coexist in one
folder. Distribution uses three marketplace files at the repo root, each pointing back
at this folder:

| Agent | Marketplace file |
|---|---|
| Copilot CLI | [`.github/plugin/marketplace.json`](../../.github/plugin/marketplace.json) |
| Claude Code | [`.claude-plugin/marketplace.json`](../../.claude-plugin/marketplace.json) |
| Codex | [`.agents/plugins/marketplace.json`](../../.agents/plugins/marketplace.json) |

## Requirements

- **Node.js 18+** — the helper (`scripts/abeam.mjs`) uses the built-in global
  `fetch`/`FormData`/`Blob` (zero dependencies).
- A browser, once, to sign in — nothing to copy or paste
  (see [`skills/artifacts-beam/references/auth-setup.md`](skills/artifacts-beam/references/auth-setup.md)).

## Install

### GitHub Copilot CLI

```shell
copilot plugin marketplace add JeffreySun/artifacts-beam
copilot plugin install artifacts-beam@artibeam
```

Manage it with `copilot plugin list`, `copilot plugin update artifacts-beam`,
`copilot plugin disable artifacts-beam`, `copilot plugin uninstall artifacts-beam`.
To try it locally without registering a marketplace:

```shell
copilot --plugin-dir ./plugins/artifacts-beam plugin list
copilot plugin install ./plugins/artifacts-beam
```

### Claude Code

```shell
/plugin marketplace add JeffreySun/artifacts-beam
/plugin install artifacts-beam@artibeam
```

Plugin skills are namespaced, so the skill is invocable as
`/artifacts-beam:artifacts-beam` (Claude can also trigger it automatically from
matching intent). Refresh the catalog with `/plugin marketplace update`.

### OpenAI Codex

```shell
codex plugin marketplace add JeffreySun/artifacts-beam
codex plugin add artifacts-beam@artibeam
```

Adding the marketplace only makes the plugin *available*; the second command installs it.
You can also install/enable it from the **ChatGPT desktop app → Plugins**. Codex activates
the skill implicitly on matching intent, or explicitly via `$artifacts-beam`.
The helper requires local Node.js execution. Its OpenAI directory package is
desktop-only and does not provide ChatGPT web support.

For local development you can skip the marketplace entirely — Codex also discovers
skills dropped into `.agents/skills`:

```shell
# from a repo where you want the skill available, or into your user scope:
bash plugins/artifacts-beam/skills/artifacts-beam/scripts/install-skill.sh
#   → installs to ~/.agents/skills/artifacts-beam (Codex user-scope path)
# Windows:
#   pwsh plugins/artifacts-beam/skills/artifacts-beam/scripts/install-skill.ps1
```

## One-time sign-in

Your browser opens, you sign in with an enabled Microsoft, Google, or Apple provider,
and the terminal is signed in. Nothing to copy, nothing to paste.

```shell
node plugins/artifacts-beam/skills/artifacts-beam/scripts/abeam.mjs login
node plugins/artifacts-beam/skills/artifacts-beam/scripts/abeam.mjs whoami
```

The session is stored at `~/.artifactsbeam/session.json` (mode 600) and is never
printed or committed. Full walkthrough:
[`skills/artifacts-beam/references/auth-setup.md`](skills/artifacts-beam/references/auth-setup.md).

## For maintainers

- **Publisher identity:** author/owner/developer metadata is `VertiWorks Labs`,
  while repository URLs remain the real public source location. OpenAI's directory
  name comes from the selected verified business identity, not JSON alone.
- **Current artifact contracts:** the shared skill supports bearer-token workspace
  selection, explicit artifact-id updates, pinned shares, canonical visibility,
  comments/annotations, visible-text diffs, and model-free review packets.
  Review-based uploads use a captured base and refuse stale publication.
- **Single source of truth:** edit the skill only under `skills/artifacts-beam/`. The
  `SKILL.md` `description` is the cross-agent implicit-trigger signal (Codex, Copilot,
  and Claude all match on it), so keep it front-loaded with key functions and triggers.
- **Keep the wrappers in sync:** `name` and `version` must agree across
  `plugin.json`, `.claude-plugin/plugin.json`, and `.codex-plugin/plugin.json`, and the
  three marketplace `source` paths must resolve to this folder.
- **Validate before pushing:** `node scripts/validate-plugins.mjs` checks all of the
  above. It runs in CI (the **Validate plugin manifests** job) so drift fails the gate.
- **OpenAI ZIP:** run `node scripts/package-openai.mjs` from the repository.
  It generates a portable root manifest separately from this folder's Copilot
  manifest and includes only tracked skill/assets files and the original license.
  It never submits or publishes. Follow the
  [company-owned submission guide](../../docs/openai-publishing.md).
