<div align="center">

# Artifacts Beam

**Your coding agent just built you an HTML page. Now get it reviewed — without deploying anything.**

Publish local HTML straight from your agent, get a link anyone can open, and pull their
comments back into the chat so your agent can act on them.

[![CI](https://github.com/JeffreySun/artifacts-beam/actions/workflows/ci.yml/badge.svg)](https://github.com/JeffreySun/artifacts-beam/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Agents](https://img.shields.io/badge/agents-Copilot%20CLI%20%7C%20Claude%20Code%20%7C%20Codex-6f42c1)](#install)

[**artibeam.ai**](https://artibeam.ai) · [Install](#install) · [What you can say](#what-you-can-say) · [How it works](#how-it-works)

</div>

---

## The problem

Your agent generates a dashboard, a landing page, a report, a mockup. To get feedback you
screenshot it into Slack, or spin up a server, or commit to a branch and wait for a preview
deploy. Then the feedback comes back as scattered messages you have to re-type into the chat.

## The fix

```
you  ▸ publish this to artifacts beam and give me a link my team can comment on

     ✓ Published dashboard.html — version 3
     ✓ Share link (comment): https://artibeam.ai/s/ZfyIrDsNURD8H5GLqESn

        …teammates open it in a browser and leave comments…

you  ▸ what feedback did I get?

     3 open comments:
     • "Revenue chart y-axis should start at zero"
     • "Can the date filter default to last 30 days?"
     • "Typo in the footer — 'Analitics'"

you  ▸ apply those and publish a new version

     ✓ Fixed all 3 · Published version 4 · Replied to each comment
```

Your reviewers **don't install anything, don't sign up, and don't need an account.** They
click a link and type. That's the whole loop.

## Why people like it

| | |
|---|---|
| 🔗 **Links, not deployments** | One command turns a local `.html` into a URL. No server, no branch, no build. |
| 👥 **Reviewers need nothing** | No account, no install, no login. A browser is the only requirement. |
| 🔒 **You stay in control** | Links are revocable, and can carry an expiry date and a passcode. |
| 💬 **Comments come to you** | Your agent reads the feedback and edits the HTML — you never re-type a review. |
| 🕒 **Versions are automatic** | Re-publishing the same file makes v2, v3, v4… with full history. |
| 🤖 **Works in three agents** | One skill for Copilot CLI, Claude Code, and Codex. |

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

Then open the **ChatGPT desktop app → Plugins**, pick the **Artifacts Beam** marketplace,
and enable `artifacts-beam`.

> `artifacts-beam` is the plugin; `artibeam` is the marketplace it ships in — hence
> `artifacts-beam@artibeam`.

### First run

Sign in once with a personal **Microsoft** or **Google** account at
[artibeam.ai](https://artibeam.ai), then hand the session to the skill — just say
*"log in to artifacts beam"* and it walks you through it. Takes about a minute, and it
renews itself from then on.

Full walkthrough:
[`references/auth-setup.md`](plugins/artifacts-beam/skills/artifacts-beam/references/auth-setup.md)

## What you can say

The skill triggers on intent — no commands to memorise:

- *"publish this html to artifacts beam"*
- *"create a share link that expires in 7 days"*
- *"make a comment-only link with a passcode"*
- *"what comments do I have?"*
- *"apply the review feedback and publish a new version"*
- *"reply to that comment and mark it resolved"*
- *"make this artifact public"* · *"tag it dashboard, q3"* · *"revoke that link"*

## How it works

Every action runs through a **zero-dependency** Node helper —
[`abeam.mjs`](plugins/artifacts-beam/skills/artifacts-beam/scripts/abeam.mjs) — built only
on `fetch`/`FormData`/`Blob`. Nothing to `npm install`.

All three agents share exactly one copy of the skill; only a thin per-agent manifest differs.

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

Three marketplace files expose that single plugin folder — `.github/plugin/` (Copilot),
`.claude-plugin/` (Claude), `.agents/plugins/` (Codex).

<details>
<summary><b>The helper's full command surface</b> (the agent calls these for you)</summary>

```
Auth        login · logout · whoami
Artifacts   publish · list · get · versions · content · open
Share links share-create · share-list · share-revoke
Review      comments · reply · comment-state
Privacy     privacy-get · privacy-set · tags-get · tags-set · tags-all
Other       dashboard · delete · delete-version · config
```

</details>

## Requirements

- **Node 18+** — for the helper's built-in `fetch`/`FormData`/`Blob`.
- A browser, once, to sign in.

Your session cookie is stored locally with `0600` permissions and is never committed.

## Privacy

Artifacts you publish are **private by default** — only you can see them until you create a
share link or explicitly make one public. Share links are revocable at any time, and can be
scoped to view-only, given an expiry, or locked behind a passcode.

## Development

```shell
node scripts/validate-plugins.mjs
```

This is the CI gate: it checks that all three manifests agree on name and version, that every
marketplace entry resolves to the plugin folder, and that the skill frontmatter is intact — so
the packaging can't silently drift.

Issues and PRs welcome.

## License

MIT — see [LICENSE](LICENSE).

---

<div align="center">

**[Get started at artibeam.ai →](https://artibeam.ai)**

</div>
