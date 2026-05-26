/**
 * @license
 * Copyright 2025 LokSystem (loksystem.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ProcessConfig } from '@process/utils/initStorage';
import { getDatabase } from '@process/services/database';
import type { ISqliteDriver } from '@process/services/database/drivers/ISqliteDriver';
import type {
  CoreTaskRuntimeRecordDto,
  CoreTaskRuntimeRecordState,
  CoreTaskRuntimeStateDto,
} from '@process/core/shared/CoreContracts';

const TASK_RUNTIME_RECORDS_KEY = 'core.taskRuntime.records';
const MAX_TASK_RUNTIME_RECORDS = 500;

type RuntimeRecordMap = Record<string, CoreTaskRuntimeRecordDto>;
type RuntimeRecordRow = {
  conversation_id: string;
  task_type?: string | null;
  state: CoreTaskRuntimeRecordState;
  workspace?: string | null;
  created_at: number;
  updated_at: number;
  last_activity_at?: number | null;
  last_event?: string | null;
  last_reason?: string | null;
  metadata?: string | null;
};

export class CoreTaskRuntimeRecordRepository {
  public static async get(conversationId: string): Promise<CoreTaskRuntimeRecordDto | null> {
    const db = await this.tryGetDriver();
    if (db) {
      this.ensureTable(db);
      const row = db
        .prepare('SELECT * FROM core_task_runtime_records WHERE conversation_id = ?')
        .get(conversationId) as RuntimeRecordRow | undefined;
      if (row) {
        return this.rowToRecord(row);
      }

      const configRecord = (await this.readConfigRecords())[conversationId];
      if (configRecord) {
        this.upsertSqliteRecord(db, configRecord);
        return configRecord;
      }
    }

    return (await this.readConfigRecords())[conversationId] ?? null;
  }

  public static async list(): Promise<CoreTaskRuntimeRecordDto[]> {
    const db = await this.tryGetDriver();
    if (db) {
      this.ensureTable(db);
      const rows = db
        .prepare('SELECT * FROM core_task_runtime_records ORDER BY updated_at DESC')
        .all() as RuntimeRecordRow[];
      const records = rows.map((row) => this.rowToRecord(row)).filter((record): record is CoreTaskRuntimeRecordDto => {
        return record !== null;
      });
      if (records.length > 0) {
        return records;
      }

      const configRecords = Object.values(await this.readConfigRecords()).sort((a, b) => b.updatedAt - a.updatedAt);
      for (const record of configRecords) {
        this.upsertSqliteRecord(db, record);
      }
      return configRecords;
    }

    return Object.values(await this.readConfigRecords()).sort((a, b) => b.updatedAt - a.updatedAt);
  }

  public static async recordRuntimeEvent(params: {
    conversationId: string;
    event: string;
    runtime?: CoreTaskRuntimeStateDto | null;
    reason?: string;
    metadata?: Record<string, unknown>;
  }): Promise<CoreTaskRuntimeRecordDto> {
    const records = await this.readConfigRecords();
    const now = Date.now();
    const db = await this.tryGetDriver();
    if (db) {
      this.ensureTable(db);
    }

    const previous = db
      ? (this.rowToRecord(
          db
            .prepare('SELECT * FROM core_task_runtime_records WHERE conversation_id = ?')
            .get(params.conversationId) as RuntimeRecordRow | undefined
        ) ?? records[params.conversationId])
      : records[params.conversationId];
    const next: CoreTaskRuntimeRecordDto = {
      conversationId: params.conversationId,
      taskType: params.runtime?.type ?? previous?.taskType,
      state: this.resolveRecordState(params.event, params.runtime),
      workspace: params.runtime?.workspace ?? previous?.workspace,
      createdAt: previous?.createdAt ?? now,
      updatedAt: now,
      lastActivityAt: params.runtime?.lastActivityAt ?? previous?.lastActivityAt,
      lastEvent: params.event,
      lastReason: params.reason,
      metadata: {
        ...(previous?.metadata ?? {}),
        ...(params.metadata ?? {}),
      },
    };

    if (db) {
      this.upsertSqliteRecord(db, next);
      return next;
    }

    records[params.conversationId] = next;
    await this.writeConfigRecords(this.pruneRecords(records));
    return next;
  }

  private static async readConfigRecords(): Promise<RuntimeRecordMap> {
    const records = await ProcessConfig.get(TASK_RUNTIME_RECORDS_KEY).catch((): undefined => undefined);
    if (!records || typeof records !== 'object' || Array.isArray(records)) {
      return {};
    }
    return records as RuntimeRecordMap;
  }

  private static async writeConfigRecords(records: RuntimeRecordMap): Promise<void> {
    await ProcessConfig.set(TASK_RUNTIME_RECORDS_KEY, records);
  }

  private static async tryGetDriver(): Promise<ISqliteDriver | null> {
    try {
      return (await getDatabase()).getDriver();
    } catch {
      return null;
    }
  }

  private static ensureTable(db: ISqliteDriver): void {
    db.exec(`CREATE TABLE IF NOT EXISTS core_task_runtime_records (
      conversation_id TEXT PRIMARY KEY,
      task_type TEXT,
      state TEXT NOT NULL,
      workspace TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      last_activity_at INTEGER,
      last_event TEXT,
      last_reason TEXT,
      metadata TEXT NOT NULL DEFAULT '{}'
    )`);
    db.exec('CREATE INDEX IF NOT EXISTS idx_core_task_runtime_state ON core_task_runtime_records(state, updated_at)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_core_task_runtime_updated ON core_task_runtime_records(updated_at DESC)');
  }

  private static upsertSqliteRecord(db: ISqliteDriver, record: CoreTaskRuntimeRecordDto): void {
    db.prepare(
      `INSERT INTO core_task_runtime_records (
        conversation_id,
        task_type,
        state,
        workspace,
        created_at,
        updated_at,
        last_activity_at,
        last_event,
        last_reason,
        metadata
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(conversation_id) DO UPDATE SET
        task_type = excluded.task_type,
        state = excluded.state,
        workspace = excluded.workspace,
        updated_at = excluded.updated_at,
        last_activity_at = excluded.last_activity_at,
        last_event = excluded.last_event,
        last_reason = excluded.last_reason,
        metadata = excluded.metadata`
    ).run(
      record.conversationId,
      record.taskType ?? null,
      record.state,
      record.workspace ?? null,
      record.createdAt,
      record.updatedAt,
      record.lastActivityAt ?? null,
      record.lastEvent ?? null,
      record.lastReason ?? null,
      JSON.stringify(record.metadata ?? {})
    );
  }

  private static rowToRecord(row: RuntimeRecordRow | undefined): CoreTaskRuntimeRecordDto | null {
    if (!row) {
      return null;
    }

    return {
      conversationId: row.conversation_id,
      taskType: row.task_type ? (row.task_type as CoreTaskRuntimeRecordDto['taskType']) : undefined,
      state: row.state,
      workspace: row.workspace ?? undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      lastActivityAt: row.last_activity_at ?? undefined,
      lastEvent: row.last_event ?? undefined,
      lastReason: row.last_reason ?? undefined,
      metadata: this.parseMetadata(row.metadata),
    };
  }

  private static parseMetadata(value?: string | null): Record<string, unknown> {
    if (!value) {
      return {};
    }
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }

  private static resolveRecordState(
    event: string,
    runtime?: CoreTaskRuntimeStateDto | null
  ): CoreTaskRuntimeRecordState {
    if (event === 'built') return 'created';
    if (event === 'warmed') return runtime?.status ?? 'running';
    if (event === 'stopped') return 'stopped';
    if (event === 'killed') return 'killed';
    if (event === 'cleared') return 'cleared';
    if (runtime?.status) return runtime.status;
    return 'unknown';
  }

  private static pruneRecords(records: RuntimeRecordMap): RuntimeRecordMap {
    const entries = Object.entries(records).sort(([, a], [, b]) => b.updatedAt - a.updatedAt);
    return Object.fromEntries(entries.slice(0, MAX_TASK_RUNTIME_RECORDS));
  }
}
