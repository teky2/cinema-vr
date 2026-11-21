#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
rm -f cinema-vr.zip
zip -r cinema-vr.zip cinema-vr \
  -x '*/node_modules/*' -x '*/.git/*' -x '*.DS_Store' -x '*/cinema-vr.zip'
echo "built $(pwd)/cinema-vr.zip"