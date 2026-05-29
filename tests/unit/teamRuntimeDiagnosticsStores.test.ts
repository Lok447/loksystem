import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BetterSqlite3Driver } from '@process/services/database/drivers/BetterSqlite3Driver';
import { runMigrations } from '@process/services/database/migrations';
import { CURRENT_DB_VERSION, initSchema } from '@process/services/database/schema';
import { SqliteTeamEventStore } from '@process/team-runtime/diagnostics/SqliteTeamEventStore';
import { SqliteTeamRuntimeSnapshotStore } from '@process/team-runtime/diagnostics/SqliteTeamRuntimeSnapshotStore';
import type { TeamRuntimeSnapshot } from '@process/team-runtime/diagnostics';

let nativeModuleAvailable = true;
try {
  const d = new BetterSqlite3Driver(':memory:');
  d.close();
} catch (e) {
  if (e instanceof Error && e.message.includes('NODE_MODULE_VERSION')) {
    nativeModuleAvailable = false;
  }
}

const describeOrSkip = nativeModuleAvailable ? describe : describe.skip;

describeOrSkip('Team runtime diagnostics SQLite stores', () => {
  let driver: BetterSqlite3Driver;

  beforeEach(() => {
    driver = new BetterSqlite3Driver(':memory:');
    initSchema(driver);
    runMigrations(driver, 0, CURRENT_DB_VERSION);
    driver
      .prepare(
        `INSERT INTO users (id, username, password_hash, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run('user-1', 'testuser', 'hash', 1000, 1000);
    driver
      .prepare(
        `INSERT INTO teams (
          id, user_id, name, workspace, workspace_mode, lead_agent_id, agents,
          orchestration_mode, execution_engine, session_mode, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        'team-1',
        'user-1',
        'Diagnostics Team',
        '/workspace',
        'shared',
        'slot-lead',
        '[]',
        'legacy_mailbox',
        'legacy_mailbox',
        null,
        1000,
        1000
      );
  });

  afterEach(() => {
    driver.close();
  });

  it('persists runtime events and trims to the configured max size', async () => {
    const store = new SqliteTeamEventStore({ driver, maxEventsPerTeam: 2 });

    await store.append('team-1', {
      at: 1001,
      type: 'routing_selected',
      level: 'info',
      message: 'Routing selected',
      details: { engine: 'legacy_mailbox' },
    });
    await store.append('team-1', {
      at: 1002,
      type: 'session_started',
      level: 'info',
      message: 'Started',
    });
    await store.append('team-1', {
      at: 1003,
      type: 'diagnostics_refreshed',
      level: 'info',
      message: 'Refreshed',
    });

    await expect(store.list('team-1')).resolves.toEqual([
      expect.objectContaining({
        at: 1002,
        type: 'session_started',
        message: 'Started',
      }),
      expect.objectContaining({
        at: 1003,
        type: 'diagnostics_refreshed',
        message: 'Refreshed',
      }),
    ]);
  });

  it('persists and restores the latest runtime snapshot', async () => {
    const store = new SqliteTeamRuntimeSnapshotStore({ driver });
    const snapshot: TeamRuntimeSnapshot = {
      teamId: 'team-1',
      capturedAt: 1005,
      executionInfo: {
        teamId: 'team-1',
        executionKind: 'legacy_mailbox',
        orchestrationMode: 'legacy_mailbox',
        state: 'running',
      },
      degradedMembers: [
        {
          slotId: 'slot-worker',
          agentName: 'Worker',
          reason: 'feature_flag_off',
        },
      ],
      taskDiagnostics: {
        pending: 1,
        inProgress: 1,
        completed: 0,
        waiting: [
          {
            taskId: 'task-1',
            subject: 'Blocked task',
            blockedBy: ['task-0'],
            owner: 'slot-worker',
          },
        ],
      },
      protocolDiagnostics: {
        activeOwners: [
          {
            ownerId: 'slot-worker',
            taskCount: 1,
            taskIds: ['task-1'],
          },
        ],
        ownership: [
          {
            taskId: 'task-1',
            subject: 'Blocked task',
            owner: 'slot-worker',
            previousOwner: 'slot-lead',
            ownershipStatus: 'reassigned',
            taskStatus: 'pending',
            updatedAt: 1005,
            workerBackend: 'codex',
            leaderSummary: 'Leader reassigned Blocked task to Worker.',
            recoveryHint: 'Replay protocol coordination if the worker crashes again.',
            recoveryAction: 'replay_protocol_coordination',
            recoveryMode: 'protocol_replay',
          },
        ],
        recentRecovery: [
          {
            taskId: 'task-1',
            slotId: 'slot-worker',
            owner: 'slot-worker',
            workerBackend: 'codex',
            recoveryAction: 'replay_protocol_coordination',
            recoveryMode: 'protocol_replay',
            leaderSummary: 'Worker needs a recovery-ready handoff.',
            recoveryHint: 'Replay before reassigning.',
            updatedAt: 1005,
            sourceEventType: 'protocol_reassigned',
          },
        ],
        leaderSummaries: [
          {
            eventId: 'evt-summary',
            at: 1005,
            slotId: 'slot-worker',
            taskId: 'task-1',
            summary: 'Leader reassigned Blocked task to Worker.',
          },
        ],
      },
      timeline: [
        {
          id: 'evt-1',
          teamId: 'team-1',
          at: 1004,
          type: 'session_started',
          level: 'info',
          message: 'Started',
        },
      ],
    };

    await store.set(snapshot);

    await expect(store.get('team-1')).resolves.toEqual(snapshot);
  });
});
