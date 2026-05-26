# Core Client Contract Skeleton

This is the M5 preparation layer only. It documents the shared backend contract without replacing
Electron IPC, adding `/api/core/*` routes, or changing renderer call sites yet.

## Scope Guard

- M4 remains the active implementation track for ACP Gateway lifecycle and event unification.
- M5 work in this phase is limited to contract naming, DTO reuse, and adapter boundaries.
- Renderer migration, HTTP route expansion, and IPC replacement are out of scope until M4 stabilizes.

## Proposed Modules

```text
CoreClient
  auth
  uploads
  sessions
  tasks
  acp
  workspaces
  events
```

## Transport Mapping

- Electron desktop: existing IPC bridge delegates to core services.
- Standalone/WebUI: `/api/core/*` routes delegate through the same `CoreClientContract`.
- Future shared client: call the same DTO contracts from `src/process/core/shared/CoreContracts.ts`.

## Current M5 Skeleton

- `CoreBackendServices` creates one shared core service graph for desktop IPC today and future
  HTTP/client adapters later.
- `src/process/adapters/coreClient` defines a transport-neutral client contract and an in-process adapter.
- Existing bridges keep their public IPC shape but can now share the same service instances.
- The active in-process client is registered via `registerCoreClient()` so late-bound transports
  such as WebUI startup can attach without rebuilding their own service graph.

## ACP Contract Baseline

The first M5-compatible ACP DTO is `CoreAcpSessionSnapshotDto`:

- `conversationId`
- `exists`
- `runtime`
- `persisted`
- `mode`
- `modelInfo`
- `configOptions`

This snapshot is intentionally transport-neutral and can be returned through IPC, HTTP, or a future
client SDK without reshaping.

## In-process Adapter

`createInProcessCoreClient(coreServices)` is the first implementation of the contract:

- It delegates sessions/tasks/acp reads to `CoreBackendServices`.
- It exposes `events.subscribe()` over `coreEventBus`.
- It does not import IPC, Express, renderer code, or HTTP response types.

## Electron Adapter

`initCoreElectronClientAdapter(client)` wraps any `CoreClientContract` implementation behind the
desktop IPC bridge:

- It registers parallel `ipcBridge.core.*` providers for session runtime, task runtime, and ACP
  session snapshots.
- It mirrors `client.events.subscribe()` into `core.events.stream`.
- It is intentionally additive: existing `conversation.*` and `acp.*` channels remain the primary
  renderer path until the core contract has broader renderer coverage.

## HTTP Adapter

`registerCoreHttpClientAdapter(app, { client })` exposes the same contract to WebUI/standalone
server routes:

- `GET /api/core/sessions/runtime`
- `GET /api/core/sessions/runtime/:conversationId`
- `GET /api/core/tasks/runtime`
- `GET /api/core/tasks/runtime/:conversationId`
- `GET /api/core/acp/sessions/:conversationId`
- `GET /api/core/workspaces/tree`

`registerApiRoutes(app, { coreClient })` mounts these routes behind the existing WebUI API token
middleware. When no client is registered, the legacy WebUI routes keep their previous behavior.

## Renderer Facade

`getRendererCoreClient()` provides a migration-safe renderer entry point:

- Desktop runtime delegates to `ipcBridge.core.*`.
- Web runtime delegates to `/api/core/*` with existing cookie credentials.
- Event subscriptions delegate to `core.events.stream`, which is mirrored from `coreEventBus` in
  both desktop and standalone/WebUI runtime.
- Existing renderer call sites are not migrated yet; this facade is the safe seam for future
  feature-flagged adoption.

## Renderer Migration Status

The first renderer call sites have been migrated to `getRendererCoreClient()`:

- Workspace tree reads in the Workspace panel, lazy tree loading, temporary workspace migration, and
  conversation export now use `workspaces.getTree()`.
- ACP model/config/mode initial reads now use `acp.getSessionSnapshot()`.
- Workspace search progress and ACP tool-call workspace refresh now consume `events.subscribe()`
  instead of legacy workspace/ACP stream-specific bridge providers.
- ACP writes (`setModel`, `setMode`, `setConfigOption`) and non-migrated business stream consumers
  still use existing bridge channels until each path is moved behind the core event contract.
