#!/usr/bin/env bash

set -euo pipefail

OUTPUT_DIR="${1:-release-assets}"
PRODUCT_NAME="${2:-LokSystem}"
ERRORS=0

fail() {
  echo "FAIL: $*"
  ERRORS=$((ERRORS + 1))
}

pass() {
  echo "PASS: $*"
}

require_file() {
  local file_path="$1"
  if [ ! -f "$file_path" ]; then
    fail "missing file: ${file_path#$OUTPUT_DIR/}"
    return 1
  fi
  pass "found ${file_path#$OUTPUT_DIR/}"
  return 0
}

extract_yaml_scalar() {
  local key="$1"
  local yaml_file="$2"
  grep -E "^${key}:" "$yaml_file" | head -n 1 | sed -E "s/^${key}:[[:space:]]*//"
}

extract_ref_file() {
  local metadata_file="$1"
  local ref
  ref=$(grep -E '^path:' "$metadata_file" | head -n 1 | sed -E 's/^path:[[:space:]]*//')
  if [ -z "$ref" ]; then
    ref=$(grep -E '^[[:space:]]*-?[[:space:]]*url:' "$metadata_file" | head -n 1 | sed -E 's/^[[:space:]]*-?[[:space:]]*url:[[:space:]]*//')
  fi
  echo "$ref"
}

assert_metadata_file() {
  local metadata_name="$1"
  local expected_pattern="$2"
  local metadata_path="$OUTPUT_DIR/$metadata_name"

  require_file "$metadata_path" || return

  local version ref_file asset_path
  version=$(extract_yaml_scalar "version" "$metadata_path")
  ref_file=$(extract_ref_file "$metadata_path")

  if [ -z "$version" ]; then
    fail "$metadata_name is missing a version field"
  fi

  if [ -z "$ref_file" ]; then
    fail "$metadata_name has no path/url entry"
    return
  fi

  if [[ ! "$ref_file" =~ ^${PRODUCT_NAME}-${version}- ]]; then
    fail "$metadata_name references unexpected product asset: $ref_file"
  fi

  if [[ ! "$ref_file" =~ $expected_pattern ]]; then
    fail "$metadata_name points to unexpected target: $ref_file"
  fi

  asset_path="$OUTPUT_DIR/$ref_file"
  if [ ! -f "$asset_path" ]; then
    fail "$metadata_name references missing file: $ref_file"
    return
  fi

  pass "$metadata_name -> $ref_file"
}

find_single_match() {
  local pattern="$1"
  local label="$2"
  mapfile -t matches < <(find "$OUTPUT_DIR" -maxdepth 1 -type f -regextype posix-extended -regex ".*/${pattern}" | sort)
  if [ "${#matches[@]}" -eq 0 ]; then
    fail "missing distributable for ${label}"
    return
  fi
  if [ "${#matches[@]}" -gt 1 ]; then
    fail "multiple distributables found for ${label}: $(printf '%s ' "${matches[@]##*/}")"
    return
  fi
  pass "${label} distributable: ${matches[0]##*/}"
}

assert_metadata_file "latest.yml" '(win-(x64|amd64)|win32-(x64|amd64)|windows-(x64|amd64)).*\.(exe|msi|zip)$'
assert_metadata_file "latest-mac.yml" '(mac-(x64|amd64|arm64)|darwin-(x64|amd64|arm64)).*\.(dmg|zip)$'
assert_metadata_file "latest-linux.yml" '(linux-(x64|amd64)).*\.(deb|AppImage|rpm|zip)$'
assert_metadata_file "latest-linux-arm64.yml" '(linux-(arm64|aarch64)).*\.(deb|AppImage|rpm|zip)$'
assert_metadata_file "latest-win-arm64.yml" '(win-arm64|win32-arm64|windows-arm64).*\.(exe|msi|zip)$'
assert_metadata_file "latest-arm64-mac.yml" '(mac-arm64|darwin-arm64).*\.(dmg|zip)$'

find_single_match "${PRODUCT_NAME}-[0-9][^/]*-win-(x64|amd64)\\.(exe|msi)" "Windows x64 installer"
find_single_match "${PRODUCT_NAME}-[0-9][^/]*-win-arm64\\.(exe|msi)" "Windows arm64 installer"
find_single_match "${PRODUCT_NAME}-[0-9][^/]*-mac-(x64|amd64)\\.dmg" "macOS x64 installer"
find_single_match "${PRODUCT_NAME}-[0-9][^/]*-mac-arm64\\.dmg" "macOS arm64 installer"
find_single_match "${PRODUCT_NAME}-[0-9][^/]*-linux-(x64|amd64)\\.deb" "Linux x64 installer"
find_single_match "${PRODUCT_NAME}-[0-9][^/]*-linux-arm64\\.deb" "Linux arm64 installer"

echo ""
if [ "$ERRORS" -gt 0 ]; then
  echo "FAILED: $ERRORS error(s) found"
  exit 1
fi

echo "ALL CHECKS PASSED"
