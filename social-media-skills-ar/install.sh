#!/usr/bin/env bash
# Install the Arabic skills into a Claude skills directory.
#
# The Arabic sources are named SKILL.ar.md so they can sit alongside the English
# originals without colliding. Claude only discovers files named SKILL.md, so
# this script copies each skill into place under that name.
#
# Usage:
#   ./install.sh                      # install as <name>-ar, safe alongside English
#   ./install.sh --replace            # install as <name>, Arabic only
#   ./install.sh --dest DIR           # target dir (default ~/.claude/skills)
#   ./install.sh --dry-run            # print what would happen, change nothing

set -euo pipefail

SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/skills"
DEST="${HOME}/.claude/skills"
SUFFIX="-ar"
DRY=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --replace) SUFFIX=""; shift ;;
    --dest)    DEST="$2"; shift 2 ;;
    --dry-run) DRY=1; shift ;;
    -h|--help) sed -n '2,13p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "unknown option: $1" >&2; exit 1 ;;
  esac
done

[[ -d "$SRC" ]] || { echo "skills/ not found at $SRC" >&2; exit 1; }

count=0
for dir in "$SRC"/*/; do
  name="$(basename "$dir")"
  [[ -f "${dir}SKILL.ar.md" ]] || continue
  target="${DEST}/${name}${SUFFIX}"

  if [[ $DRY -eq 1 ]]; then
    echo "would install ${name}${SUFFIX} -> ${target}/SKILL.md"
    count=$((count+1))
    continue
  fi

  mkdir -p "$target"
  # Rename the frontmatter `name` to match the folder, which the loader requires.
  sed "1,/^---$/ s/^name: ${name}\$/name: ${name}${SUFFIX}/" \
    "${dir}SKILL.ar.md" > "${target}/SKILL.md"

  # references/ keeps its .ar.md filenames, which is what SKILL.md points at.
  if [[ -d "${dir}references" ]]; then
    mkdir -p "${target}/references"
    cp "${dir}references"/*.ar.md "${target}/references/" 2>/dev/null || true
  fi

  echo "installed ${name}${SUFFIX}"
  count=$((count+1))
done

echo
if [[ $DRY -eq 1 ]]; then
  echo "$count skills would be installed to $DEST"
else
  echo "$count skills installed to $DEST"
  echo "Restart Claude Code, then start with: ابنِ صوتي"
fi
