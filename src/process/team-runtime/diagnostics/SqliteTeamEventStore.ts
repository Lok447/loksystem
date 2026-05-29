import { uuid } from '@/common/utils';
import { getDatabase } from '@process/services/database';
import type { ISqliteDriver } from '@process/services/database/drivers/ISqliteDriver';
import { ensureTeamRuntimeDiagnosticsSchema } from './sqliteSchema';
import type { ITeamEventStore } from './storeTypes';
import type { TeamRuntimeEvent } from './types';

type TeamRuntimeEventRow = {
  id: string;
  team_id: string;
  event_type: TeamRuntimeEvent['type'];
  event_level: TeamRuntimeEvent['level'];
  message: string;
  details: string | null;
  created_at: number;
};

type SqliteTeamEventStoreParams = {
  driver?: ISqliteDriver;
  maxEventsPerTeam?: number;
};

export class SqliteTeamEventStore implements ITeamEventStore {
  private readonly driver: ISqliteDriver | undefined;
  private readonly maxEventsPerTeam: number;

  constructor(params: SqliteTeamEventStoreParams = {}) {
    this.driver = params.driver;
    this.maxEventsPerTeam = params.maxEventsPerTeam ?? 100;
  }

  private async getDb(): Promise<ISqliteDriver> {
    if (this.driver) return this.driver;
    return (await getDatabase()).getDriver();
  }

  async append(teamId: string, event: Omit<TeamRuntimeEvent, 'id' | 'teamId'>): Promise<TeamRuntimeEvent> {
    const storedEvent: TeamRuntimeEvent = {
      id: uuid(12),
      teamId,
      ...event,
    };
    const db = await this.getDb();
    ensureTeamRuntimeDiagnosticsSchema(db);
    db.prepare(
      `INSERT INTO team_runtime_events (id, team_id, event_type, event_level, message, details, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      storedEvent.id,
      storedEvent.teamId,
      storedEvent.type,
      storedEvent.level,
      storedEvent.message,
      storedEvent.details ? JSON.stringify(storedEvent.details) : null,
      storedEvent.at
    );
    db.prepare(
      `DELETE FROM team_runtime_events
       WHERE team_id = ?
         AND id NOT IN (
           SELECT id
           FROM team_runtime_events
           WHERE team_id = ?
           ORDER BY created_at DESC, id DESC
           LIMIT ?
         )`
    ).run(teamId, teamId, this.maxEventsPerTeam);
    return storedEvent;
  }

  async list(teamId: string): Promise<TeamRuntimeEvent[]> {
    const db = await this.getDb();
    ensureTeamRuntimeDiagnosticsSchema(db);
    const rows = db
      .prepare(
        `SELECT id, team_id, event_type, event_level, message, details, created_at
         FROM team_runtime_events
         WHERE team_id = ?
         ORDER BY created_at ASC, id ASC`
      )
      .all(teamId) as TeamRuntimeEventRow[];
    return rows.map((row) => ({
      id: row.id,
      teamId: row.team_id,
      at: row.created_at,
      type: row.event_type,
      level: row.event_level,
      message: row.message,
      details: row.details ? this.parseDetails(row.details) : undefined,
    }));
  }

  async clear(teamId: string): Promise<void> {
    const db = await this.getDb();
    ensureTeamRuntimeDiagnosticsSchema(db);
    db.prepare('DELETE FROM team_runtime_events WHERE team_id = ?').run(teamId);
  }

  private parseDetails(raw: string): Record<string, unknown> | undefined {
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : undefined;
    } catch {
      return undefined;
    }
  }
}
