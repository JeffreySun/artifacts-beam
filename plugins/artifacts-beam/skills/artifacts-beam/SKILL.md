---
name: artifacts-beam
description: "Publish HTML artifacts to Artifacts Beam (https://artibeam.ai), create revocable share links anyone can open, open artifacts for review, and iterate on the HTML based on collaborator comments. Artifacts Beam is the CONSUMER edition: personal Microsoft/Google sign-in, no Azure AD required. WHEN: 'publish to artifacts beam', 'upload this html to artifacts beam', 'share this mockup', 'create a share link', 'send my page for review', 'get a public link', 'fetch artifacts beam comments', 'apply the review feedback', 'iterate on the comments', 'open my artifact', 'change artifact privacy', 'reply to the comment', 'tag the artifact', 'revoke a share link'."
license: MIT
metadata:
  author: Jeffrey Sun
  version: "0.1.0"
  helper: scripts/abeam.mjs
  service: https://artibeam.ai
---

# Artifacts Beam

> A skill for publishing HTML artifacts to **Artifacts Beam**, the consumer edition
> of the review platform. Create revocable **share links** anyone can open, gather
> comments from collaborators, and close the loop by refining the HTML — all signed
> in with a personal Microsoft (or Google) account, no corporate Azure AD needed.

This skill is **agent-agnostic**: every action runs through the portable, zero-
dependency Node helper at [`scripts/abeam.mjs`](scripts/abeam.mjs). The same helper
backs the Copilot CLI, Codex, and Claude versions of this skill — only this wrapper
differs.

## Authentication model (read this first)

`login` signs the user in through their **browser** using a loopback redirect and PKCE
— nothing is copied or pasted. That yields a device-scoped bearer token which the
helper stores per site and refreshes on its own. See Setup below.

Sign-in is a personal **Microsoft**, **Google**, or **Apple** account. No corporate
directory, IT approval, or admin consent is involved.

## Triggers

Activate when the user says:

- "publish this to Artifacts Beam" / "upload my html for review"
- "create a share link" / "give me a link anyone can open" / "share this mockup"
- "what comments do I have?" / "fetch the Artifacts Beam feedback"
- "apply the comments" / "iterate based on the review" / "make a new version"
- "make this artifact public/private" / "revoke that share link" / "tag this artifact"

Do **not** activate for general local HTML editing with no Artifacts Beam intent.

---

## Setup check (always do this first)

```bash
node scripts/abeam.mjs whoami
```

- **Prints your email** → you're signed in; continue.
- **"Not signed in"** (exit code 2) → run the one-time sign-in below.

### One-time sign-in

```bash
node scripts/abeam.mjs login
```

The browser opens, the user signs in with Microsoft, Google, or Apple, and the terminal
is signed in. **There is nothing for the user to copy or paste** — never ask them for a
cookie, token, or code.

Add `--provider google|apple` to pick a provider.

On a machine with no reachable browser (SSH, containers, CI) the helper switches to a
**device code** automatically; `--device` forces it. It prints a short code and a URL for
the user to open on any other device. Relay those verbatim and wait — do not ask the user
for the code back, and never approve on their behalf. Full walkthrough:
[references/auth-setup.md](references/auth-setup.md).

> The session is stored at `~/.artifactsbeam/session.json` (mode 600). Never print
> or commit it. `node scripts/abeam.mjs logout` revokes it server-side and deletes it.

---

## Workflow A — Publish an artifact

**Goal:** the user has a local HTML file and wants it on Artifacts Beam.

1. **Identify the file.** If unspecified, ask once (suggest the most recently
   modified `.html` in the workspace). Reject non-HTML with a clear message.
2. **Upload:**
   ```bash
   node scripts/abeam.mjs publish "<file.html>" --open
   ```
   The server **auto-versions** by display name + owner: re-publishing the same
   filename adds a new version of the same artifact — no need to track the id.
3. **Read the result** (printed as JSON): `spec.specId`, `spec.displayName`,
   `version.versionNumber`, `wasExistingSpec`, and `detailUrl`.
4. **Tell the user:**
   - new: *"Published '{displayName}' (v1). Opened in browser."*
   - existing: *"Added as v{N} of '{displayName}'. Opened in browser."*
   - **Always include the URL.**

Pass `--review` to make the opened URL land directly on the comment panel.

---

## Workflow B — Create a share link (the headline consumer feature)

**Goal:** the user wants a link they can paste into email/chat that anyone can open —
no sign-in required for the viewer.

```bash
# View-only, never expires:
node scripts/abeam.mjs share-create <specId> --permission view

# Commentable, expires in 7 days, passcode-protected:
node scripts/abeam.mjs share-create <specId> --permission comment --expires-days 7 --passcode hunter2
```

- **Copy the URL immediately** — the server returns the full `https://…/s/{token}`
  **once** and never re-displays it (only a hash is stored). Surface it to the user
  verbatim.
- `--permission`: `view` (read-only) or `comment` (viewer can sign in to comment).
- `--expires-days`: omit for "never expires".
- `--passcode`: optional; the viewer must enter it to open.

Manage existing links:
```bash
node scripts/abeam.mjs share-list <specId>          # list (URLs are not re-shown)
node scripts/abeam.mjs share-revoke <specId> <shareId>
```

Tell the user clearly when a link is **commentable vs view-only**, whether it has a
**passcode**, and **when it expires**. Always remind them the URL can't be retrieved
again — if lost, revoke and create a new one.

---

## Workflow C — Iterate on collaborator feedback

**Goal:** read open comments on a published artifact and refine the local HTML to
address them, then upload a new version. This is the high-value loop — go carefully.

### C.1 — Identify the artifact
- A detail URL → extract `specId` from `…/#/specs/<id>`.
- A name → `node scripts/abeam.mjs list "<name>"` and confirm the match.
- Confirm: *"Iterating on '{displayName}', currently v{latestVersionNumber}. Continue?"*

### C.2 — Get the local file
The user points at their working copy, or download the latest as the starting point:
```bash
node scripts/abeam.mjs content <specId> --out ./working-copy.html
```

### C.3 — Fetch open comments
```bash
node scripts/abeam.mjs comments <specId> --filter open
```
Each comment carries anchor data (`text`, `selectedText`, `anchorSelector`,
`selectionContextBefore/After`, `versionNumberAuthored`, `replies`). If there are
zero open comments, say so and stop.

### C.4 — Plan, then apply
Summarize the comments and ask which to apply (all / a subset). For each accepted
comment, **you** do the rewrite — use `anchorSelector` + `selectedText` to locate
the spot. See [references/refinement-guide.md](references/refinement-guide.md) for
anchor-resolution heuristics and editing rules (surgical edits, preserve `<head>`
and indentation, never rewrite unrelated regions).

### C.5 — Show the diff, then upload
Show a unified diff and get confirmation before uploading:
```bash
node scripts/abeam.mjs publish ./working-copy.html
```

### C.6 — Reply to addressed comments (recommended)
Leave a short reply so reviewers see what changed (better than silently resolving):
```bash
node scripts/abeam.mjs reply <specId> <commentId> "Addressed in v{N}."
```
Only resolve if the user explicitly asks:
```bash
node scripts/abeam.mjs comment-state <specId> <commentId> resolved
```

### C.7 — Reopen for review
```bash
node scripts/abeam.mjs open <specId> --version <N> --review
```
Report: *"Uploaded as v{N}. {K} comments addressed (replied), {M} left open."*

---

## Workflow D — Manage privacy

```bash
node scripts/abeam.mjs privacy-get <specId>
node scripts/abeam.mjs privacy-set <specId> public     # or: private
```

- **private** — only you (the owner) can open it while signed in.
- **public** — any signed-in Artifacts Beam user can open it.
- For *"anyone with the link, no account"* sharing, use **share links** (Workflow B),
  not `public`.

Owner-only; non-owners get HTTP 403.

---

## Workflow E — Tags

```bash
node scripts/abeam.mjs tags-get <specId>
node scripts/abeam.mjs tags-set <specId> "mockup,q2,pre-sale"   # replaces the whole set; "" clears
node scripts/abeam.mjs tags-all                                  # vocabulary + counts
node scripts/abeam.mjs list "" --tag mockup,q2                   # find by tag (AND)
```

Owner-only edit. The server normalizes (lowercase/trim/dedupe) and caps at 15 tags ×
32 chars. `tags-set` **replaces** — to add one, read current, append, set the union.

---

## Workflow F — Delete

```bash
node scripts/abeam.mjs delete-version <specId> <n> --yes   # one version
node scripts/abeam.mjs delete <specId> --yes               # whole artifact (+versions+comments)
```

**Always confirm with the user in chat first.** The helper refuses without `--yes`
as a guardrail. Deletes are irreversible. Owner-only (403 otherwise). The server
refuses to delete the *only* remaining version (delete the artifact instead).

---

## Workflow G — Quick query

For one-offs like *"what comments are on my artifact?"*, just run `comments` /
`list` / `dashboard` and print a compact summary; don't propose edits unless asked.

```bash
node scripts/abeam.mjs dashboard     # owner KPI summary (totals, public/private, active links)
```

---

## Output / UX rules

- **Always print the share/detail URL** when creating a link or publishing.
- **Always confirm before uploading a new version** — it's an immutable record.
- **Always confirm before deleting**, even though `--yes` is required.
- A freshly created **share URL is shown only once** — surface it verbatim and tell
  the user to save it.
- Never print or persist the access token. Never modify a file the user didn't ask
  you to change. Keep editing the same local `.html` so diffs stay meaningful.

## Errors

| Symptom | Action |
|---|---|
| `Not signed in (HTTP 401)` | Run `login` — the refresh token expired or was revoked |
| `Forbidden (HTTP 403)` | Caller isn't the owner — offer to publish as a new artifact instead |
| `Request failed (HTTP 404)` | Stale URL or the artifact/version was deleted |
| `node: command not found` | Install Node.js 18+ (the helper needs global `fetch`) |
| `timed out … waiting for the browser sign-in` | The sign-in wasn't finished in time — run `login` again |

## See also

- [scripts/abeam.mjs](scripts/abeam.mjs) — the portable CLI helper (`node abeam.mjs help`)
- [references/auth-setup.md](references/auth-setup.md) — browser sign-in (one time)
- [references/api-reference.md](references/api-reference.md) — command ↔ HTTP endpoint map
- [references/refinement-guide.md](references/refinement-guide.md) — how to apply review comments
- [README.md](README.md) — installation
