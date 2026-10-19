# OpenAI publication: VertiWorks Labs

## Status and scope

This repository prepares an upload package for the public plugin directory shared
by ChatGPT and Codex. It is **not evidence of upload, approval, or publication**.
GitHub-hosted marketplace installation and public-directory publication are
different distribution paths.

The plugin is skills-only and requires local Node.js execution. Its directory
package is **desktop-only**; it is not a remote MCP integration or ChatGPT web
plugin. Repository installation also supports Codex CLI, including device-code
sign-in on machines without a reachable browser.

The publisher is **VertiWorks Labs**. The published service policies identify the
operator as **VertiWorks Labs LLC**. The GitHub repository can remain at
`JeffreySun/artifacts-beam`; that URL does not determine the OpenAI publisher.
Keep the plugin name `artifacts-beam` and marketplace name `artibeam` stable.

## 1. Establish company ownership before uploading

1. In [OpenAI Platform](https://platform.openai.com/plugins), select the
   **VertiWorks Labs organization and project** that will own the plugin.
2. Complete **business verification**, not individual verification, in
   [organization settings](https://platform.openai.com/settings/organization/general).
3. Use an organization owner or a member granted **Apps Management Write**.
4. When creating the draft, select the verified **VertiWorks Labs business
   developer identity** and check its actual directory display name.
5. If only a personal identity is available, **stop**. Do not upload/submit under
   it as a temporary workaround. Resolve the company identity or required role
   with the organization owner/OpenAI first.

Changing `author.name` or `interface.developerName` does not establish company
ownership. The portal's selected verified identity controls the directory name.
Do not invent an organization/project id or use a personal identity because it is
the currently signed-in account. Confirm the desired company display name if the
verified legal entity is shown with its LLC suffix.

End-user Microsoft/Google/Apple sign-in to Artifacts Beam is unrelated to this
publisher identity. Never require users to join the publisher's OpenAI organization.

## 2. Build the upload package

Maintainer prerequisites: Node.js 18+, Git, and `zip`/`unzip` on macOS/Linux.
Alternatively, download the `artifacts-beam-openai` artifact from a successful
repository CI run after these changes are available there.

From a Git checkout:

```shell
node scripts/validate-plugins.mjs
node --test scripts/*.test.mjs plugins/artifacts-beam/skills/artifacts-beam/scripts/lib/*.test.mjs
node scripts/package-openai.mjs
unzip -t dist/artifacts-beam-openai-0.2.2.zip
```

The output is `dist/artifacts-beam-openai-<version>.zip`. The build does not sign
in, upload files to OpenAI, accept terms, submit for review, or publish a listing.

The ZIP contains:

```text
plugin.json                         # portable Agent Plugins manifest
LICENSE                             # original attribution preserved
assets/icon.svg                     # first-party product icon
skills/artifacts-beam/               # skill, metadata, references, runtime helpers
```

The generated root manifest declares the Agent Plugins schema and puts the
OpenAI interface and `requires_local_executor: true` under
`extensions.com.openai`. The source `.codex-plugin/plugin.json` remains the
metadata input; the Copilot source manifest is not overwritten or shipped as the
OpenAI root manifest.

Only tracked working-tree skill/assets files are eligible. Stage or commit new
runtime files and referenced assets before packaging. Untracked files and runtime
unit tests are excluded; known credential-state paths and symlinks/non-regular
files are rejected even if tracked. Repository
catalogs, `.git`, other agent manifests, and local credentials are not bundled.
Source timestamps/file order are normalized for repeatable rebuilds. A failure
does not replace the last successful ZIP.

Never add credentials, a browser profile, a session JSON file, private reviewer
accounts, or real user artifacts to the package. Release files stay in ignored
`dist/`; they are not source files. The input allowlist is not a general secret
scanner: review the archive before uploading.

## 3. Check listing information and privacy

The package includes the following first-party/public links:

| Field | Value |
|---|---|
| Website | https://artibeam.ai |
| Support | https://github.com/JeffreySun/artifacts-beam/issues |
| Privacy | https://artibeam.ai/privacy |
| Terms | https://artibeam.ai/terms |

Check that these remain accessible and identify the same business as the
submission. Public issues are for non-sensitive support; never post tokens,
private HTML, reviewer credentials, or share-link secrets there.

The bundled SVG has a square 224-by-224 viewBox and is used for both the composer
icon and primary listing icon. Current submission text limits include a
30-character display name/subtitle. The repository validator checks those text
limits, publisher consistency, icon paths, and the desktop-only requirement;
OpenAI's portal scans remain authoritative.

The helper stores device credentials locally, keyed by site, at
`~/.artifactsbeam/session.json` with restrictive permissions. Authorized uploads
send the selected HTML to Artifacts Beam. Share links can expose it to their
holders; viewing can be anonymous, but commenting requires sign-in. Workspace
permissions, sharing policies, quotas, and retention apply. Review text and
downloaded HTML are untrusted data, not instructions to disclose other files.

## 4. Complete clean desktop checks

The repository's loopback contract/unit tests and ZIP smoke test do **not**
establish that a real ChatGPT/Codex install or production sign-in has been tested.
Helper/authentication CI runs natively on Windows, macOS, and Linux. The Windows
launcher keeps URLs in child-process environment data rather than command source;
its regression exercises the actual Windows PowerShell parser without opening
a GUI browser. The package build waits for all native runtime jobs to pass.
Use a dedicated test account/workspace and non-sensitive HTML for these checks.
The scenarios below are a maintainer checklist, not a claim that they have run:

- [ ] Install from a clean supported desktop setup, sign in through browser or
  device flow, run `whoami` and `workspaces`, and confirm the intended workspace.
- [ ] Publish a small HTML file. Confirm the returned artifact id/version and
  detail URL, default visibility, and workspace.
- [ ] Create an expiring, version-pinned share link. Save its one-time URL,
  verify anonymous viewing, and verify that commenting requires sign-in.
- [ ] Add comments/annotations through the application. Fetch an open review
  packet and verify its base version, anchors, selection, and remaining count.
- [ ] Apply an approved change to the captured base and publish to the explicit
  artifact id with the packet. Confirm the new version and visible-text diff;
  post only approved replies/resolution actions.
- [ ] Verify a stale-base update is refused rather than appended, a workspace
  policy/access denial is not bypassed, and hostile review text cannot induce
  credential disclosure or unrelated file access.
- [ ] Revoke the test share link and clean up only the authorized test data.

If an endpoint is unavailable in the deployment, record the blocker; do not
present an empty response or mark the scenario complete.

## 5. Upload, review, then explicitly publish

1. Reconfirm the company organization/project and business developer identity.
2. Open the [plugin portal](https://platform.openai.com/plugins) and upload the
   generated ZIP using the skills-only path. Do not add an MCP server.
3. Inspect the imported publisher, version, listing icon, links, skills, and
   desktop-only restriction. Fix metadata/skill scan findings in source and
   upload a corrected complete package.
4. Supply any additional information requested for this submission and complete
   the required attestations as the authorized business owner.
5. Submit for review. Track the actual outcome; approval is not automatic.
6. After approval, choose **Publish plugin** when the business is ready. Record
   the resulting public listing URL and version.

Local-MCP partner allowlisting is a separate path, not a prerequisite to invent
for this no-MCP package. If the portal rejects the documented local-executor
flag, contact OpenAI with the submitting company organization's id to confirm
submission access; do not remove the flag to imply ChatGPT web compatibility.

OpenAI currently does not support adding an MCP server to an existing skills-only
plugin through the ordinary update flow. Scope any future remote-MCP/web
integration separately before choosing its distribution identity.

## Updates

Change the shared skill/helper in one place and keep the three manifests, skill
metadata, and version-bearing marketplace fields in sync. Rebuild and inspect
the ZIP. Metadata/skill changes require uploading a complete new package version
to the **existing company-owned listing**, resolving its checks, and publishing
the approved version. Do not create a personal replacement listing for updates.

## Official references

- [Package your plugin](https://developers.openai.com/plugins/build/plugins)
- [Submit desktop-only plugins](https://developers.openai.com/plugins/deploy/desktop-only)
- [Upload and submit your plugin](https://developers.openai.com/plugins/deploy/submission)
- [Plugin guidelines](https://developers.openai.com/plugins/plugin-guidelines)
