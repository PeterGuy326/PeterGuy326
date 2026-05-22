#!/usr/bin/env bash
# Install prepare-commit-msg hook into a target git repo to strip AI co-author
# trailers (Co-Authored-By: Claude / 🤖 Generated with Claude Code / etc).
#
# Usage:
#   scripts/install-hooks.sh                  # install into current repo
#   scripts/install-hooks.sh /path/to/repo    # install into specified repo
#
# Re-runs are idempotent: any existing prepare-commit-msg is backed up to
# .git/hooks/prepare-commit-msg.bak.<epoch> before overwrite.

set -euo pipefail

TARGET="${1:-.}"
cd "$TARGET"

if ! git rev-parse --git-dir >/dev/null 2>&1; then
  echo "error: $TARGET is not a git repository" >&2
  exit 1
fi

GIT_DIR="$(git rev-parse --git-dir)"
HOOK_PATH="$GIT_DIR/hooks/prepare-commit-msg"
mkdir -p "$GIT_DIR/hooks"

if [ -f "$HOOK_PATH" ]; then
  BACKUP="$HOOK_PATH.bak.$(date +%s)"
  cp "$HOOK_PATH" "$BACKUP"
  echo "backed up existing hook → $BACKUP"
fi

cat > "$HOOK_PATH" <<'HOOK'
#!/usr/bin/env bash
# Strip AI co-author trailers from commit message.
# git log / git blame / GitHub Contributions stay human-attributed.
set -e
MSG_FILE="$1"
[ -f "$MSG_FILE" ] || exit 0

sed -i.bak -E \
  -e '/^[Cc]o-[Aa]uthored-[Bb]y:[[:space:]]*Claude/d' \
  -e '/[Gg]enerated with Claude Code/d' \
  -e '/noreply@anthropic\.com/d' \
  "$MSG_FILE"
rm -f "${MSG_FILE}.bak"

awk '
  /^[[:space:]]*$/ { blanks++; next }
  { for (i = 0; i < (blanks > 0 ? 1 : 0); i++) print ""; blanks = 0; print }
' "$MSG_FILE" > "${MSG_FILE}.tmp"
mv "${MSG_FILE}.tmp" "$MSG_FILE"
HOOK

chmod +x "$HOOK_PATH"
echo "✅ installed prepare-commit-msg hook → $HOOK_PATH"

echo
echo "smoke test:"
TMP="$(mktemp)"
cat > "$TMP" <<'EOF'
feat: smoke

body

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
🤖 Generated with Claude Code
EOF
"$HOOK_PATH" "$TMP"
if grep -qiE 'claude|anthropic' "$TMP"; then
  echo "❌ smoke test failed — residue:"
  grep -iE 'claude|anthropic' "$TMP"
  rm -f "$TMP"
  exit 2
else
  echo "✅ smoke test passed — trailers stripped"
fi
rm -f "$TMP"
