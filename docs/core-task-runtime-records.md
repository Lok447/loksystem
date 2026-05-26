# Core Task Runtime Records

This document tracks the M3 migration path from in-memory task runtime state to the durable
`core_task_runtime_records` table.

## Current Storage

M3 now persists normalized runtime records in SQLite table `core_task_runtime_records`.

The previous placeholder store remains as a compatibility fallback under:

```text
core.taskRuntime.records
```

The repository reads/writes SQLite when the database is available. If the database is unavailable
early in startup or inside isolated tests, it falls back to `ProcessConfig`. Existing placeholder
records are lazily copied into SQLite on first read/write.

## Runtime Record Shape

The current DTO is `CoreTaskRuntimeRecordDto`:

- `conversationId`: conversation/task identity.
- `taskType`: agent runtime type when known.
- `state`: normalized state such as `created`, `pending`, `running`, `finished`, `stopped`, `killed`, `cleared`, or `unknown`.
- `workspace`: runtime workspace when known.
- `createdAt`: first record timestamp.
- `updatedAt`: last runtime update timestamp.
- `lastActivityAt`: latest runtime activity timestamp when known.
- `lastEvent`: latest core runtime event action.
- `lastReason`: kill/stop reason when available.
- `metadata`: small event-specific metadata such as status, file count, confirmation IDs, or config.

## SQLite Table

```sql
CREATE TABLE IF NOT EXISTS core_task_runtime_records (
  conversation_id TEXT PRIMARY KEY,
  task_type TEXT,
  state TEXT NOT NULL,
  workspace TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  last_activity_at INTEGER,
  last_event TEXT,
  last_reason TEXT,
  metadata TEXT
);

CREATE INDEX IF NOT EXISTS idx_core_task_runtime_state
  ON core_task_runtime_records(state, updated_at);

CREATE INDEX IF NOT EXISTS idx_core_task_runtime_updated
  ON core_task_runtime_records(updated_at DESC);
```

`metadata` should be JSON text. The repository should keep the same DTO contract so callers do
not change if the storage backend evolves again.

## Completed Migration Steps

1. Added database migration v27 for `core_task_runtime_records`.
2. Kept `CoreTaskRuntimeRecordRepository` as the stable DTO boundary.
3. Added lazy migration from `ProcessConfig['core.taskRuntime.records']` into SQLite.
4. Kept the config key as a fallback for environments where the DB is unavailable.

## Remaining Follow-up

Add cleanup/pruning policy for old finished records once retention requirements are clear.
