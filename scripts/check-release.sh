#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

node -e "JSON.parse(require('fs').readFileSync('manifest.json', 'utf8'))"
node --check "shared.js"
node --check "background.js"
node --check "content.js"
node --check "content-collection.js"
node --check "content-main.js"
node --check "popup.js"
node "scripts/check-shared.js"

git diff --check -- \
  ".gitignore" \
  "CHANGELOG.md" \
  "README.md" \
  "manifest.json" \
  "shared.js" \
  "background.js" \
  "content.js" \
  "content-collection.js" \
  "content-main.js" \
  "popup.js" \
  "scripts/check-shared.js" \
  "scripts/check-release.sh" \
  "styles.css" \
  "popup.css"

git diff --cached --check -- \
  ".gitignore" \
  "CHANGELOG.md" \
  "README.md" \
  "manifest.json" \
  "shared.js" \
  "background.js" \
  "content.js" \
  "content-collection.js" \
  "content-main.js" \
  "popup.js" \
  "scripts/check-shared.js" \
  "scripts/check-release.sh" \
  "styles.css" \
  "popup.css"

echo "发布前检查通过。"
