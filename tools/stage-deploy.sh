#!/usr/bin/env bash
# Stage this app for a static deployment.
#
# Only the files the studio loads go into dist/: README, deployment config and
# the repository metadata stay behind. Then every path listed in the service
# worker's APP_FILES is checked against the staged tree, so a stale cache list
# fails the build instead of shipping a broken offline install.
set -euo pipefail
cd "$(dirname "$0")/.."

rm -rf dist
mkdir -p dist
cp -R index.html manifest.json service-worker.js css js icons dist/

missing=0
while IFS= read -r file; do
  [ -e "dist/${file#./}" ] || { echo "missing from dist: $file"; missing=1; }
done < <(grep -o '"\./[^"]*"' service-worker.js | tr -d '"' | sort -u)
[ "$missing" -eq 0 ] || exit 1

echo "Staged $(find dist -type f | wc -l) files in dist/"
