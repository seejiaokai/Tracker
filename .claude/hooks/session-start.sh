#!/bin/bash
# Prepare the repo so `npm run smoke` (browser-driven live testing) works
# immediately in a fresh Claude Code on the web session.
set -euo pipefail

# Local machines already have their own setup; only the remote image needs this.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-$(dirname "$0")/../..}"

# The image ships a Chromium and blocks the Playwright CDN, so never try to
# download one — resolve the pre-installed binary instead.
export PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
npm install --no-audit --no-fund

# Hand the browser path to `npm run smoke` rather than hardcoding it in the script.
for c in "${PLAYWRIGHT_BROWSERS_PATH:-/opt/pw-browsers}/chromium" \
         /usr/bin/chromium /usr/bin/chromium-browser /usr/bin/google-chrome; do
  if [ -x "$c" ]; then
    echo "resolved Chromium: $c"
    [ -n "${CLAUDE_ENV_FILE:-}" ] && echo "export CHROMIUM_PATH=$c" >> "$CLAUDE_ENV_FILE"
    break
  fi
done

echo "ready: run 'npm run smoke' for browser-driven live testing"
