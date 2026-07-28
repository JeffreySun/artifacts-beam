# API reference (skill view)

Every command runs through the Node helper: `node scripts/abeam.mjs <command>`.
The helper attaches the bearer token automatically and refreshes it when it expires.

Base URL: `https://artibeam.ai` (override with `config --site` or
`ARTIFACTSBEAM_SITE`).

## Command ↔ HTTP map

| Command | HTTP | Notes |
|---|---|---|
| `login [--provider p] [--no-browser]` | `GET /api/auth/login/{p}?mode=cli` → `POST /api/auth/token` | Loopback + PKCE; stores the token pair |
| `logout` | `POST /api/auth/token/revoke` | Revokes this device's token |
| `whoami` | `GET /api/auth/me` | Exit 2 if not authenticated |
| `publish <file> [--open] [--review]` | `POST /api/specs` (multipart) | Auto-versions by displayName + owner |
| `list [q] [--tag a,b] [--page n] [--page-size n]` | `GET /api/specs?q=&tags=&page=&pageSize=` | Returns `{ items, page, pageSize, totalCount, totalPages }` |
| `get <specId>` | `GET /api/specs/{id}` | Metadata + versions |
| `versions <specId>` | `GET /api/specs/{id}/versions` | Version list |
| `content <specId> [--version n] [--out f]` | `GET /api/specs/{id}/versions/{n}/content` | Defaults to latest; prints or writes the HTML |
| `open <specId> [--version n] [--review]` | (browser) | Opens the hash route |
| `share-create <specId> [--permission view\|comment] [--expires-days n] [--passcode x]` | `POST /api/specs/{id}/shares` | Returns the full `url` **once** |
| `share-list <specId>` | `GET /api/specs/{id}/shares` | URLs are not re-shown (only metadata) |
| `share-revoke <specId> <shareId>` | `DELETE /api/specs/{id}/shares/{shareId}` | Owner only |
| `comments <specId> [--filter open\|resolved\|all]` | `GET /api/specs/{id}/comments` | Filtered client-side |
| `reply <specId> <commentId> "<text>"` | `POST /api/specs/{id}/comments/{cid}/replies` | |
| `comment-state <specId> <commentId> <open\|resolved>` | `PATCH /api/specs/{id}/comments/{cid}/state` | |
| `privacy-get <specId>` | `GET /api/specs/{id}/access` | `{ mode, owner, ownerDisplayName, canManage, … }` |
| `privacy-set <specId> <private\|public>` | `PUT /api/specs/{id}/access` | Owner only |
| `tags-get <specId>` | `GET /api/specs/{id}` (reads `spec.tags`) | |
| `tags-set <specId> "a,b"` | `PUT /api/specs/{id}/tags` | Replaces full set; `""` clears; caps 15×32 |
| `tags-all` | `GET /api/specs/tags` | Distinct tags + counts |
| `dashboard` | `GET /api/owner/summary` | Owner KPI totals |
| `delete <specId> --yes` | `DELETE /api/specs/{id}` | Owner only; irreversible |
| `delete-version <specId> <n> --yes` | `DELETE /api/specs/{id}/versions/{n}` | Refuses the only remaining version |
| `config [--site <url>]` | n/a | Show/persist target site |

## Auth model

- Every request carries `Authorization: Bearer <accessToken>`.
- The access token lasts 1 hour. On a `401` the helper rotates it using the refresh
  token and retries the request once; only a failed refresh surfaces as "Not signed in".
- Bearer callers send no ambient credential, so they are exempt from the antiforgery
  token the cookie-authenticated web app needs. **No endpoint here requires one** —
  including the multipart uploads, which did when the helper replayed a cookie.
- Credentials are stored per site, so `config --site` never mixes deployments.

## Common return shapes

### `publish` (`POST /api/specs`)
```json
{
  "spec":    { "specId": "ab12…", "displayName": "x.html", "privacyMode": "private", "latestVersionNumber": 2 },
  "version": { "versionNumber": 2, "originalFileName": "x.html", "uploadedAtUtc": "…" },
  "wasExistingSpec": true,
  "detailUrl": "https://artibeam.ai/#/specs/ab12…/v2"
}
```

### `share-create` (`POST /api/specs/{id}/shares`)
```json
{
  "shareId": "s_9f…",
  "permission": "comment",
  "hasPasscode": true,
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
{ "mode": "private", "owner": "…", "ownerDisplayName": "…", "canManage": true }
```

## URL grammar (for `open`)

| URL | Means |
|---|---|
| `/#/specs/{id}` | Latest version, display mode |
| `/#/specs/{id}/v{n}` | Pinned version, display mode |
| `/#/specs/{id}/review` | Latest version, review mode (comment panel) |
| `/#/specs/{id}/v{n}/review` | Pinned version + review mode |
| `/s/{token}` | Public **share-link** viewer (no sign-in required) |
