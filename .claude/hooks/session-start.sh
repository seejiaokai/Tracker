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

# The Superpowers plugin is declared in .claude/settings.json, but a plugin from
# a GitHub marketplace is *declared*, not installed — and this image starts with
# an empty ~/.claude every session, so the clone has to be re-fetched here.
# Both commands are no-ops once it is present, and neither may break startup.
if ! claude plugin list 2>/dev/null | grep -q 'superpowers@superpowers-marketplace'; then
  claude plugin marketplace add obra/superpowers-marketplace --scope project >/dev/null 2>&1 || true
  claude plugin install superpowers@superpowers-marketplace --scope project >/dev/null 2>&1 || true
fi
if claude plugin list 2>/dev/null | grep -q 'superpowers@superpowers-marketplace'; then
  echo "superpowers: ready"
else
  echo "superpowers: NOT installed — run 'claude plugin install superpowers@superpowers-marketplace --scope project'"
fi

echo "ready: 'npm run smoke' (local build) · 'npm run live' (deployed site)"
