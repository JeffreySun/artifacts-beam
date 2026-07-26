#!/usr/bin/env bash
# Install the artifacts-beam skill into ~/.agents/skills (portable: macOS/Linux).
set -euo pipefail

SKILL_NAME="artifacts-beam"
SOURCE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEST_ROOT="${1:-$HOME/.agents/skills}"
DEST="$DEST_ROOT/$SKILL_NAME"

if [ -e "$DEST" ] && [ "${FORCE:-}" != "1" ]; then
  echo "Skill already installed at $DEST."
  echo "Re-run with FORCE=1 to overwrite."
  exit 1
fi

rm -rf "$DEST"
mkdir -p "$DEST_ROOT"
cp -R "$SOURCE" "$DEST"
echo "✓ Installed $SKILL_NAME skill to $DEST"

echo
echo "Next steps:"
echo "  1. Ensure Node.js 18+ is installed:  node --version"
echo "  2. Sign in once (captures the session cookie):"
echo "       node \"$DEST/scripts/abeam.mjs\" login"
echo "     …then paste the cookie:  node \"$DEST/scripts/abeam.mjs\" login --cookie \"<value>\""
echo "  3. Verify:  node \"$DEST/scripts/abeam.mjs\" whoami"
echo
echo "See $DEST/references/auth-setup.md for the full sign-in walkthrough."
