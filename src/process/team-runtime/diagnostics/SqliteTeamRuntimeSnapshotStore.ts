import type { TeamExecutionInfo } from '../ITeamExecutionSession';
import { getDatabase } from '@process/services/database';
import type { ISqliteDriver } from '@process/services/database/drivers/ISqliteDriver';
import { ensureTeamRuntimeDiagnosticsSchema } from './sqliteSchema';
import type { ITeamRuntimeSnapshotStore } from './storeTypes';
import type { TeamProtocolDiagnostics, TeamRuntimeEvent, TeamRuntimeSnapshot, TeamTaskDiagnostics } from './types';

type TeamRuntimeSnapshotRow = {
  team_id: string;
  execution_info: string;
  degraded_members: string;
  task_diagnostics: string;
  protocol_diagnostics?: string;
  timeline: string;
  captured_at: number;
};

type SqliteTeamRuntimeSnapshotStoreParams = {
  driver?: ISqliteDriver;
};

export class SqliteTeamRuntimeSnapshotStore implements ITeamRuntimeSnapshotStore {
  private readonly driver: ISqliteDriver | undefined;

  constructor(params: SqliteTeamRuntimeSnapshotStoreParams = {}) {
    this.driver = params.driver;
  }

  private async getDb(): Promise<ISqliteDriver> {
    if (this.driver) return this.driver;
    return (await getDatabase()).getDriver();
  }

  async set(snapshot: TeamRuntimeSnapshot): Promise<void> {
    const db = await this.getDb();
    ensureTeamRuntimeDiagnosticsSchema(db);
    db.prepare(
      `INSERT INTO team_runtime_snapshots (
        team_id,
        execution_info,
        degraded_members,
        task_diagnostics,
        protocol_diagnostics,
        timeline,
        captured_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(team_id) DO UPDATE SET
        execution_info = excluded.execution_info,
        degraded_members = excluded.degraded_members,
        task_diagnostics = excluded.task_diagnostics,
        protocol_diagnostics = excluded.protocol_diagnostics,
        timeline = excluded.timeline,
        captured_at = excluded.captured_at,
        updated_at = excluded.updated_at`
    ).run(
      snapshot.teamId,
      JSON.stringify(snapshot.executionInfo),
      JSON.stringify(snapshot.degradedMembers),
      JSON.stringify(snapshot.taskDiagnostics),
      JSON.stringify(snapshot.protocolDiagnostics),
      JSON.stringify(snapshot.timeline),
      snapshot.capturedAt,
      Date.now()
    );
  }

  async get(teamId: string): Promise<TeamRuntimeSnapshot | null> {
    const db = await this.getDb();
    ensureTeamRuntimeDiagnosticsSchema(db);
    const row = db
      .prepare(
        `SELECT team_id, execution_info, degraded_members, task_diagnostics, protocol_diagnostics, timeline, captured_at
         FROM team_runtime_snapshots
         WHERE team_id = ?`
      )
      .get(teamId) as TeamRuntimeSnapshotRow | undefined;
    if (!row) return null;

    return {
      teamId: row.team_id,
      capturedAt: row.captured_at,
      executionInfo: this.parseJson<TeamExecutionInfo>(row.execution_info, {
        teamId: row.team_id,
        executionKind: 'legacy_mailbox',
        orchestrationMode: 'legacy_mailbox',
        state: 'created',
      }),
      degradedMembers: this.parseJson<TeamRuntimeSnapshot['degradedMembers']>(row.degraded_members, []),
      taskDiagnostics: this.parseJson<TeamTaskDiagnostics>(row.task_diagnostics, {
        pending: 0,
        inProgress: 0,
        completed: 0,
        waiting: [],
      }),
      protocolDiagnostics: this.parseJson<TeamProtocolDiagnostics>(row.protocol_diagnostics ?? '{}', {
        activeOwners: [],
        ownership: [],
        recentRecovery: [],
        leaderSummaries: [],
      }),
      timeline: this.parseJson<TeamRuntimeEvent[]>(row.timeline, []),
    };
  }

  async clear(teamId: string): Promise<void> {
    const db = await this.getDb();
    ensureTeamRuntimeDiagnosticsSchema(db);
    db.prepare('DELETE FROM team_runtime_snapshots WHERE team_id = ?').run(teamId);
  }

  private parseJson<T>(raw: string, fallback: T): T {
    try {
      return JSON.parse(raw) as T;
    } catch {
      return fallback;
    }
  }
}
