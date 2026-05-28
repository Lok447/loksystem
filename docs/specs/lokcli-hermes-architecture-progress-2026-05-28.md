# LokCLI / Hermes Migration Progress - 2026-05-28

## Completed This Round

- Unified the Guid page provider-backed model selection to LokCLI and `lokcli.defaultModel`.
- Unified the Guid send/create path so provider-backed LokCLI sessions create `type: 'lokcli'` conversations through one branch.
- Removed the main new-user split between `gemini` and `aionrs` in the first-use LokCLI path.
- Updated channel settings UI to prefer `LokCliModelSelector` naming.
- Defaulted new channel-side LokCLI agent selections to `hermes` instead of `aionrs`.
- Normalized legacy `gemini` conversations to `lokcli` during storage-side compatibility normalization.
- Updated channel settings sync so provider-backed LokCLI changes now propagate model updates to `lokcli` conversations first, while still covering legacy `gemini` and `aionrs` rows for compatibility.
- Updated team model resolution so `lokcli` and `hermes` use the same provider-backed model list path as the current LokCLI main flow.
- Cleaned one Guid selector variable name to reduce Gemini-era naming leakage on the current LokCLI path.
- Updated channel settings forms so legacy saved `gemini` selections now hydrate back to `hermes`, and LokCLI-compatible selections no longer echo raw `gemini/aionrs/hermes` backend names in the main dropdown button.
- Tightened team page naming so `lokcli/aionrs/gemini` are treated explicitly as LokCLI-compatible conversation shells in the UI layer.
- Kept renderer build green after the changes.

## Verification

- Passed: `npm run build:renderer:web`

## Remaining Follow-up

- Continue shrinking `aionrs` naming and type bridges in process/channel compatibility layers.
- Decide whether to narrow more runtime compatibility branches after the current `lokcli/hermes` defaults stay stable for one more pass.
- Clean up leftover `Aionrs*` internal implementation names when the compatibility window can be narrowed further.

## Notes

- The main migration guide file `docs/specs/lokcli-hermes-architecture-migration.zh-CN.md` currently contains encoding issues in the existing content, so this progress note is recorded separately to keep follow-up edits safe.
