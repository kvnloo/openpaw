#!/usr/bin/env bash
# Stage the GitHub Pages site: landing (site/) at the root, the app (app/) under /app, no tests.
# usage (from the repo root): bash tools/stage-pages.sh _site
# Used by .github/workflows/pages.yml and by site/test/pages-stage.test.mjs.
# SPDX-License-Identifier: GPL-3.0-only
set -euo pipefail
out="${1:?usage: stage-pages.sh <out-dir>}"
mkdir -p "$out/app"
cp -R site/. "$out/"
rm -rf "$out/test"
cp app/*.html app/*.js "$out/app/"
# app pages reference ../site/fonts (that path works in the repo checkout). On Pages the landing page
# loads the same files from /fonts/, so point the staged app pages there: one URL per font, and a
# visitor going landing -> app reuses the cached fonts instead of downloading ~100 KB again.
sed -i.bak 's#\.\./site/fonts/#../fonts/#g' "$out"/app/*.html && rm -f "$out"/app/*.html.bak
# keep the old path published for a page cached from before this change
mkdir -p "$out/site" && cp -R site/fonts "$out/site/fonts"
touch "$out/.nojekyll"
# every local href/src in the landing page must exist in the staged site
grep -oE '(href|src)="[^"#:]+"' "$out/index.html" | sed -E 's/.*="([^"]+)"/\1/' | while read -r f; do
  [ -e "$out/${f%/}" ] || [ -e "$out/${f}index.html" ] || { echo "missing: $f"; exit 1; }
done
