# OpenAI MCP publication: VertiWorks Labs

## Status

The separate **Artifacts Beam MCP** plugin (`artifacts-beam-mcp`), version 0.3.0,
includes the authenticated remote endpoint
**https://artibeam.ai/mcp** and a cloud-safe skill. It is prepared for **With MCP**,
not the skills-only/desktop-only intake path. Package generation does not upload,
submit, approve, or publish a directory listing.

The service operator is **VertiWorks Labs LLC**. Select the verified **VertiWorks
Labs business Developer identity** and the intended company organization/project.
An organization owner or Apps Management Write role is required. Manifest author
text does not establish that verified identity. Never use a personal identity as
a temporary substitute or include private reviewer credentials in the ZIP.

OpenAI does not support adding, removing or replacing MCP servers on an existing
plugin. The original `artifacts-beam` skills-only listing therefore cannot accept
the MCP package as an update. The exporter now uses the distinct name
`artifacts-beam-mcp` and display name `Artifacts Beam MCP`, with no inherited listing
ID. Installed Codex/Claude/Copilot plugin identities and the service's MCP server
name, endpoint and OAuth registration remain unchanged.

If the portal reports **"Create a new plugin to change MCP servers"**, leave the
existing plugin's update screen and start a **new With MCP plugin** from the
Plugins overview. Upload the newly named ZIP below. Renaming only a ZIP file or
increasing its version cannot change an existing listing's server list.

## Build

Maintainer tools: Node.js 18+, Git, and `zip`/`unzip` on macOS/Linux. Alternatively,
download `artifacts-beam-openai` from a successful repository CI run.

```shell
node scripts/validate-plugins.mjs
node --test scripts/openai-package.test.mjs
node scripts/package-openai.mjs
unzip -t dist/artifacts-beam-mcp-openai-0.3.0.zip
```

Stage/commit new package inputs first: only tracked files are eligible.

```text
plugin.json
mcp.json
LICENSE
assets/icon.svg
skills/artifacts-beam/SKILL.md
skills/artifacts-beam/agents/openai.yaml
```

The exported skill comes from the shared `references/mcp-workflow.md`; the ZIP
does not contain local scripts, auth-state files, legacy command references, agent
wrappers or tests. `requires_local_executor: false` is under
`plugin.json.extensions.com.openai`. Rebuilds are deterministic; failed validation
does not replace the last good ZIP. Symlinks and tracked credential-state paths
are rejected, but this allowlist is not a general secret scanner.

## Distinct native and hosted configurations

| Host | Source file | Public OAuth client |
|---|---|---|
| Codex CLI 0.145.0 | `.codex-plugin/mcp.json` | `artifacts-beam-codex-cli` |
| OpenAI submission / hosted connection | `.codex-plugin/openai-mcp.json`, exported as `mcp.json` | `artifacts-beam-openai` |

Native Codex consumes `oauth.clientId` and `type: "http"`. Its callback is
`http://127.0.0.1:<port>/callback/r32a3R4JT8g_` for the canonical endpoint.
The native source manifest explicitly references the configuration; no root
`.mcp.json` is added that could silently change Claude/Copilot behavior.

The hosted file declares `type: "streamable-http"` and
`extensions.com.openai.auth`: OAuth, provided client, `tokenEndpointAuthMethod:
"none"`, MCP resource, and read/offline initial scopes. This is OpenAI's documented
server-level authentication extension, not a claim that the unextended Agent
Plugins MCP schema accepts arbitrary extra server properties. Endpoint overrides
are omitted because discovery provides them.

Client IDs are public identifiers, not secrets or proof of caller identity.
There are no fixed tokens, custom authentication headers, client secrets, user
IDs, workspace IDs, DCR or CIMD configuration in the package.

## Connect and submit

1. Select the company organization/project and verified business identity.
2. Start a **new plugin** through **With MCP** and upload
   `artifacts-beam-mcp-openai-0.3.0.zip`, including MCP in its initial package.
   Do not use **Upload new version** on the original `artifacts-beam` listing.
3. Inspect imported publisher/version, icon, public policy URLs, cloud skill and
   MCP authentication settings. Fix findings in source and upload a complete ZIP.
4. Complete the portal's exact domain challenge at
   `https://<approved-host>/.well-known/openai-apps-challenge`. Do not invent its
   token or replace another plugin's challenge.
5. Connect the MCP server and complete the real account/workspace OAuth flow.
   Read access is initial; write/share actions require their additional scopes.
   If the host cannot automatically upgrade permissions, reconnect explicitly.
6. Scan tools and confirm the nine operations and their safety annotations.
7. Supply a dedicated reviewer account/workspace with synthetic data, five
   positive and three negative cases, an accessible walkthrough and release notes.
   Credentials belong only in the portal. Run those cases before marking them done.
8. Complete attestations and submit. Only after approval choose **Publish plugin**.

The publisher identity and end user's Artifacts Beam Microsoft/Google/Apple or
company sign-in are separate. Do not make users join the publisher's organization.

## Qualification checklist

Repository tests establish packaging, existing cross-platform helper behavior and
metadata safety. Native Codex `plugin/read` has discovered the candidate's MCP and
skill in an isolated profile; that is not a signed-in tool-execution test.
Production HTTPS health, OAuth discovery and rejection boundaries have been checked.
A real user's production OAuth grant was not synthesized or approved by automation.

- [ ] Connect a dedicated reviewer through the actual host and confirm `get_profile`.
- [ ] Publish a small private HTML artifact; inspect the committed display URL.
- [ ] Request a commentable expiring share, complete browser approval as the user,
  retry the same intent/key, and verify anonymous viewing plus signed-in commenting.
- [ ] Capture review feedback, inspect remaining counts, read the exact base,
  and publish an approved update without switching profile or dropping the base.
- [ ] Verify scope upgrades, account switching, stale bases, revoked links,
  policy denials, and malicious embedded instructions fail safely.
- [ ] Verify actual target-platform connection behavior on macOS and Windows where supported.
- [ ] Inspect the exported ZIP and complete the portal's scans and company identity checks.

The remote interface is bounded: 128 KiB complete UTF-8 HTML, paged discovery/link
metadata, and bounded review packets. It does not expose private drafts, materials,
admin APIs, generic HTTP/shell access, visibility/tag/grant changes, comment mutation
or AI authoring. Existing configured publication summaries and retention still apply.

MCP-created links require browser approval and immutable pins. MCP link lists omit
secret URLs; the website/helper may recover authorized URLs from encrypted storage.
Do not describe all service links as one-time-only.

## Updates and references

Keep the source manifests, marketplace versions and both skill metadata headers
consistent. Rebuild for metadata/skill changes. Hosted tool changes require the
portal's rescan/review process; source installation does not imply public approval.
After the new `artifacts-beam-mcp` listing exists, preserve that identity and its
server list for future updates. Never copy the original plugin's portal ID into it.

- [Package and MCP authentication](https://developers.openai.com/plugins/build/plugins)
- [Submission, domain verification and review](https://developers.openai.com/plugins/deploy/submission)
- [Plugin guidelines](https://developers.openai.com/plugins/plugin-guidelines)
- [Service](https://artibeam.ai), [privacy](https://artibeam.ai/privacy), [terms](https://artibeam.ai/terms)
- [Non-sensitive support](https://github.com/JeffreySun/artifacts-beam/issues)
