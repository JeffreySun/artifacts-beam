# API reference (skill view)

Every command runs through the Node helper: `node scripts/abeam.mjs <command>`.
The helper attaches the bearer token automatically and refreshes it when it expires.
Paths to `scripts/` are relative to the installed skill, not the user's project.
The compatibility baseline is the application's October 2026 artifact API; a
particular deployment may not yet expose every endpoint. Report errors rather
than assuming a missing feature is an empty result.

Base URL: `https://artibeam.ai` (override with `config --site` or
`ARTIFACTSBEAM_SITE`).

## Command ↔ HTTP map

| Command | HTTP | Notes |
|---|---|---|
| `login [--provider p] [--no-browser]` | `GET /api/auth/login/{p}?mode=cli` → `POST /api/auth/token` | Loopback + PKCE; stores the token pair |
| `login --device` | `POST /api/auth/device/code` → poll `POST /api/auth/device/token` | RFC 8628; for machines with no reachable browser |
| `logout` | `POST /api/auth/token/revoke` | Revokes this device's token |
| `whoami` | `GET /api/auth/me` | Exit 2 if not authenticated |
| `workspaces` | `GET /api/orgs` | `{ activeOrgId, orgs: [{ orgId, displayName, role, kind, isActive }] }` |
| `workspace-use <orgId>` | `POST /api/mobile/active-org` | `{ orgId }`; switches this device token, not a cookie session |
| `publish <file> [--new] [--operation-id key] [--open] [--review]` | `POST /api/specs` (multipart) | Groups by filename + owner + workspace; `--new` sends `forceNewSpec=true` |
| `publish <file> --spec <id> [--review-packet file.json] [--operation-id key]` | `POST /api/specs/{id}/versions` (multipart) | Explicit target; packet adds a stale-base precondition |
| `list [q] [--tag a,b] [--page n] [--page-size n]` | `GET /api/specs?q=&tags=&page=&pageSize=` | Returns `{ items, page, pageSize, totalCount, totalPages }` |
| `get <specId>` | `GET /api/specs/{id}` | Metadata + versions |
| `versions <specId>` | `GET /api/specs/{id}/versions` | Version list |
| `diff <specId> <from> <to>` | `GET /api/specs/{id}/versions/{from}/diff/{to}` | Visible-text diff, not raw HTML/source diff |
| `content <specId> [--version n] [--out f]` | `GET /api/specs/{id}/versions/{n}/content` | Defaults to latest; prints or writes the HTML |
| `open <specId> [--version n] [--review]` | (browser) | Display by default; review UI only when explicitly requested |
| `share-create <specId> [--permission view\|comment] [--version n] [--expires-days n] [--passcode x]` | `POST /api/specs/{id}/shares` | Sends `versionPin`; returns the full `url` |
| `share-list <specId>` | `GET /api/specs/{id}/shares` | Authorized URLs can be redisplayed when the encrypted token remains recoverable |
| `share-revoke <specId> <shareId>` | `DELETE /api/specs/{id}/shares/{shareId}` | Owner only |
| `comments <specId> [--filter open\|resolved\|all]` | `GET /api/specs/{id}/comments` | Filtered client-side |
| `annotations <specId> [--version n]` | `GET /api/specs/{id}/annotations?version=n` | Ink, spatial anchors, instructions; distinct from comment threads |
| `review-packet <specId> [--state open\|resolved\|all] [--base-version n] [--authored-version n] [--selected comment:id,annotation:id] [--format json\|markdown] [--out file]` | `GET /api/specs/{id}/review-packet` | Model-free bounded feedback and immutable published base; no private drafts |
| `reply <specId> <commentId> "<text>"` | `POST /api/specs/{id}/comments/{cid}/replies` | |
| `comment-state <specId> <commentId> <open\|resolved>` | `PATCH /api/specs/{id}/comments/{cid}/state` | |
| `privacy-get <specId>` | `GET /api/specs/{id}/access` | Prefer canonical `visibility`; `mode` is legacy |
| `privacy-set <specId> <private\|internal\|restricted\|link> [--users email,email]` | `PUT /api/specs/{id}/access` | `{ visibility, scopedUsers }`; Manage access and workspace policy |
| `tags-get <specId>` | `GET /api/specs/{id}` (reads `spec.tags`) | |
| `tags-set <specId> "a,b"` | `PUT /api/specs/{id}/tags` | Replaces full set; `""` clears; caps 15×32 |
| `tags-all` | `GET /api/specs/tags` | Distinct tags + counts |
| `dashboard` | `GET /api/owner/summary` | Owner KPI totals |
| `delete <specId> --yes` | `DELETE /api/specs/{id}` | Manage access; irreversible |
| `delete-version <specId> <n> --yes` | `DELETE /api/specs/{id}/versions/{n}` | Edit access; refuses the only remaining version |
| `config [--site <url>]` | n/a | Show/persist target site |

## Auth model

- Every request carries `Authorization: Bearer <accessToken>`.
- The access token lasts 1 hour. On a `401` the helper rotates it using the refresh
  token and retries the request once. If there is no refresh token, or the refresh
  fails, every command reports `Not signed in (HTTP 401). Run: node abeam.mjs login`.
- Bearer callers send no ambient credential, so they are exempt from the antiforgery
  token the cookie-authenticated web app needs. **No endpoint here requires one**,
  including the multipart uploads.
- Credentials are stored per site, so `config --site` never mixes deployments.
- Workspace membership and current access are checked by the service. A valid
  token does not imply permission to edit, share, or administer every artifact.

## Publication preconditions

Uploads accept **`.html` only**. A new filename normally creates a new artifact
unless an explicit `--spec` target is supplied. `--new` and `--spec` are mutually
exclusive. Artifact quotas, upload ceilings, and version retention apply.

Every upload sends an `Idempotency-Key`; the helper prints it before the request
and includes it as `operationId` in its result. Reusing `--operation-id` is for the
same request/content, not a new edit.

For `--review-packet`, save a JSON review packet for the target id first. The
helper sends multipart `submissionMode=replaceIfCurrent` and
`expectedBaseRevision=<packet.baseRevision JSON>`. Despite its name, this mode
**creates a new immutable version**, conditioned on the published base still
being current. A conflict must not be retried as an unconditional append.

## Review packets

Wire query parameters are `state`, `baseVersion`, `authoredVersion`, `format`,
and repeated `selected=comment:<id>` / `selected=annotation:<id>` entries.
The helper accepts selected ids as CSV and writes `--out` JSON/Markdown without
requiring a separate decoder.

A JSON packet includes:

```json
{
  "contractVersion": 1,
  "artifactId": "artifact-id",
  "baseRevision": {
    "entityId": "artifact-id",
    "revisionId": "<64-character revision identity>",
    "publishedVersion": 7,
    "draftETag": null,
    "contentSha256": "<64-character content digest>"
  },
  "scope": { "state": "open", "authoredVersion": null },
  "scopeSnapshotId": "<digest of the emitted packet>",
  "selectedCount": 0,
  "totalCount": 0,
  "remainingCount": 0,
  "feedback": [],
  "submissionModes": ["append", "replaceIfCurrent"]
}
```

Each feedback item has a namespaced `id`, authored revision/version, state, text,
`anchor`, and bounded replies. This is a bounded capture, not a transactional
snapshot of all review stores. Never claim omitted feedback was processed.
Oversized/inconsistent captures fail rather than silently truncating replies.
For replies/state changes, strip `comment:` and use the raw comment id;
annotations are not comment threads.

## Visibility and policy

Use `private`, `internal` (owning workspace), `restricted` (explicit recipients),
or `link` (unlisted). `public` remains a helper alias for `link`, **not** a global
gallery. Restricted changes require `--users`; this endpoint replaces its scoped
email list. Typed grants and team access are managed separately in the app.

Anonymous viewing uses an explicitly created capability share link. Commenting
requires sign-in and appropriate access. `--version` pins a share; without it the
link follows the latest version. Expiry is 1-3650 days when supplied.

Manage-level actions include visibility, share creation/list/revocation, and
artifact deletion; tag edits/version publication/deletion need Edit. Current
server authorization is authoritative. Organization egress rules, publication
approval, and material lineage can prevent a broader audience; do not bypass
those restrictions with copied content.

## Common return shapes

### `publish` (`POST /api/specs`)
```json
{
  "spec":    { "specId": "ab12…", "displayName": "x.html", "privacyMode": "private", "visibility": "private", "orgId": "workspace-id", "latestVersionNumber": 2 },
  "version": { "versionNumber": 2, "originalFileName": "x.html", "uploadedAtUtc": "…" },
  "wasExistingSpec": true,
  "detailUrl": "https://artibeam.ai/#/specs/ab12…/v2",
  "operationId": "<upload operation key>"
}
```

### `share-create` (`POST /api/specs/{id}/shares`)
```json
{
  "shareId": "s_9f…",
  "permission": "comment",
  "hasPasscode": true,
  "versionPin": 2,
  "expiresAtUtc": "2026-06-19T00:00:00Z",
  "url": "https://artibeam.ai/s/ZfyIrDsNURD8H5GLqESn…"
}
```
`url` is returned **only on creation** — the server stores just a hash of the token.
`share-list` returns the same objects **without** `url`.

### `comments` (each item)
```json
{
  "id": "0f1e…", "author": "viewer@example.com", "authorDisplayName": "Sam",
  "text": "Use the brand color, not pure red", "state": "open",
  "versionNumberAuthored": 2,
  "anchorSelector": "body > main > section:nth-of-type(2) > button",
  "selectedText": "Submit",
  "selectionContextBefore": "…", "selectionContextAfter": "…",
  "createdAtUtc": "2026-06-12T22:00:00Z",
  "replies": [ { "id": "8a2b…", "authorDisplayName": "You", "text": "Addressed in v4.", "createdAtUtc": "…" } ]
}
```

### `privacy-get` (`GET /api/specs/{id}/access`)
```json
{ "mode": "private", "visibility": "internal", "scopedUsers": [], "owner": "…", "ownerDisplayName": "…", "canManage": true }
```

`detailUrl` and `operationId` are added by the helper. The optional `revision`
in version responses is the full published revision reference. Do not fabricate
revision identities or hashes from a version number.

## Browser-managed workflows

The application also provides private documents/checkpoints/proposals, materials,
optional metered AI authoring/review, formal review requests, Decisions,
organization/team/grant/collection administration, live pages/portals, notification
preferences, and billing. Those are not helper commands and do not become
supported merely because the application has endpoints for them. Use `open` to
hand off those actions; never invoke internal AI or change billing implicitly.

## URL grammar (for `open`)

Publish/canvas/open results use display mode by default, including feedback-driven
publication. `--review-packet` supplies a base precondition and does not select
review UI. Add `--review` only when the user explicitly asks to open that UI.

| URL | Means |
|---|---|
| `/#/specs/{id}` | Latest version, display mode |
| `/#/specs/{id}/v{n}` | Pinned version, display mode |
| `/#/specs/{id}/review` | Latest version, review mode (comment panel) |
| `/#/specs/{id}/v{n}/review` | Pinned version + review mode |
| `/s/{token}` | Public **share-link** viewer (no sign-in required) |
