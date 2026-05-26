/**
 * @license
 * Copyright 2025 LokSystem (loksystem.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { getDatabase } from '@process/services/database';
import type { AcpSessionRow } from '@process/services/database/IAcpSessionRepository';
import { SqliteAcpSessionRepository } from '@process/services/database/SqliteAcpSessionRepository';

export type CoreAcpSessionRecordStatus = AcpSessionRow['session_status'];

export class CoreAcpSessionRepository {
  public static async get(conversationId: string): Promise<AcpSessionRow | null> {
    const repo = await this.tryGetRepository();
    return repo?.getSession(conversationId) ?? null;
  }

  public static async upsert(params: {
    conversationId: string;
    backend?: string;
    agentSource?: string;
    agentId?: string;
    sessionId?: string | null;
    status?: CoreAcpSessionRecordStatus;
    config?: Record<string, unknown>;
  }): Promise<void> {
    const repo = await this.tryGetRepository();
    if (!repo) {
      return;
    }

    const previous = repo.getSession(params.conversationId);
    const now = Date.now();
    repo.upsertSession({
      conversation_id: params.conversationId,
      agent_backend: params.backend ?? previous?.agent_backend ?? 'unknown',
      agent_source: params.agentSource ?? previous?.agent_source ?? 'core',
      agent_id: params.agentId ?? previous?.agent_id ?? params.conversationId,
      session_id: params.sessionId ?? previous?.session_id ?? null,
      session_status: params.status ?? previous?.session_status ?? 'idle',
      session_config: JSON.stringify({
        ...this.parseConfig(previous?.session_config),
        ...(params.config ?? {}),
      }),
      last_active_at: now,
      suspended_at: params.status === 'suspended' ? now : params.status ? null : previous?.suspended_at ?? null,
    });
  }

  public static async updateStatus(
    conversationId: string,
    status: CoreAcpSessionRecordStatus,
    suspendedAt?: number | null
  ): Promise<void> {
    const repo = await this.tryGetRepository();
    if (!repo) {
      return;
    }
    if (!repo.getSession(conversationId)) {
      await this.upsert({ conversationId, status });
      return;
    }
    repo.updateStatus(conversationId, status, suspendedAt ?? (status === 'suspended' ? Date.now() : null));
  }

  private static async tryGetRepository(): Promise<SqliteAcpSessionRepository | null> {
    try {
      const db = await getDatabase();
      return new SqliteAcpSessionRepository(db.getDriver());
    } catch {
      return null;
    }
  }

  private static parseConfig(value?: string | null): Record<string, unknown> {
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
}
