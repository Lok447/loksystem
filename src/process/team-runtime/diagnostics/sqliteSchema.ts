import type { ISqliteDriver } from '@process/services/database/drivers/ISqliteDriver';

export function ensureTeamRuntimeDiagnosticsSchema(db: ISqliteDriver): void {
  db.exec(`CREATE TABLE IF NOT EXISTS team_runtime_events (
    id TEXT PRIMARY KEY,
    team_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    event_level TEXT NOT NULL,
    message TEXT NOT NULL,
    details TEXT,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE
  )`);
  db.exec('CREATE INDEX IF NOT EXISTS idx_team_runtime_events_team_created ON team_runtime_events(team_id, created_at)');

  db.exec(`CREATE TABLE IF NOT EXISTS team_runtime_snapshots (
    team_id TEXT PRIMARY KEY,
    execution_info TEXT NOT NULL,
    degraded_members TEXT NOT NULL,
    task_diagnostics TEXT NOT NULL,
    protocol_diagnostics TEXT NOT NULL DEFAULT '{}',
    timeline TEXT NOT NULL,
    captured_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE
  )`);
  db.exec(
    'CREATE INDEX IF NOT EXISTS idx_team_runtime_snapshots_updated ON team_runtime_snapshots(updated_at DESC)'
  );

  const snapshotColumns = new Set((db.pragma('table_info(team_runtime_snapshots)') as Array<{ name: string }>).map((c) => c.name));
  if (!snapshotColumns.has('protocol_diagnostics')) {
    db.exec(`ALTER TABLE team_runtime_snapshots ADD COLUMN protocol_diagnostics TEXT NOT NULL DEFAULT '{}'`);
  }
}
