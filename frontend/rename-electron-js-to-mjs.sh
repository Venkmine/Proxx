#!/bin/sh
# Rename all .js files in dist-electron to .mjs for Electron ESM compatibility
cd "$(dirname "$0")"
cd dist-electron
for f in *.js; do
  [ -e "$f" ] || continue
  mv -- "$f" "${f%.js}.mjs"
done
