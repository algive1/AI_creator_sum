#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd -P "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"
PROJECT_ROOT="$(cd -P "$SCRIPT_DIR/.." >/dev/null 2>&1 && pwd)"
VERSION="${1:-}"
SEMVER_PATTERN='^(0|[1-9][0-9]*)\.([0-9]|[1-9][0-9]*)\.([0-9]|[1-9][0-9]*)(-[0-9A-Za-z-]+(\.[0-9A-Za-z-]+)*)?(\+[0-9A-Za-z-]+(\.[0-9A-Za-z-]+)*)?$'

STAGING_ROOT="${RELEASE_STAGING_ROOT:-${TMPDIR:-/tmp}/ai-creator-release}"
STAGING_DIR=""
PACKAGE_PATH=""

log() {
  printf '[build-release] %s\n' "$*"
}

fail() {
  printf '[build-release] ERROR: %s\n' "$*" >&2
  exit 1
}

usage() {
  cat <<'USAGE'
Usage:
  bash scripts/build-release.sh 1.0.3

Creates:
  ai-creator-release-<version>.tar.gz
USAGE
}

cleanup() {
  if [[ -n "${STAGING_DIR:-}" && -d "$STAGING_DIR" ]]; then
    rm -rf "$STAGING_DIR" || true
  fi
}
trap cleanup EXIT

require_file() {
  [[ -f "$1" ]] || fail "required file not found: $1"
}

require_dir() {
  [[ -d "$1" ]] || fail "required directory not found: $1"
}

copy_file() {
  local source="$1"
  local target="$2"
  require_file "$source"
  mkdir -p "$(dirname "$target")"
  cp "$source" "$target"
}

copy_dir() {
  local source="$1"
  local target="$2"
  require_dir "$source"
  mkdir -p "$(dirname "$target")"
  cp -R "$source" "$target"
}

copy_optional_dir() {
  if [[ -d "$1" ]]; then
    copy_dir "$1" "$2"
  fi
}

validate_args() {
  if [[ "$#" -ne 1 ]]; then
    usage
    exit 1
  fi

  if [[ ! "$VERSION" =~ $SEMVER_PATTERN ]]; then
    fail "version must be semver, for example 1.0.3; got: $VERSION"
  fi

  STAGING_DIR="$STAGING_ROOT/ai-creator-release-$VERSION"
  PACKAGE_PATH="$PROJECT_ROOT/ai-creator-release-$VERSION.tar.gz"
}

run_build_checks() {
  local run_tmp="$STAGING_DIR/.tmp"
  mkdir -p "$run_tmp"

  log "checking admin-web lint and build"
  (cd "$STAGING_DIR/admin-web" && TMPDIR="$run_tmp" TMP="$run_tmp" TEMP="$run_tmp" npm ci --include=dev && TMPDIR="$run_tmp" TMP="$run_tmp" TEMP="$run_tmp" npm run lint && TMPDIR="$run_tmp" TMP="$run_tmp" TEMP="$run_tmp" npm run build)

  log "checking server lint, encoding and build"
  (cd "$STAGING_DIR/server" && TMPDIR="$run_tmp" TMP="$run_tmp" TEMP="$run_tmp" npm ci --include=dev && TMPDIR="$run_tmp" TMP="$run_tmp" TEMP="$run_tmp" npm run lint && TMPDIR="$run_tmp" TMP="$run_tmp" TEMP="$run_tmp" npm run check:encoding && TMPDIR="$run_tmp" TMP="$run_tmp" TEMP="$run_tmp" npm run build)
}

remove_build_artifacts() {
  rm -rf "$STAGING_DIR/admin-web/node_modules" "$STAGING_DIR/admin-web/dist"
  rm -rf "$STAGING_DIR/server/node_modules" "$STAGING_DIR/server/dist"
  rm -rf "$STAGING_DIR/.tmp"
  find "$STAGING_DIR" -name '*.tsbuildinfo' -type f -delete
}

write_release_json() {
  local build_time
  build_time="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
  cat > "$STAGING_DIR/release.json" <<EOF
{
  "version": "$VERSION",
  "packageType": "server-admin",
  "buildTime": "$build_time",
  "name": "AI Creator",
  "description": "AI Creator server and admin source release"
}
EOF
}

stage_release() {
  log "staging release files"
  rm -rf "$STAGING_DIR"
  mkdir -p "$STAGING_DIR"

  write_release_json

  copy_dir "$PROJECT_ROOT/docs" "$STAGING_DIR/docs"
  copy_file "$PROJECT_ROOT/scripts/build-release.sh" "$STAGING_DIR/scripts/build-release.sh"
  copy_file "$PROJECT_ROOT/scripts/inspect-release.sh" "$STAGING_DIR/scripts/inspect-release.sh"

  copy_file "$PROJECT_ROOT/server/package.json" "$STAGING_DIR/server/package.json"
  copy_file "$PROJECT_ROOT/server/package-lock.json" "$STAGING_DIR/server/package-lock.json"
  copy_file "$PROJECT_ROOT/server/tsconfig.json" "$STAGING_DIR/server/tsconfig.json"
  copy_file "$PROJECT_ROOT/server/eslint.config.mjs" "$STAGING_DIR/server/eslint.config.mjs"
  copy_file "$PROJECT_ROOT/server/.env.example" "$STAGING_DIR/server/.env.example"
  copy_file "$PROJECT_ROOT/server/.env.production.example" "$STAGING_DIR/server/.env.production.example"
  copy_dir "$PROJECT_ROOT/server/src" "$STAGING_DIR/server/src"
  copy_dir "$PROJECT_ROOT/server/scripts" "$STAGING_DIR/server/scripts"
  copy_optional_dir "$PROJECT_ROOT/server/test" "$STAGING_DIR/server/test"

  copy_file "$PROJECT_ROOT/admin-web/package.json" "$STAGING_DIR/admin-web/package.json"
  copy_file "$PROJECT_ROOT/admin-web/package-lock.json" "$STAGING_DIR/admin-web/package-lock.json"
  copy_file "$PROJECT_ROOT/admin-web/tsconfig.json" "$STAGING_DIR/admin-web/tsconfig.json"
  copy_file "$PROJECT_ROOT/admin-web/eslint.config.js" "$STAGING_DIR/admin-web/eslint.config.js"
  copy_file "$PROJECT_ROOT/admin-web/vite.config.ts" "$STAGING_DIR/admin-web/vite.config.ts"
  copy_file "$PROJECT_ROOT/admin-web/index.html" "$STAGING_DIR/admin-web/index.html"
  copy_dir "$PROJECT_ROOT/admin-web/src" "$STAGING_DIR/admin-web/src"
  copy_optional_dir "$PROJECT_ROOT/admin-web/public" "$STAGING_DIR/admin-web/public"

  find "$STAGING_DIR" -name '.DS_Store' -type f -delete
}

create_package() {
  command -v tar >/dev/null 2>&1 || fail "tar is required"
  rm -f "$PACKAGE_PATH"
  log "creating $PACKAGE_PATH"
  (cd "$STAGING_DIR" && tar -czf "$PACKAGE_PATH" .)
}

inspect_package() {
  log "inspecting package"
  bash "$SCRIPT_DIR/inspect-release.sh" "$PACKAGE_PATH"
}

print_done() {
  local size_human
  size_human="$(du -h "$PACKAGE_PATH" | awk '{print $1}')"
  log "done: $PACKAGE_PATH"
  log "size: $size_human"
  log "upload target: /www/wwwroot/ai-creator/update-packages"
}

main() {
  cd "$PROJECT_ROOT"
  validate_args "$@"
  stage_release
  run_build_checks
  remove_build_artifacts
  create_package
  inspect_package
  print_done
}

main "$@"
