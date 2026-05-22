# Build and Release Scripts

This directory contains the local utilities used to build, package, and verify
`LokSystem`.

## Core Build Scripts

| Script | Purpose |
| --- | --- |
| `build-with-builder.js` | Coordinates Electron builds across platforms |
| `rebuildNativeModules.js` | Unified native module rebuild helper |
| `beforeBuild.js` | Pre-packaging native module rebuild hook |
| `afterPack.js` | Post-packaging verification and cleanup |
| `afterSign.js` | macOS signing and notarization hook |

## Release Asset Scripts

| Script | Purpose |
| --- | --- |
| `create-mock-release-artifacts.sh` | Generates mock LokSystem release artifacts for CI or local smoke tests |
| `prepare-release-assets.sh` | Normalizes platform artifacts into a deterministic `release-assets/` directory |
| `verify-release-assets.sh` | Validates updater metadata and required LokSystem distributables |

## Native Module Rebuild Flow

`rebuildNativeModules.js` is the shared implementation behind the platform hooks.

- `beforeBuild.js` rebuilds source-tree native modules before packaging
- `afterPack.js` performs packaged-app verification and Linux-specific follow-up
- `afterSign.js` handles macOS signing or notarization concerns after packaging

Typical local packaging commands:

```bash
npm run dist:mac
npm run dist:win
npm run dist:linux
```

## Release Asset Flow

The release pipeline expects artifact names to follow the `LokSystem-<version>-<platform>-<arch>` convention.

Packaged installers are release assets, not source-controlled repository files.
Keep `INSTALL-WINDOWS-X64/` for human-readable guidance only, and publish the
actual `.exe` / `.zip` / `.msi` payloads via GitHub Releases.

Local smoke test:

```bash
bash scripts/create-mock-release-artifacts.sh build-artifacts LokSystem 1.0.0
bash scripts/prepare-release-assets.sh build-artifacts release-assets
bash scripts/verify-release-assets.sh release-assets LokSystem
```

What these scripts check:

- canonical updater metadata exists:
  - `latest.yml`
  - `latest-mac.yml`
  - `latest-linux.yml`
  - `latest-linux-arm64.yml`
- arch-specific updater metadata exists:
  - `latest-win-arm64.yml`
  - `latest-arm64-mac.yml`
- metadata points to real `LokSystem-*` assets
- Windows, macOS, and Linux installers all exist for the expected architectures

## Troubleshooting

### Native module missing after packaging

Check:

1. the module is included in `electron-builder.yml`
2. the module is unpacked when required
3. `beforeBuild.js` completed successfully
4. Linux follow-up logic in `afterPack.js` completed successfully

### Release asset validation failed

Check:

1. build outputs still use the `LokSystem-*` filename convention
2. updater metadata points to files that actually exist in `release-assets/`
3. the architecture-specific metadata files were preserved during normalization

## Related Files

- `C:\tmp\loksystem-fork-sync\electron-builder.yml`
- `C:\tmp\loksystem-fork-sync\package.json`
- `C:\tmp\loksystem-fork-sync\.github\workflows\build-and-release.yml`
- `C:\tmp\loksystem-fork-sync\.github\workflows\release-distribute.yml`
- `C:\tmp\loksystem-fork-sync\.github\CICD_SETUP.md`
