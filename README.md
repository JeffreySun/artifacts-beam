<div align="center">

# Artifacts Beam

**By VertiWorks Labs** (service operator: VertiWorks Labs LLC).

**Your coding agent just built you an HTML page. Now get it reviewed — without deploying anything.**

Publish HTML straight from your agent, approve a link anyone can open, and pull
feedback back into the chat. Codex uses the authenticated remote MCP; Copilot CLI
and Claude Code retain the working local helper.

[![CI](https://github.com/JeffreySun/artifacts-beam/actions/workflows/ci.yml/badge.svg)](https://github.com/JeffreySun/artifacts-beam/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Agents](https://img.shields.io/badge/agents-Copilot%20CLI%20%7C%20Claude%20Code%20%7C%20Codex-0866c6)](#install)

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
     ▸ Approve public sharing in your browser
     ✓ Share link (comment): https://artibeam.ai/s/example-capability

        …teammates open it in a browser and leave comments…

you  ▸ what feedback did I get?

     3 open comments:
     • "Revenue chart y-axis should start at zero"
     • "Can the date filter default to last 30 days?"
     • "Typo in the footer — 'Analitics'"

you  ▸ apply those and publish a new version

     ✓ Applied the selected feedback · Published version 4 · Returned display link
```

**Viewing a share link needs no account or installation. Reviewers sign in to leave
comments.** Workspace access and sharing policies still apply.

## Why people like it

| | |
|---|---|
| 🔗 **Links, not deployments** | One command turns a local `.html` into a URL. No server, no branch, no build. |
| 👥 **Easy to review** | Open share links anonymously; sign in to comment. No reviewer plugin installation. |
| 🔒 **You stay in control** | MCP sharing requires browser approval and expiry; website/helper links also support passcodes. |
| 💬 **Comments come to you** | Your agent reads the feedback and edits the HTML — you never re-type a review. |
| 🕒 **Versioned updates** | Publish to an explicit artifact against its captured base; retention still applies. |
| 🤖 **Works in three agents** | One skill for Copilot CLI, Claude Code, and Codex. |
| **Workspace-aware updates** | Choose the destination, target an existing artifact, and refuse stale review-based updates. |

## Install

### GitHub Copilot CLI

```shell
copilot plugin marketplace add JeffreySun/artifacts-beam
copilot plugin install artifacts-beam@artibeam
```

### Claude Code

```shell
claude plugin marketplace add JeffreySun/artifacts-beam
claude plugin install artifacts-beam@artibeam
```

Equivalent `/plugin` commands work inside a Claude session; confirm installation
in the details panel when prompted.

### OpenAI Codex / ChatGPT desktop

```shell
codex plugin marketplace add JeffreySun/artifacts-beam
codex plugin add artifacts-beam@artibeam
```

Adding the marketplace only makes the plugin *available* — the second command installs it.
You can also enable it from the **ChatGPT desktop app → Plugins**.
Codex 0.145.0 discovers the bundled remote server at `https://artibeam.ai/mcp`
with its registered public OAuth client. Connect through the host's browser flow
and choose one workspace. The remote workflow needs no local executor.
The generated OpenAI ZIP uses the separate hosted OAuth configuration and is
prepared for **With MCP** submission; this is not a claim of directory approval.

> `artifacts-beam` is the plugin; `artibeam` is the marketplace it ships in — hence
> `artifacts-beam@artibeam`.

### First run with MCP

Connect Artifacts Beam through the host's OAuth flow, then let the agent call
`get_profile`. Check the connected account/workspace before a mutation. Owners or
company administrators may need to opt the workspace into external AI access.
If the host cannot automatically request write/share permissions, reconnect with
the required scopes; never switch credentials to bypass a denial.

See [the MCP workflow](plugins/artifacts-beam/skills/artifacts-beam/references/mcp-workflow.md)
for the nine tools, 128 KiB complete-HTML limit, exact-base updates and public-share
approval. A real signed-in host connection still needs user consent.

### First run with the local helper

Just say *"log in to artifacts beam"*. Your browser opens, you sign in with an enabled
**Microsoft**, **Google**, or **Apple** account, and you're done — nothing to copy, nothing to
paste. The device credential refreshes automatically.

Working over SSH or in a container? It switches automatically to a short code you approve on
any device with a browser.

Full walkthrough:
[`references/auth-setup.md`](plugins/artifacts-beam/skills/artifacts-beam/references/auth-setup.md)

## What you can say

The skill triggers on intent — no commands to memorise. MCP supports publishing,
bounded feedback and public-share management; replies, visibility/tags, passcodes
and other extended operations remain website/local-helper workflows:

- *"publish this html to artifacts beam"*
- *"create a share link that expires in 7 days"*
- *"make a comment-only link with a passcode"*
- *"what comments do I have?"*
- *"apply the review feedback and publish a new version"*
- *"reply to that comment and mark it resolved"*
- *"make this artifact public"* · *"tag it dashboard, q3"* · *"revoke that link"*
- *"switch to my team's workspace"* · *"pin this share link to version 3"*
- *"compare versions 3 and 4"* · *"include the annotations in the review"*

An upload is not the same as making a public live page. Legacy `public` visibility
means **unlisted/link access**, not a global gallery. Private drafts, materials,
formal review requests, live-page publication, administration, and billing remain
application-managed; the helper does not invoke metered server AI.

## How it works

The MCP workflow uses nine bounded tools on the existing Artifacts Beam service.
The retained local integration uses a **zero-dependency** Node helper —
[`abeam.mjs`](plugins/artifacts-beam/skills/artifacts-beam/scripts/abeam.mjs) — built only
on `fetch`/`FormData`/`Blob`. Nothing to `npm install`.

All three agents share exactly one copy of the skill; only a thin per-agent manifest differs.

```
plugins/artifacts-beam/
├── plugin.json                     # portable Agent Plugins manifest (Copilot)
├── .claude-plugin/plugin.json      # Claude Code manifest
├── .codex-plugin/plugin.json       # Codex manifest
├── .codex-plugin/mcp.json          # native Codex OAuth connection
├── .codex-plugin/openai-mcp.json   # hosted OpenAI connection input
├── assets/icon.svg                # first-party listing/composer icon
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
Auth        login [--provider microsoft|google|apple] [--device] · logout · whoami
Workspace   workspaces · workspace-use
Artifacts   publish [--spec id | --new] [--review-packet json] · list · get · versions · diff · content · open
Share links share-create · share-list · share-revoke
Review      review-packet · comments · annotations · reply · comment-state
Privacy     privacy-get · privacy-set · tags-get · tags-set · tags-all
Other       dashboard · delete · delete-version · config
```

</details>

## Requirements

- **MCP:** a compatible host and browser-managed OAuth; no local runtime.
- **Local helper:** Node 18+ for built-in `fetch`/`FormData`/`Blob`.
- A browser, once, to sign in — on the same machine, or any other one if you use `--device`.

The runtime supports Windows and macOS. CI runs helper/authentication checks
natively on Windows, macOS, and Linux. The Windows browser-launch regression
uses the real PowerShell parser and a loopback sign-in fixture, substituting only
the GUI browser action; it does not sign in to a real account.

The local helper's device credential is stored with `0600` permissions where POSIX is
supported; Windows uses the user-profile location and OS access controls.
Token values are never committed and can be revoked independently of your browser session.

## Privacy

Artifacts you publish are **private by default** — only you can see them until you create a
share link or explicitly make one public. Share links are revocable at any time, and can be
scoped to view-only, given an expiry, or locked behind a passcode.

## Development

```shell
node scripts/validate-plugins.mjs                    # packaging gate (CI)
node --test scripts/*.test.mjs plugins/artifacts-beam/skills/artifacts-beam/scripts/lib/*.test.mjs
node scripts/validate-marketplaces.mjs                # pinned native clients on PATH
node scripts/package-openai.mjs                      # local upload ZIP; requires Git and zip
```

The native marketplace gate uses Claude Code 2.1.296 and Copilot CLI 1.0.98 in
disposable profiles; these maintainer clients require an appropriate environment
(Node 22+ for the npm Claude validator). CI supplies the pinned tools separately
from the dependency-free plugin runtime and requires native marketplace checks
before packaging.

`validate-plugins.mjs` is the CI gate. It checks that all three manifests agree on name and
version, publisher metadata stays **VertiWorks Labs**, marketplace versions/paths
agree, and native/hosted MCP registrations and cloud-safe skill metadata stay correct.
It also checks current public-listing text limits and bundled icon paths.
`agents/openai.yaml` keeps its separate 25-64 character skill-description limit.

The packager generates an OpenAI-specific portable manifest in
`dist/artifacts-beam-mcp-openai-<version>.zip` for the separate OpenAI plugin
`artifacts-beam-mcp` (display name **Artifacts Beam MCP**). It does not rename the
installed native plugins or replace the Copilot source manifest.
The ZIP includes the hosted MCP declaration, remote-only skill, listing
assets and original license, not local runtime scripts. CI retains it as the
`artifacts-beam-openai` artifact.
The source root manifest uses Agent Plugins 1.0 metadata; its standard `skills/`
directory remains the shared skill source for every wrapper.
Packaging runs on Ubuntu after all three native runtime jobs succeed; Windows
end users do not need the maintainer's `zip` utility.

## OpenAI directory publication

Repository-marketplace installation is **not** an approved public directory
listing. This release prepares a remote MCP upload package; it does
not upload, submit, or publish it.

Create a **new With MCP plugin** for this package. OpenAI does not allow changing
an existing plugin's MCP server list, so do not upload it as a new version of the
original `artifacts-beam` skills-only listing.

Publication must use the **VertiWorks Labs business-verified developer identity**
in the correct OpenAI organization/project, never a personal developer identity.
The personal GitHub repository location does not set the directory publisher.
See the [OpenAI publishing guide](docs/openai-publishing.md) for ownership checks,
build/download instructions, clean-install scenarios, and the remaining portal
review/publication steps.

> One deliberate inconsistency: `agents/openai.yaml` uses snake_case (`display_name`) while the
> `interface` block in `.codex-plugin/plugin.json` uses camelCase (`displayName`). Both are
> correct per the Codex spec — don't "fix" one to match the other.

Issues and PRs welcome.

## Claude and Copilot publishing

The source marketplaces are directly installable; that is not curated approval.
Claude's public directory uses its developer portal and the repository's plugin
path, while the default Awesome Copilot catalog uses an external-plugin issue
with an immutable release revision. Neither is a GitHub App or VSIX upload.
See the [detailed vendor publishing guide](docs/claude-copilot-publishing.md) for
company ownership/roles, native validation, exact source fields, data handling,
review/publish settings, update behavior and remaining human/vendor gates.

Published/canvased results open in **display mode by default**, including after
applying feedback. Review UI is an explicit opt-in, not an automatic consequence
of fetching comments or supplying a review packet.

## License

MIT — see [LICENSE](LICENSE).

---

<div align="center">

**[Get started at artibeam.ai →](https://artibeam.ai)**

</div>
