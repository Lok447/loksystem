/**
 * @license
 * Copyright 2025 LokSystem (loksystem.com)
 * SPDX-License-Identifier: Apache-2.0
 */

# LokSystem Core Service

`src/process/core` is the business-domain boundary for the main-process backend.

## Module boundaries

- `auth/`: authentication session lifecycle, password flow, token-related orchestration
- `uploads/`: upload path resolution, sanitization, persistence orchestration
- `sessions/`: conversation/session orchestration and session-facing runtime commands
- `tasks/`: worker task facade and runtime lifecycle orchestration
- `acp/`: ACP agent discovery, health, mode/model/config facade
- `workspaces/`: workspace tree queries and workspace search progress events
- `shared/`: contracts, shared errors, event schema, event bus

## Rules

- Core services should not depend on renderer code.
- Core services should prefer domain contracts from `shared/` over transport-layer response types.
- Bridge, web routes, and standalone startup code should behave as adapters over core services.
- New cross-module events should be added to `shared/CoreEvent.ts` before being emitted.

## Current scope of M1

- Core directory skeleton exists.
- Shared contracts and event schema are defined centrally.
- Existing bridge entry points remain compatible while delegating inward to core services.
