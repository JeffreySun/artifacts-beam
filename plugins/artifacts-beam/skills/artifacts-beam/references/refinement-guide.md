# Refinement guide — applying review comments to HTML

This guide is for the agent. Each comment in Artifacts Beam comes with rich anchor
data — use it to locate exactly what the reviewer meant.

## Comment payload — what each field means

| Field | Use it for |
|---|---|
| `text` | The actual feedback. **Source of truth for what to change.** |
| `selectedText` | The DOM text the reviewer highlighted. **Highest-fidelity locator.** |
| `anchorSelector` | A CSS selector pointing at the closest block ancestor. May be brittle if the DOM changed since the comment was written. |
| `selectionContextBefore` / `After` | Text adjacent to the selection. Excellent secondary locator. |
| `versionNumberAuthored` | If the user is iterating from a later version, anchors may have drifted. Flag when this differs from the latest. |
| `replies` | Sub-thread; a later reply may supersede or clarify the original. |
| `state` | `open` or `resolved`. Skip `resolved` silently. |

## Anchor resolution (selector first, text second, ask last)

1. Try `document.querySelector(anchorSelector)`. Exactly one match → use it.
2. Otherwise, search the document by `selectedText`:
   - Exact substring match wins.
   - Tied? Pick the candidate with the highest token overlap with
     `selectionContextBefore` + `selectionContextAfter`.
3. If nothing matches with confidence, **don't guess** — ask the user.

You don't need to implement this literally; rely on your judgment. The principle:
**selector first, text-match second, ask the user as a fallback.**

## Editing rules

1. **Surgical edits only.** Change the smallest region needed. Don't rewrite the
   surrounding paragraph "while you're there".
2. **Preserve indentation and whitespace.** Match the file's existing style.
3. **Keep `<head>` intact** unless the comment is about it (e.g., "missing viewport").
4. **Preserve external resource references** (CSS/JS/image/font URLs) and inline
   scripts — Artifacts Beam renders specs in a sandboxed iframe, so keep them
   self-contained exactly as they were.
5. **One diff per version.** Bundle all comment-driven edits into a single
   save-then-publish so the resulting v{N+1} maps cleanly to "addressed these".
6. **Show the diff before publishing.** Always.

## Common comment patterns

| Pattern | Recommended action |
|---|---|
| *"Change X color to Y"* | Edit the matching style block / inline `style=`. Prefer a design token if one exists. |
| *"Add alt text" / "improve a11y"* | Add `alt`, `aria-label`, or `role` as appropriate. |
| *"This wording is unclear"* | Rewrite the highlighted text **only**. |
| *"Add a button to do Z"* | Insert a new element near the anchor; match the existing markup style. |
| *"Move this section above that one"* | Cut/paste the block; verify id refs and `#anchor` links still resolve. |
| *"Make the heading larger"* | Adjust CSS only; don't change the heading text. |
| *"Add a chart of …"* | Likely new JS/SVG — confirm scope before generating a large block. |

## When NOT to edit

- The comment is a **question** ("Why blue here?") — answer in chat; don't edit.
- A **vague future suggestion** ("consider caching someday") — flag for the user.
- Authored on a **much older version** and the anchor no longer resolves — ask first.
- `state: "resolved"` — skip silently.

## Reporting back

After applying edits and publishing, say something like:

> Applied 3 of 4 open comments to `mockup.html` and uploaded as **v4**:
> - ✅ "Use the brand color, not pure red" → `#ff0000` → `var(--brand)` on `.cta`
> - ✅ "Add alt text to the hero image" → `alt="Quarterly results dashboard"`
> - ✅ "Heading should be larger" → bumped `h1` 24px → 32px
> - ⏸️ "Add a revenue chart" — skipped, needs data I don't have. Reply here with the
>   numbers and I'll add it.
>
> Replied on each addressed comment and reopened
> https://artibeam.ai/#/specs/<id>/v4/review for re-review.

Then, per Workflow C, leave a reply on each addressed comment:
```bash
node scripts/abeam.mjs reply <specId> <commentId> "Addressed in v4."
```
