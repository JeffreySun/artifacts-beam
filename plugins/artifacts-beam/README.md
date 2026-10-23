# artifacts-beam — multi-agent plugin

![Artifacts Beam](assets/icon.svg)

Publisher: **VertiWorks Labs**. The public service is operated by VertiWorks Labs LLC.

This is a **single, self-contained plugin folder** that installs the `artifacts-beam`
skill into three coding agents — **GitHub Copilot CLI**, **Claude Code**, and **OpenAI
Codex / ChatGPT desktop** — from one source of truth. There is exactly one copy of the skill; each agent
reads its own manifest and they all load the same `skills/artifacts-beam/`.

Codex now includes a remote OAuth MCP connection. The shared skill chooses MCP when
its tools are present and otherwise retains the existing local integration for
Copilot CLI and Claude Code; a denied MCP call never falls back to broader credentials.

The skill lets you publish HTML to **Artifacts Beam**, create revocable **share
links** anyone can open without an account, pull reviewer comments back into your chat,
and iterate on the HTML. You sign in once through your browser with an enabled
Microsoft, Google, or Apple provider. Anonymous share-link viewing does not imply
anonymous commenting; reviewers sign in to leave feedback. See
[`skills/artifacts-beam/SKILL.md`](skills/artifacts-beam/SKILL.md).

## Layout

```
plugins/artifacts-beam/
├── plugin.json                     # portable Agent Plugins manifest (Copilot)
├── .claude-plugin/plugin.json      # Claude Code manifest
├── .codex-plugin/plugin.json       # Codex manifest
├── .codex-plugin/mcp.json          # native Codex registered OAuth client
├── .codex-plugin/openai-mcp.json   # hosted OpenAI package input
├── LICENSE                         # original MIT attribution
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
| Copilot CLI | [Copilot marketplace](https://github.com/JeffreySun/artifacts-beam/blob/main/.github/plugin/marketplace.json) |
| Claude Code | [Claude marketplace](https://github.com/JeffreySun/artifacts-beam/blob/main/.claude-plugin/marketplace.json) |
| Codex | [Codex marketplace](https://github.com/JeffreySun/artifacts-beam/blob/main/.agents/plugins/marketplace.json) |

## Requirements

- **MCP:** a compatible host and browser OAuth; the remote tools need no local executor.
- **Local helper: Node.js 18+** — `scripts/abeam.mjs` uses the built-in global
  `fetch`/`FormData`/`Blob` (zero dependencies).
- A browser, once, to sign in — nothing to copy or paste
  (see [`skills/artifacts-beam/references/auth-setup.md`](skills/artifacts-beam/references/auth-setup.md)).

## Install

### GitHub Copilot CLI

```shell
copilot plugin marketplace add JeffreySun/artifacts-beam
copilot plugin install artifacts-beam@artibeam
```

Manage it with `copilot plugin list`, `copilot plugin update artifacts-beam@artibeam`,
`copilot plugin disable artifacts-beam`, `copilot plugin uninstall artifacts-beam`.
To try it locally without registering a marketplace:

```shell
copilot --plugin-dir ./plugins/artifacts-beam plugin list
copilot plugin install ./plugins/artifacts-beam
```

### Claude Code

```shell
claude plugin marketplace add JeffreySun/artifacts-beam
claude plugin install artifacts-beam@artibeam
claude plugin list
```

Plugin skills are namespaced, so the skill is invocable as
`/artifacts-beam:artifacts-beam` (Claude can also trigger it automatically from
matching intent). In-session `/plugin` commands also work; an install command can
open the details panel where you confirm installation. Update with
`claude plugin update artifacts-beam@artibeam`.

### OpenAI Codex

```shell
codex plugin marketplace add JeffreySun/artifacts-beam
codex plugin add artifacts-beam@artibeam
```

Adding the marketplace only makes the plugin *available*; the second command installs it.
You can also install/enable it from the **ChatGPT desktop app → Plugins**. Codex activates
the skill implicitly on matching intent, or explicitly via `$artifacts-beam`.
The native configuration uses `oauth.clientId: artifacts-beam-codex-cli`.
The OpenAI upload package instead includes a hosted connection with the registered
`artifacts-beam-openai` client and a remote-only skill. A source installation,
production endpoint, and public directory approval are separate milestones.

For local development you can skip the marketplace entirely — Codex also discovers
skills dropped into `.agents/skills`:

```shell
# from a repo where you want the skill available, or into your user scope:
bash plugins/artifacts-beam/skills/artifacts-beam/scripts/install-skill.sh
#   → installs to ~/.agents/skills/artifacts-beam (Codex user-scope path)
# Windows:
#   pwsh plugins/artifacts-beam/skills/artifacts-beam/scripts/install-skill.ps1
```

## MCP connection

Use the host-managed OAuth connection, then `get_profile` to confirm identity.
Mutations carry its stable ID as `expectedProfileId`. Scope upgrades must retain
that profile and the exact operation intent. Public sharing returns an approval
URL first; only the user can approve it in the browser.
See [the complete MCP workflow](skills/artifacts-beam/references/mcp-workflow.md).

## Local-helper sign-in

Your browser opens, you sign in with an enabled Microsoft, Google, or Apple provider,
and the terminal is signed in. Nothing to copy, nothing to paste.

```shell
node plugins/artifacts-beam/skills/artifacts-beam/scripts/abeam.mjs login
node plugins/artifacts-beam/skills/artifacts-beam/scripts/abeam.mjs whoami
```

The session is stored per site at `~/.artifactsbeam/session.json`, with mode 600
where POSIX permissions are supported. Windows uses the user-profile location and
OS access controls. Token values are never printed or committed. Full walkthrough:
[`skills/artifacts-beam/references/auth-setup.md`](skills/artifacts-beam/references/auth-setup.md).

## Display is the default

Publishing, canvasing, ordinary opening, and feedback-driven publication return
the display URL by default. Reading comments or using a review packet does not
select the review UI. Pass `--review` only when the user explicitly asks to open
review mode or the comment panel.

## Execution, permissions, and data handling

The remote MCP is hosted at **https://artibeam.ai/mcp**. It exposes nine scoped
artifact/review/share tools, not a generic API or local shell. It does not run a
model; existing workspace publication-summary policy still applies.

The optional local integration runs the readable, bundled Node helper. There is no
runtime package install, bundled executable, or lifecycle hook.
Browser opening uses the operating system's opener; on Windows a fixed
PowerShell command receives the URL as child-process environment data.
The host agent can use its own model normally; the helper does not start
metered server-side AI runs.

The helper reads the HTML file the user selected, uploads those bytes, and can
write downloaded HTML or review packets to an explicitly selected output path.
It sends authorized artifact commands, share settings, replies, visibility changes,
and tags to **https://artibeam.ai** by default. An explicitly chosen
`ARTIFACTSBEAM_SITE` or `config --site` override targets another authorized
deployment; credentials remain keyed by the selected site. Review text or HTML
must not choose a new destination or authorize unrelated file access.

Browser/device sign-in uses the service's enabled Microsoft, Google, or Apple
provider and requires the human to complete authentication/approval. The helper
stores the resulting device-scoped access/refresh credentials locally, refreshes
them when permitted, and sends the selected site's bearer credential only to that
site. It does not ask users to paste passwords, cookies, API keys, or MFA secrets.
Account identifiers, display names, workspace memberships, uploaded HTML and
review feedback can contain personal or private data; do not describe this
workflow as collecting no personal data.

The service stores artifacts, retained versions, comments, and sharing records
according to its [privacy policy](https://artibeam.ai/privacy) and
[terms](https://artibeam.ai/terms). Sharing a capability link can permit anonymous
viewing; commenting requires sign-in. The backend enforces membership, grants,
sharing policy, quota, and retention limits. Manage/Edit operations are not
granted merely by signing in. Revoke links or delete only explicitly authorized
data; never work around policy denial by copying content elsewhere.

Claude Code and Copilot CLI are the validated local-execution targets. A skill
loading in Claude chat or Cowork does not prove that its environment has Node,
network access, or working account sign-in. Validate those surfaces separately
before claiming support. The separate OpenAI MCP package is cloud-safe; its actual
host sign-in, scopes and directory approval still require qualification.

For non-sensitive help use [public support issues](https://github.com/JeffreySun/artifacts-beam/issues).
Never post credentials, real private HTML, or share-link secrets there.

## License

[MIT](LICENSE), with the original attribution preserved. Company publisher
metadata does not change copyright history.

## For maintainers

- **Publisher identity:** author/owner/developer metadata is `VertiWorks Labs`,
  while repository URLs remain the real public source location. OpenAI's directory
  name comes from the selected verified business identity, not JSON alone.
- **Local artifact contracts:** the retained helper supports bearer-token workspace
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
  It generates the OpenAI-specific portable manifest from the Codex metadata and
  includes only tracked skill/assets files and the original license.
  It never submits or publishes. Follow the
  [company-owned OpenAI submission guide](https://github.com/JeffreySun/artifacts-beam/blob/main/docs/openai-publishing.md).
- **Claude/Copilot listings:** source marketplace installation is not curated
  approval. Follow the
  [vendor publishing guide](https://github.com/JeffreySun/artifacts-beam/blob/main/docs/claude-copilot-publishing.md)
  for the Claude directory portal and Awesome Copilot external issue route.
