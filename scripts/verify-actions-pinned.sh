#!/usr/bin/env bash
# DEP-01 guard (audit v1.41.0, batch 1): every EXTERNAL GitHub Actions
# reference in .github/workflows (and local composite actions) must be
# pinned to a full 40-hex commit SHA. The human-readable version is kept
# in a trailing comment (e.g. "# v4.4.0") so Dependabot can still propose
# version bumps as reviewable PRs.
#
# Exemptions:
#   - uses: ./...            in-repo composite actions (versioned with the repo)
#   - uses: docker://...     container references (not used today)
#
# A `uses:` line that cannot be parsed is treated as a violation — a
# vacuously-passing check is worse than a false positive.
#
# Usage: bash scripts/verify-actions-pinned.sh   (cwd-independent)
set -euo pipefail
cd "$(dirname "$0")/.."

violations=0
checked=0
pinned=0

# grep every `uses:` line across workflows and local composite actions.
while IFS= read -r location; do
  file="${location%%:*}"
  rest="${location#*:}"
  line_no="${rest%%:*}"
  content="${rest#*:}"

  # Skip YAML comment lines — a `uses:` mentioned in prose is not a reference.
  case "${content#"${content%%[![:space:]]*}"}" in
    '#'*) continue ;;
  esac

  # Extract the reference after `uses:` (stops at whitespace or a comment).
  ref="$(printf '%s' "$content" | grep -oE 'uses:[[:space:]]*[^[:space:]#]+' | sed 's/^uses:[[:space:]]*//' | head -n 1)"
  if [ -z "$ref" ]; then
    echo "::error file=${file},line=${line_no}::DEP-01: unparsable uses line: ${content#"${content%%[![:space:]]*}"}"
    violations=$((violations + 1))
    continue
  fi

  # Strip surrounding quotes, if any.
  ref="${ref%\"}"; ref="${ref#\"}"
  ref="${ref%\'}"; ref="${ref#\'}"

  # In-repo composite actions and container refs are exempt (checked BEFORE
  # the @-parsing below — local paths carry no version suffix at all).
  case "$ref" in
    ./*|docker://*) continue ;;
  esac

  # Locate the version separator (last @ — coords never contain one).
  version="${ref##*@}"
  if [ "$ref" = "$version" ]; then
    echo "::error file=${file},line=${line_no}::DEP-01: '${ref}' has no @version part"
    violations=$((violations + 1))
    continue
  fi
  coords="${ref%@*}"

  checked=$((checked + 1))

  # The pin must be a full 40-hex commit SHA.
  if printf '%s' "$version" | grep -Eqi '^[0-9a-f]{40}$'; then
    pinned=$((pinned + 1))
  else
    echo "::error file=${file},line=${line_no}::DEP-01: '${coords}@${version}' is not pinned to a full commit SHA (expected: ${coords}@<40-hex> # vX.Y.Z)"
    violations=$((violations + 1))
  fi
done < <(grep -rn --include='*.yml' --include='*.yaml' 'uses:' .github/workflows/ .github/actions/ 2>/dev/null || true)

echo "DEP-01 check: ${pinned}/${checked} external action references pinned to commit SHAs"
if [ "$violations" -gt 0 ]; then
  echo "FAILED: ${violations} violation(s) found"
  exit 1
fi
echo "OK"
