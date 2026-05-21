#!/usr/bin/env bash

set -euo pipefail

ARTIFACTS_DIR="${1:-build-artifacts}"
PRODUCT_NAME="${2:-LokSystem}"
VERSION="${3:-1.0.0}"

rm -rf "$ARTIFACTS_DIR"
mkdir -p "$ARTIFACTS_DIR/windows-build-x64"
mkdir -p "$ARTIFACTS_DIR/windows-build-arm64"
mkdir -p "$ARTIFACTS_DIR/macos-build-x64"
mkdir -p "$ARTIFACTS_DIR/macos-build-arm64"
mkdir -p "$ARTIFACTS_DIR/linux-build-x64"
mkdir -p "$ARTIFACTS_DIR/linux-build-arm64"

# Windows x64
touch "$ARTIFACTS_DIR/windows-build-x64/${PRODUCT_NAME}-${VERSION}-win-x64.exe"
cat > "$ARTIFACTS_DIR/windows-build-x64/latest.yml" <<EOF
version: ${VERSION}
files:
  - url: ${PRODUCT_NAME}-${VERSION}-win-x64.exe
    sha512: fake-sha512-x64
    size: 100000
path: ${PRODUCT_NAME}-${VERSION}-win-x64.exe
sha512: fake-sha512-x64
releaseDate: '2025-01-01'
EOF

# Windows arm64
touch "$ARTIFACTS_DIR/windows-build-arm64/${PRODUCT_NAME}-${VERSION}-win-arm64.exe"
cat > "$ARTIFACTS_DIR/windows-build-arm64/latest.yml" <<EOF
version: ${VERSION}
files:
  - url: ${PRODUCT_NAME}-${VERSION}-win-arm64.exe
    sha512: fake-sha512-arm64
    size: 100000
path: ${PRODUCT_NAME}-${VERSION}-win-arm64.exe
sha512: fake-sha512-arm64
releaseDate: '2025-01-01'
EOF

# macOS x64
touch "$ARTIFACTS_DIR/macos-build-x64/${PRODUCT_NAME}-${VERSION}-mac-x64.dmg"
touch "$ARTIFACTS_DIR/macos-build-x64/${PRODUCT_NAME}-${VERSION}-mac-x64.zip"
cat > "$ARTIFACTS_DIR/macos-build-x64/latest-mac.yml" <<EOF
version: ${VERSION}
files:
  - url: ${PRODUCT_NAME}-${VERSION}-mac-x64.dmg
    sha512: fake-sha512-mac-x64
    size: 200000
EOF

# macOS arm64
touch "$ARTIFACTS_DIR/macos-build-arm64/${PRODUCT_NAME}-${VERSION}-mac-arm64.dmg"
touch "$ARTIFACTS_DIR/macos-build-arm64/${PRODUCT_NAME}-${VERSION}-mac-arm64.zip"
cat > "$ARTIFACTS_DIR/macos-build-arm64/latest-mac.yml" <<EOF
version: ${VERSION}
files:
  - url: ${PRODUCT_NAME}-${VERSION}-mac-arm64.dmg
    sha512: fake-sha512-mac-arm64
    size: 200000
EOF

# Linux x64
touch "$ARTIFACTS_DIR/linux-build-x64/${PRODUCT_NAME}-${VERSION}-linux-x64.deb"
cat > "$ARTIFACTS_DIR/linux-build-x64/latest-linux.yml" <<EOF
version: ${VERSION}
files:
  - url: ${PRODUCT_NAME}-${VERSION}-linux-x64.deb
    sha512: fake-sha512-linux
    size: 300000
EOF

# Linux arm64
touch "$ARTIFACTS_DIR/linux-build-arm64/${PRODUCT_NAME}-${VERSION}-linux-arm64.deb"
cat > "$ARTIFACTS_DIR/linux-build-arm64/latest-linux-arm64.yml" <<EOF
version: ${VERSION}
files:
  - url: ${PRODUCT_NAME}-${VERSION}-linux-arm64.deb
    sha512: fake-sha512-linux-arm64
    size: 300000
EOF

echo "Mock artifacts created in $ARTIFACTS_DIR:"
find "$ARTIFACTS_DIR" -type f | sort
