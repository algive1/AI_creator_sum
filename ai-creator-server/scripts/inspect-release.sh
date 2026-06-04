#!/usr/bin/env bash
set -Eeuo pipefail

PACKAGE_PATH="${1:-}"
FAILED=0
SEMVER_PATTERN='^(0|[1-9][0-9]*)\.([0-9]|[1-9][0-9]*)\.([0-9]|[1-9][0-9]*)(-[0-9A-Za-z-]+(\.[0-9A-Za-z-]+)*)?(\+[0-9A-Za-z-]+(\.[0-9A-Za-z-]+)*)?$'

usage() {
  cat <<'USAGE'
Usage:
  bash scripts/inspect-release.sh ai-creator-release-1.0.3.tar.gz
USAGE
}

ok() {
  printf '[OK] %s\n' "$*"
}

fail_check() {
  printf '[FAIL] %s\n' "$*" >&2
  FAILED=1
}

if [[ -z "$PACKAGE_PATH" ]]; then
  usage
  exit 1
fi

if [[ ! -f "$PACKAGE_PATH" ]]; then
  fail_check "package not found: $PACKAGE_PATH"
  exit 1
fi

case "$PACKAGE_PATH" in
  *.tar.gz|*.tgz) ;;
  *) fail_check "only .tar.gz packages are supported"; exit 1 ;;
esac

LISTING="$(tar -tzf "$PACKAGE_PATH" | sed 's#^\./##')"
VERBOSE_LISTING="$(tar -tvzf "$PACKAGE_PATH")"

has_path() {
  printf '%s\n' "$LISTING" | grep -Eq "$1"
}

require_entry() {
  local label="$1"
  local pattern="$2"
  if has_path "$pattern"; then
    ok "required: $label"
  else
    fail_check "missing required item: $label"
  fi
}

forbid() {
  local label="$1"
  local pattern="$2"
  local matches
  matches="$(printf '%s\n' "$LISTING" | grep -E "$pattern" || true)"
  if [[ -n "$matches" ]]; then
    fail_check "found forbidden $label:"
    printf '%s\n' "$matches" | sed 's/^/[FAIL] - /' >&2
  else
    ok "forbidden check passed: $label"
  fi
}

check_archive_entries() {
  local entry line mode
  while IFS= read -r entry; do
    entry="${entry#./}"
    [[ -n "$entry" && "$entry" != "." ]] || continue
    [[ "$entry" != /* ]] || fail_check "archive contains absolute path: $entry"
    [[ "$entry" != *'/../'* && "$entry" != ../* && "$entry" != *'/..' ]] || fail_check "archive escapes package root: $entry"
  done <<< "$LISTING"

  while IFS= read -r line; do
    [[ -n "$line" ]] || continue
    mode="${line%% *}"
    case "${mode:0:1}" in
      -|d) ;;
      *) fail_check "archive contains unsupported entry type: $line" ;;
    esac
  done <<< "$VERBOSE_LISTING"
}

check_release_json() {
  local release_json version
  release_json="$(tar -xOzf "$PACKAGE_PATH" ./release.json 2>/dev/null || tar -xOzf "$PACKAGE_PATH" release.json 2>/dev/null || true)"
  if [[ -z "$release_json" ]]; then
    fail_check "release.json is missing"
    return
  fi

  if ! command -v node >/dev/null 2>&1; then
    ok "release.json exists; node not found, skipped JSON validation"
    return
  fi

  version="$(RELEASE_JSON="$release_json" node -e '
const data = JSON.parse(process.env.RELEASE_JSON || "{}");
if (typeof data.version === "string") process.stdout.write(data.version);
' 2>/dev/null || true)"

  if [[ "$version" =~ $SEMVER_PATTERN ]]; then
    ok "release.json version: $version"
  else
    fail_check "release.json version must be semver"
  fi
}

check_sql_locations() {
  local matches
  matches="$(printf '%s\n' "$LISTING" | grep -E '\.sql$' | grep -Ev '^(server/src/db/[^/]+\.sql|server/src/migrations/[^/]+\.sql)$' || true)"
  if [[ -n "$matches" ]]; then
    fail_check "SQL files must stay under server/src/db or server/src/migrations:"
    printf '%s\n' "$matches" | sed 's/^/[FAIL] - /' >&2
  else
    ok "SQL location check passed"
  fi
}

printf '[inspect-release] checking package: %s\n' "$PACKAGE_PATH"

check_archive_entries

require_entry "release.json" '^release\.json$'
require_entry "docs" '^docs(/|$)'
require_entry "scripts/build-release.sh" '^scripts/build-release\.sh$'
require_entry "scripts/inspect-release.sh" '^scripts/inspect-release\.sh$'
require_entry "server/package.json" '^server/package\.json$'
require_entry "server/package-lock.json" '^server/package-lock\.json$'
require_entry "server/tsconfig.json" '^server/tsconfig\.json$'
require_entry "server/eslint.config.mjs" '^server/eslint\.config\.mjs$'
require_entry "server/.env.example" '^server/\.env\.example$'
require_entry "server/.env.production.example" '^server/\.env\.production\.example$'
require_entry "server/src" '^server/src(/|$)'
require_entry "server/src/db" '^server/src/db(/|$)'
require_entry "server/src/migrations" '^server/src/migrations(/|$)'
require_entry "server/scripts" '^server/scripts(/|$)'
require_entry "server/test" '^server/test(/|$)'
require_entry "admin-web/package.json" '^admin-web/package\.json$'
require_entry "admin-web/package-lock.json" '^admin-web/package-lock\.json$'
require_entry "admin-web/tsconfig.json" '^admin-web/tsconfig\.json$'
require_entry "admin-web/eslint.config.js" '^admin-web/eslint\.config\.js$'
require_entry "admin-web/vite.config.ts" '^admin-web/vite\.config\.ts$'
require_entry "admin-web/index.html" '^admin-web/index\.html$'
require_entry "admin-web/src" '^admin-web/src(/|$)'

check_release_json

forbid "dist" '(^|/)dist(/|$)'
forbid "node_modules" '(^|/)node_modules(/|$)'
forbid "real env files" '(^|/)\.env($|\.installed$|\.local$|\.production$|\.development$)'
forbid "runtime data" '(^|/)(uploads|logs|backups|update-packages)(/|$)'
forbid "git/codex local files" '(^|/)(\.git|\.codex-qa|\.release-staging)(/|$)|(^|/)codex[^/]*(/|$)'
forbid "local archives" '(^|/).*\.(zip|tar\.gz|tgz)$'
forbid "keys/certs/dumps/databases" '(^|/).*\.(pem|key|crt|cert|dump|sqlite|sqlite3|db|p12|pfx|jks|keystore|sql\.gz)$'
forbid "temporary files" '(^|/)(.*\.tmp|.*\.temp|.*\.cache|.*\.bak|.*\.swp|.*~|\.DS_Store)$'

check_sql_locations

if [[ "$FAILED" == "1" ]]; then
  printf '[FAIL] release package inspection failed\n' >&2
  exit 1
fi

printf '[OK] release package inspection passed\n'
