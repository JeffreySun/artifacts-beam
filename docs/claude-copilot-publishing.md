# Publish Artifacts Beam to Claude and GitHub Copilot

Publisher metadata: **VertiWorks Labs**. Legal service operator: **VertiWorks Labs LLC**.
Plugin id: `artifacts-beam`. Repository marketplace id: `artibeam`.
Prepared release: **0.2.3**.

This is a skills-only plugin with a readable, dependency-free Node helper.
Publishing/canvasing opens **display mode by default**, including after applying
feedback. Only an explicit request to open review mode or the comment panel
selects `--review`. A review packet is a publication precondition, not a UI mode.

## Choose the actual distribution route

| Goal | Route | What it does not establish |
|---|---|---|
| Let users install from our repository in Claude Code | Public `.claude-plugin/marketplace.json` plus install commands | Anthropic directory or official partner-marketplace approval |
| List in the public Claude directory / Claude Marketplace | Developer portal at https://claude.ai/directory/manage | An automatic listing in the separate `claude-plugins-official` partner marketplace |
| Let users install from our repository in Copilot CLI | Public `.github/plugin/marketplace.json` plus install commands | Inclusion in a built-in curated catalog |
| Reach the default Awesome Copilot catalog | Its **external plugin submission issue form**, immutable GitHub source, maintainer review and automation | Automatic acceptance or permission to edit its external registry directly |

Do not use GitHub Marketplace's GitHub App flow, a VSIX upload, or retired
Copilot Extensions instructions for this CLI plugin. Agent Plugins can also be
surfaced in VS Code; this is not a VS Code extension package, and IDE end-to-end
behavior must be checked separately.

## Package layout and metadata

The submitted plugin folder is **`plugins/artifacts-beam`**, not the repository
root. It contains the portable root manifest for Copilot, the Claude/Codex
overlays, one shared skill, readable helpers/references, the first-party icon,
plugin README, and the original MIT notice. All runtime files stay inside it.

Claude's manifest declares `displayName`, `icon`, `documentationUrl`, `supportUrl`,
`privacyPolicyUrl`, and `termsOfServiceUrl`. Those directory fields are recognized
without warnings by Claude Code 2.1.281+; the pinned native validator is 2.1.296.
The Copilot root selects Agent Plugins 1.0, where `skills/` is the fixed portable
skill location rather than a configurable top-level `skills` field.

Do not rename the plugin/marketplace to a vendor-reserved or "official" name.
Company metadata does not confer a vendor Verified badge or replace listing
ownership/permission checks.

## Validate the release before submission

From the repository:

```shell
node scripts/validate-plugins.mjs
node --test scripts/*.test.mjs plugins/artifacts-beam/skills/artifacts-beam/scripts/lib/*.test.mjs
node scripts/validate-marketplaces.mjs
```

The native gate requires **Claude Code 2.1.296** and **Copilot CLI 1.0.98**
on PATH. These are maintainer tools, not plugin runtime dependencies. The npm
Claude validator requires Node 22+; the helper's own minimum remains Node 18+.
CI installs exact client versions in a temporary tool prefix and uses Node 22
for this gate.

The gate uses disposable HOME/Claude-config/Copilot-home directories, strips
vendor credential variables, runs only resource commands, and checks:

- Strict native Claude plugin and marketplace validation.
- Actual local marketplace registration and plugin installation.
- Enabled candidate version and exactly one Claude skill, with no agent,
  hook, MCP, or LSP component.
- Actual Copilot plugin and skill inventory from the candidate source path,
  not an operator's previously installed copy or upstream main.

Native Windows/macOS/Linux helper/authentication jobs are retained. Packaging
waits for those runtime jobs and the native marketplace job. No model session,
vendor login, legal attestation, or vendor-directory submission is part of CI.

The helper and native install checks do not prove real GUI/provider sign-in,
all Claude chat/Cowork execution environments, portal eligibility, name
availability, a security-review outcome, or vendor acceptance.

## Claude: publish our repository marketplace

Once this release is on public main, users can install it without a directory
application:

```shell
claude plugin marketplace add JeffreySun/artifacts-beam
claude plugin install artifacts-beam@artibeam
claude plugin list --json
claude plugin details artifacts-beam
```

The details should show Artifacts Beam at the intended version and
`Skills (1) artifacts-beam`. In a new session, invoke
`/artifacts-beam:artifacts-beam` or express the Artifacts Beam intent.

Equivalent `/plugin` commands work inside a Claude session; current in-session
install commands can open the plugin details panel, where the user confirms
installation.

Update the source-marketplace plugin with:

```shell
claude plugin update artifacts-beam@artibeam
```

Our version field pins installed releases, so raise it on each release. A commit
without a version change is not enough to update a cached source-marketplace
installation. Auto-update for our own marketplace is off unless the user enables it.

## Claude: submit to the public directory

### 1. Select the long-term owning Claude organization

Open https://claude.ai/directory/manage in the organization that should own
the listing long term. **The first organization submitting this repository
folder holds its listing.** Do not test submission under an individual context
if the business should own it.

Current eligibility:

- A paid Pro, Max, Team, or Enterprise plan; Free cannot submit.
- On Pro/Max, submission is from the individual's account.
- On Team/Enterprise, an Owner can submit.
- An Enterprise Owner can also grant **Directory** permission using a custom
  role under Organization settings > Roles.

For company-governed ownership, use the intended company Claude organization
and an authorized individual operator. Do not assume that an OpenAI Platform
organization, OpenAI business verification, or Apps Management Write role applies
to Claude; these are separate vendor systems.

### 2. Connect the authorized GitHub account in that organization

Connect the GitHub account that can **push** to `JeffreySun/artifacts-beam`.
The connection must be in the same Claude organization making the submission;
a connection in another organization does not carry over.

Public-repository validation can succeed before this permission check is
complete, so a successful Validate button alone does not prove submission access.
The existing personal GitHub namespace is not the directory's owning organization.

### 3. Create a Plugin bundle submission

Select **Submit new**, then **Plugin bundle**, not MCP connector.
On **Source**, enter:

| Field | Value |
|---|---|
| Repository | `JeffreySun/artifacts-beam` or its GitHub URL |
| Plugin path | `plugins/artifacts-beam` |
| Branch/tag | `main`, or an intentionally selected release tag |

The portal supports this subdirectory layout. No ZIP upload is required for
this official source-based submission route. ZIP uploads in Customize > Plugins
are a different install/test path, not directory publication.

Choose the repository/folder carefully: they cannot be changed on an existing
submission. The tracked branch/tag can be changed later using its Settings.

### 4. Validate the source commit and inspect listing details

Select **Validate**. Fix every Blocking finding in source, push, and select
**Re-validate**. A report applies to one commit, so re-validate after any new push.
Policy holds are not the same as rejection; read all warnings and holds.

Inspect the name, author/publisher information, icon, README description and
documentation/support/privacy/terms links. The README discloses local execution,
credential storage and first-party data destinations; do not claim no personal
data is read or stored.

### 5. Answer Data handling and Compliance truthfully

Use the actual implementation and service policy, not generic "skills-only"
answers:

| Topic | Implementation facts to consider |
|---|---|
| Reads/writes | Selected local HTML, explicitly selected output files, account/workspace identifiers and review feedback |
| Local credentials | Explicit browser/device authorization creates per-site device access/refresh credentials; never collect arbitrary machine secrets |
| Outbound services | Default first-party REST service is https://artibeam.ai; overrides require an explicitly authorized deployment |
| Identity providers | User completes enabled Microsoft/Google/Apple sign-in in the browser; no password/MFA code is pasted into the plugin |
| Personal data | Account email/display data, HTML and feedback can contain personal/private information |
| Retention/deletion | Follow https://artibeam.ai/privacy and the actual service/plan behavior; do not invent retention periods |
| Under-18 audience | Owner must review the service age policy and actual intended audience, not auto-fill an assumption |

Confirm a reachable business contact email and read the four compliance
acknowledgements. The authorized owner must make those attestations. Credentials
or private test material do not belong in the plugin or public issues.

### 6. Submit, follow scans and choose updates

On **Review and submit**, confirm the company context and source details.
Choose **GitHub push webhook** or **Scheduled check only**; scheduled checks
also occur with either choice. A webhook setup requires GitHub repository admin
access and explicit authorization; CI does not install it.

Select **Submit for review**. The directory checks each tracked commit and runs
its security scan. Use Versions and Review to inspect results; apply Requested
changes. A rejected submission needs **Resubmit for review**; other source fixes
can use **Check for new commits**.

Do not create duplicate submissions: the organization has one submission per
repository/folder and a limit of 10 submissions per 24 hours, including saved
drafts and withdrawn entries.

### 7. Request publication after the version passes

Select **Publish** for the passing version. **By default this requests an
Anthropic reviewer to publish it**, not an immediate self-service go-live.
The portal's Overview shows the publish setting Anthropic applied: reviewer
every version, reviewer first version, or owner publishes first version.

Auto-publish behavior depends on that setting and the owner's toggle. Do not
promise automatic publication, a Verified badge or a fixed review time. Record
the actual company listing URL and verify on supported client surfaces.

### Separate partner marketplace

The public directory/Claude Marketplace portal is not the same as
`anthropics/claude-plugins-official`. Current Claude Code documentation directs
official-marketplace listing questions through an Anthropic partner contact.
Do not assume the directory portal or an old README/Console form creates that
separate listing.

## Copilot: publish our source marketplace

Public main already provides the marketplace mechanism:

```shell
copilot plugin marketplace add JeffreySun/artifacts-beam
copilot plugin install artifacts-beam@artibeam
copilot plugin list --json
copilot skill list --json
```

The candidate plugin should be enabled at the expected version, and the skill
inventory should contain the plugin-sourced `artifacts-beam` skill.
For an existing source-marketplace installation:

```shell
copilot plugin marketplace update artibeam
copilot plugin update artifacts-beam@artibeam
```

Path-sourced plugins from a local directory marketplace can load live; hosted
marketplaces use cached copies. Confirm the source and version rather than
assuming an old installed copy reflects a new commit.

## Copilot: apply to the default Awesome Copilot catalog

### 1. Choose an immutable, validated release revision

`github/awesome-copilot` is the current default catalog. `github/copilot-plugins`
is a separately registered, non-default collection; do not treat the two as the
same catalog.

Use the full 40-character **merged release commit SHA** that passed CI and
contains version 0.2.3, or a deliberately created immutable release tag.
Do not enter `main` or another branch as the immutable review reference.
Confirm the source manifest at that exact revision matches the submitted version.

### 2. Use the external-plugin issue form

Open:

https://github.com/github/awesome-copilot/issues/new?template=external-plugin.yml

**Do not open a PR directly editing `plugins/external.json`.** The external
submission route validates an issue and uses maintainer approval/automation to
prepare the marketplace update. Our own release PR does not approve an upstream listing.

### 3. Fill the source and metadata fields

| Form field | Value |
|---|---|
| Plugin name | `artifacts-beam` |
| Short description | The actual release manifest description |
| GitHub repository | `JeffreySun/artifacts-beam` |
| Plugin path | `plugins/artifacts-beam` |
| Ref to review | Optional immutable tag; leave empty when using SHA alone |
| Commit SHA | Actual full validated merged release SHA, not a placeholder or branch |
| Version | `0.2.3` |
| License | `MIT` |
| Author name | `VertiWorks Labs` |
| Author URL/homepage | `https://artibeam.ai` |
| Keywords | `artifacts-beam, html, review, share-links, comments, publishing, mockup, feedback` |
| Additional notes | Skills-only local Node helper; first-party authorized REST/browser-device auth; display default; data handling disclosed in plugin README |

Check for an existing listing. The owner must confirm the issue form's public
source, immutable reference, contribution/security/responsible-AI policy and
not-already-listed acknowledgements.

This plugin is **not a Copilot canvas extension**. Publishing HTML to Artifacts
Beam when the user says "canvas it" does not make it one. Do not add the `canvas`
keyword: the issue form applies additional preview/logo requirements to actual
canvas extensions.

### 4. Follow maintainer review and verify the generated listing

Watch the issue's automated checks and maintainer requests. Apply source fixes,
ship a new immutable revision and follow the requested update process. A valid
source, installable plugin, or accepted issue is not a guarantee of curation.

After acceptance, verify the catalog actually lists the plugin and its pinned
source. Only then advertise an Awesome Copilot installation path such as
`artifacts-beam@awesome-copilot`; our own marketplace remains
`artifacts-beam@artibeam`. Do not present an unapproved catalog id as installable.

## Remaining human and vendor gates

Native schema/install/skill-inventory validation is automated; manual real-client
provider sign-in, account/org eligibility, name conflicts, security scans, policy
attestations and curated approval are not. Use a dedicated non-sensitive test
account/workspace for the publish/share/comments/annotations/guarded-update flow.
No real vendor login, actual submission or publication is performed by this guide.

Claude directory updates are checked from its tracked source and governed by
its review/publish settings. Copilot source-marketplace updates require a new
version/catalog refresh; curated external pins require the maintainer-approved
immutable update process. Do not carry an OpenAI ZIP-upload procedure over to
these source-based vendor routes.

## Official sources

- https://code.claude.com/docs/en/plugins/publish
- https://code.claude.com/docs/en/plugins/manifest-reference
- https://code.claude.com/docs/en/plugins/marketplace-reference
- https://claude.com/docs/plugins/submit
- https://claude.com/docs/plugins/pre-submission-checklist
- https://claude.com/docs/directory/publish
- https://claude.com/docs/plugins/platform-support
- https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/plugins-marketplace
- https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-plugin-reference
- https://github.com/github/awesome-copilot/blob/main/CONTRIBUTING.md
- https://github.com/github/awesome-copilot/blob/main/.github/ISSUE_TEMPLATE/external-plugin.yml
