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
- Updated new `lokcli` conversation payloads so they now persist `backend=hermes`, `agentName=LokCLI`, and provider-backed current model metadata on the conversation record.
- Switched the primary `lokcli` task factory path from `LokCliManager -> AionrsManager` toward `AcpAgentManager + backend=hermes`, while keeping legacy `aionrs` conversation records on the compatibility path.
- Warmup/runtime service now treats `lokcli` tasks as ACP-capable during the transition so the current session/runtime tooling remains usable.
- Added a dedicated `LokCliAcpManager` wrapper so Hermes-backed LokCLI sessions keep `task.type = 'lokcli'` instead of collapsing back to generic `acp` in runtime state/events.
- Updated ACP-side persistence hooks so Hermes-backed `lokcli` conversations now persist `currentModelId`, `sessionMode`, cached config options, context usage, and ACP session id through the same mainline path, instead of only allowing `type: 'acp'`.
- Added a LokCLI renderer shared adapter layer so the LokCLI page path no longer directly re-exports `Aionrs*` component names, even while the compatibility implementation is still reused underneath.
- Tightened team recovery and team empty-state resolution so legacy `gemini/aionrs/lokcli` shells prefer `backend=hermes` as the recovered LokCLI runtime identity.
- Reduced runtime metadata leakage from legacy `aionrs` in ACP discovery: Hermes remains the LokCLI runtime key on the main path, and legacy `aionrs` is no longer treated as the primary team-capable runtime branch there.
- Started the LokCLI/Hermes shared-runtime serviceization path by introducing a Hermes shared ACP client factory for LokCLI conversations, instead of always creating a fresh Hermes process per LokCLI session.
- Added bundled Hermes runtime version metadata readout plus persisted `acpRuntimeVersion` markers so LokCLI can drop stale resume session ids after packaged runtime upgrades.
- Tightened LokCLI product-facing runtime branding on the main path: Hermes native skills directory now points at `.loksystem/skills`, Hermes runtime env now exports `LOKCLI_*` and `LOKSYSTEM_*` brand markers, and first-turn LokCLI instructions now prefer LokCLI / LokSystem self-identification.
- Added a focused shared-runtime unit test for the LokCLI/Hermes path, covering one-runtime reuse across multiple clients, per-session update routing, proxy-owned session cleanup, and shared runtime disconnect fan-out.
- Cleaned the highest-visibility LokCLI wording in settings and channel configuration flows so default agent labels, headings, and provider guidance now consistently render `LokCLI` instead of `Lok CLI`.
- Updated the team/session fallback provider error text to `LokCLI`, and removed one stale `aionrs-temp` comment from the main team session path.
- Removed `bundled-aionrs` from the default desktop packaging resources so shipped installers now only carry the Hermes-backed LokCLI runtime by default.
- Kept renderer build green after the changes.

## Verification

- Passed: `npm run build:renderer:web`
- Passed: `npx vitest run tests/unit/process/acp/compat/HermesSharedRuntimeService.test.ts`

## Remaining Follow-up

- Verify the updated `lokcli -> hermes ACP` task path with build/runtime checks and patch any remaining `lokcli`-specific UI/runtime assumptions that still expect `AionrsManager` behavior.
- Verify multi-conversation Hermes runtime reuse, permission routing, and shared-process disconnect recovery on the new LokCLI shared-client path.
- Continue shrinking `aionrs` naming and type bridges in process/channel compatibility layers.
- Move from “new LokCLI uses Hermes ACP, legacy rows still compatible” toward removing `bundled-aionrs` from the default packaged runtime path.
- Clean up leftover `Aionrs*` internal implementation names when the compatibility window can be narrowed further.

## Notes

- The main migration guide file `docs/specs/lokcli-hermes-architecture-migration.zh-CN.md` currently contains encoding issues in the existing content, so this progress note is recorded separately to keep follow-up edits safe.
