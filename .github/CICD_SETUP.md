# CI/CD Setup Guide

This repository ships with a GitHub Actions release pipeline for `LokSystem`.
Use this document as the single reference for local validation, GitHub secrets,
and the release flow.

## Workflow Overview

### `build-and-release.yml`

Triggered by:

- pushes to `dev`
- pushed tags

What it does:

1. runs the reusable build pipeline
2. builds all supported desktop targets
3. normalizes updater metadata with `scripts/prepare-release-assets.sh`
4. creates a draft GitHub Release with the packaged assets

### `_build-reusable.yml`

Shared build workflow used by CI:

- code quality checks
- platform matrix builds
- packaged Bun verification
- artifact upload

### `release-distribute.yml`

Triggered when a GitHub Release is published, or manually via `workflow_dispatch`.

What it does:

1. downloads release assets from GitHub Releases
2. guards against same-version overwrite
3. uploads the final release payload to the configured distribution bucket

### `pr-checks.yml`

Runs pull-request safety checks, including the mock release-asset validation path:

1. `scripts/create-mock-release-artifacts.sh`
2. `scripts/prepare-release-assets.sh`
3. `scripts/verify-release-assets.sh`

## Required Secrets

Configure these in GitHub repository settings.

### Repository secrets

- `GH_TOKEN` - token with permission to create tags and draft releases
- `AWS_REGION` - release distribution region
- `AWS_ROLE_ARN` - role assumed by `release-distribute.yml`
- `AWS_S3_BUCKET` - destination bucket for published assets

### Optional macOS signing / notarization secrets

- `APPLE_ID`
- `APPLE_ID_PASSWORD`
- `TEAM_ID`
- `IDENTITY`

If these are not configured, macOS signing or notarization steps may be skipped
or fail depending on the workflow branch being used.

## Local Release Validation

Run this checklist before pushing a release candidate:

```bash
npm test
npm run lint -- --format json
npm run package
```

To validate the release-asset normalization path locally:

```bash
bash scripts/create-mock-release-artifacts.sh build-artifacts LokSystem 1.0.0
bash scripts/prepare-release-assets.sh build-artifacts release-assets
bash scripts/verify-release-assets.sh release-assets LokSystem
```

## Recommended Release Flow

1. make sure `dev` contains the exact code you want to ship
2. run the local validation steps above
3. bump the version locally with `npm version patch|minor|major|prerelease`
4. push the version commit and tag
5. let `build-and-release.yml` produce the draft release
6. review the generated assets and notes
7. publish the GitHub Release
8. let `release-distribute.yml` mirror the final assets

## Release Asset Contract

The release scripts assume:

- canonical updater metadata exists:
  - `latest.yml`
  - `latest-mac.yml`
  - `latest-linux.yml`
  - `latest-linux-arm64.yml`
- arch-specific updater metadata exists:
  - `latest-win-arm64.yml`
  - `latest-arm64-mac.yml`
- distributable filenames use the `LokSystem-<version>-<platform>-<arch>` prefix

If artifact naming changes, update both:

- `scripts/create-mock-release-artifacts.sh`
- `scripts/verify-release-assets.sh`

## Repository Hygiene

Do not commit packaged installers into the Git history.

- keep `out/` local-only
- keep `INSTALL-WINDOWS-X64/` as a pointer directory with docs only
- upload `.exe`, `.zip`, `.msi`, `.dmg`, `.deb`, and updater metadata through GitHub Releases
- treat GitHub Release assets as the canonical download channel for end users

## Troubleshooting

### Draft release created without expected assets

Check:

- `_build-reusable.yml` uploaded the correct files from `out/`
- `scripts/prepare-release-assets.sh` copied the expected metadata and installers
- filenames still match the `LokSystem-*` contract

### Distribution upload refused

`release-distribute.yml` rejects same-version overwrites by design. Create a new
version instead of republishing an existing one.

### Tag or release creation failed

Check:

- `GH_TOKEN` exists and has the expected repository permissions
- the pushed tag matches the intended version
- the workflow ran from the correct branch or tag event
