# OpenAI MCP publication: VertiWorks Labs

## Status

The original **Artifacts Beam** plugin (`artifacts-beam`), version 0.3.0,
includes the authenticated remote endpoint
**https://artibeam.ai/mcp** and a cloud-safe skill. It is prepared for **With MCP**,
not the skills-only/desktop-only intake path. Package generation does not upload,
submit, approve, or publish a directory listing.

The service operator is **VertiWorks Labs LLC**. Select the verified **VertiWorks
Labs business Developer identity** and the intended company organization/project.
An organization owner or Apps Management Write role is required. Manifest author
text does not establish that verified identity. Never use a personal identity as
a temporary substitute or include private reviewer credentials in the ZIP.

Upload this metadata correction to the existing **Artifacts Beam** draft that
already includes the remote MCP server. The exporter preserves the original
technical/display name and any assigned source identity; it does not create a
separate MCP-branded plugin. The server name, endpoint, OAuth registration and
bundled skill remain unchanged.

OpenAI does not support adding, removing or replacing MCP servers on an existing
plugin. If it reports **"Create a new plugin to change MCP servers"**, check that
you selected the draft containing this server, not an older skills-only listing.
Renaming a ZIP or increasing its version cannot change that restriction.

## Build

Maintainer tools: Node.js 18+, Git, and `zip`/`unzip` on macOS/Linux. Alternatively,
download `artifacts-beam-openai` from a successful repository CI run.

```shell
node scripts/validate-plugins.mjs
node --test scripts/openai-package.test.mjs
node scripts/package-openai.mjs
unzip -t dist/artifacts-beam-openai-0.3.0.zip
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

## Testing through ChatGPT's local plugin installer

The default `artifacts-beam-openai-<version>.zip` is the **submission** package.
It declares a remote server, but it does not contain a registered ChatGPT app
binding. In the local upload we investigated, ChatGPT preserved the server and
OAuth declaration and displayed **MCP servers: 1**, while the installed release
had no app bindings. Its Manage panel therefore exposed only skill controls, and
the conversation could load the skill without getting `get_profile` or other tools.
The component count is not proof of a connected, discovered MCP tool catalog.

For the [documented local MCP workflow](https://developers.openai.com/plugins/build/plugins#create-and-test-a-plugin-locally-with-an-mcp-server),
register the server connection in ChatGPT first, then bind the existing plugin
to that actual connection. This is private test setup, not another public listing:

1. In **ChatGPT → Plugins → Add → Add custom MCP server**, enter
   `https://artibeam.ai/mcp` and select OAuth.
2. In **Advanced OAuth settings**, select the user-defined/predefined client,
   client ID `artifacts-beam-openai`, and token endpoint auth method `none`.
   Leave the client secret blank. Use `artifacts:read` and `offline_access` as
   base scopes. Discovery supplies the authorization and token endpoints.
   Do not select DCR or CIMD; this service uses a predefined client.
3. Review the risk warning yourself, create the connection, and complete the
   website sign-in/workspace consent. If setup fails, resolve the actual error;
   do not disable authentication or invent connection details.
4. Copy the created connection's `plugin_asdk_app_...` ID from its ChatGPT URL,
   or its `asdk_app_...` app ID. This is **not** the OAuth client ID
   `artifacts-beam-openai` or the local ZIP plugin's `Plugin_...` ID.
5. Build the local-test ZIP with that ID:

   ```shell
   node scripts/package-openai.mjs --chatgpt-app-id "$CHATGPT_APP_ID"
   ```

6. Upload `dist/artifacts-beam-chatgpt-local-<version>.zip` as a new version of
   the existing locally installed Artifacts Beam plugin. Start a new conversation
   and confirm a real `get_profile` call before attempting publication. Complete
   additional write/share consent only when the requested actions require it.

The local export keeps the same `artifacts-beam` name, display name, version,
skill and release notes. It omits directory review metadata: plugin-level
`review.test_cases` requires a bundled MCP server, not just a registered app
reference, and otherwise causes the local upload to fail validation. All five
positive and three negative cases remain in the default submission package.
The local export replaces root `mcp.json` with `.app.json` and sets
`extensions.com.openai.apps` to `./.app.json`. The mapping names the registered
connection; it does not contain tokens, authorize an account, or change the
native plugin manifests. Access to that private connection is still required.
The `plugin_` URL prefix is normalized to the underlying `asdk_app_` ID.

Never submit this local-test ZIP to the public directory: submission rejects
registered app references. The default build remains separate and unchanged.
The exporter validates the ID's shape, not its existence, ownership, endpoint
or authorization. Do not claim end-to-end readiness until the target ChatGPT
session actually discovers and successfully calls the tools.

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
2. Open the existing **Artifacts Beam** draft containing this MCP server and use
   **Upload plugin to fix issues** or **Upload new version** to upload
   `artifacts-beam-openai-0.3.0.zip`. Do not create a separate MCP-branded listing.
3. Inspect imported publisher/version, icon, public policy URLs, cloud skill and
   MCP authentication settings. Fix findings in source and upload a complete ZIP.
4. Complete the portal's exact domain challenge at
   `https://<approved-host>/.well-known/openai-apps-challenge`. Do not invent its
   token or replace another plugin's challenge.
5. Connect the MCP server and complete the real account/workspace OAuth flow.
   Read access is initial; write/share actions require their additional scopes.
   If the host cannot automatically upgrade permissions, reconnect explicitly.
6. Scan tools and confirm the nine operations and their safety annotations.
7. Check **Review information**: the ZIP imports exactly five positive and three
   negative cases plus release notes. Supply the dedicated demo account/workspace
   through the secure portal form and an accessible walkthrough. Run the cases
   with that account before claiming completion; credentials never belong in the ZIP.
8. Complete attestations and submit. Only after approval choose **Publish plugin**.

The publisher identity and end user's Artifacts Beam Microsoft/Google/Apple or
company sign-in are separate. Do not make users join the publisher's organization.

## Review metadata in the ZIP

Edit `plugins/artifacts-beam/.codex-plugin/plugin.json` under
`extensions.com.openai.review.test_cases`. The exporter copies `review` and
`publication` to the same extension in root `plugin.json`; neither belongs inside
`interface`, and a separate test-case JSON file is not used.

Each case includes `description`, `prompt`, `tools_triggered` and
`expected_behavior`. The five positive cases run in order: private publication,
discovery/read, bounded feedback, exact-base publication, and approved sharing
with listing/revocation. The three negative cases cover unauthorized workspace
access, bypassing browser approval, and forcing a stale-base update.

The cases describe their synthetic data and manual setup; they are procedures,
not execution results. Use the secure review form for account access. No reviewer
credentials, invented artifact IDs, attachment URLs or recording URL are bundled.
Omitting `demo_recording_url`, countries and translations preserves portal values
rather than replacing them. A real accessible walkthrough is still required for
submission; if ZIP-managed, add its actual URL to `review.demo_recording_url`.

The upload format permits partial lists, but initial MCP submission requires
**exactly five positive and three negative cases**. After re-uploading, verify both
read-only lists in the portal; repository validation cannot prove portal acceptance.

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
Preserve the original `artifacts-beam` identity and its server list for future
updates. This correction retains draft version 0.3.0; increment the version for a
new release after publication.

- [Package and MCP authentication](https://developers.openai.com/plugins/build/plugins)
- [Local connection and complete-plugin testing](https://developers.openai.com/plugins/deploy/connect-chatgpt)
- [Submission, domain verification and review](https://developers.openai.com/plugins/deploy/submission)
- [Plugin guidelines](https://developers.openai.com/plugins/plugin-guidelines)
- [Service](https://artibeam.ai), [privacy](https://artibeam.ai/privacy), [terms](https://artibeam.ai/terms)
- [Non-sensitive support](https://github.com/JeffreySun/artifacts-beam/issues)
