# Artifacts Beam — agent skill & plugin

Publish local HTML to **[Artifacts Beam](https://artibeam.ai)**, create revocable
**share links** anyone can open, gather collaborator comments, and iterate on the HTML —
without leaving your coding agent.

One skill, three agents: **GitHub Copilot CLI**, **Claude Code**, and **OpenAI Codex**.
Signed in with a personal Microsoft or Google account — no Azure AD required.

## Install

### GitHub Copilot CLI

```shell
copilot plugin marketplace add JeffreySun/artifacts-beam
copilot plugin install artifacts-beam@artibeam
```

### Claude Code

```shell
/plugin marketplace add JeffreySun/artifacts-beam
/plugin install artifacts-beam@artibeam
```

### OpenAI Codex

```shell
codex plugin marketplace add JeffreySun/artifacts-beam
```

Then open the **ChatGPT desktop app → Plugins**, select the **Artifacts Beam**
marketplace, and enable `artifacts-beam`.

> `artifacts-beam` is the plugin; `artibeam` is the marketplace it ships in — hence
> `artifacts-beam@artibeam`.

Full install notes, local-development paths, and troubleshooting live in
[`plugins/artifacts-beam/README.md`](plugins/artifacts-beam/README.md).

## What you can say

The skill triggers on intent, so plain language works:

- "publish this html to artifacts beam"
- "create a share link for it"
- "fetch the comments on my artifact"
- "apply the review feedback"
- "revoke that share link"

## How it works

Every action runs through a portable, **zero-dependency** Node helper —
[`abeam.mjs`](plugins/artifacts-beam/skills/artifacts-beam/scripts/abeam.mjs) — using
only built-in `fetch`/`FormData`/`Blob`. The three agents share exactly one copy of the
skill; only the thin manifest wrapper differs per agent.

```
plugins/artifacts-beam/
├── plugin.json                     # Copilot CLI manifest
├── .claude-plugin/plugin.json      # Claude Code manifest
├── .codex-plugin/plugin.json       # Codex manifest
└── skills/artifacts-beam/          # the ONE shared skill
    ├── SKILL.md                    # instructions + trigger phrases
    ├── scripts/abeam.mjs           # portable Node helper
    ├── references/                 # auth setup, API map, refinement guide
    └── agents/openai.yaml          # Codex-only UI metadata
```

Three marketplace files expose that single plugin folder — `.github/plugin/`
(Copilot), `.claude-plugin/` (Claude), `.agents/plugins/` (Codex).

## Requirements

- **Node 18+** (for the helper's built-in `fetch`/`FormData`/`Blob`).
- A browser, once, to sign in and capture the session cookie — see
  [`references/auth-setup.md`](plugins/artifacts-beam/skills/artifacts-beam/references/auth-setup.md).

Your session cookie is stored locally and is never committed; the paths it uses are
git-ignored.

## Development

```shell
node scripts/validate-plugins.mjs
```

This is the CI gate. It checks that all three manifests agree on plugin name and
version, that every marketplace entry resolves to the plugin folder, and that the
skill's frontmatter is intact — so the packaging can't silently drift.

## License

MIT — see [LICENSE](LICENSE).
