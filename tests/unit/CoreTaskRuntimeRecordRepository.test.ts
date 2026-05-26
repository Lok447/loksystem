/**
 * @license
 * Copyright 2025 LokSystem (loksystem.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGetDatabase, mockProcessConfigGet, mockProcessConfigSet } = vi.hoisted(() => ({
  mockProcessConfigGet: vi.fn(),
  mockProcessConfigSet: vi.fn(),
  mockGetDatabase: vi.fn(),
}));

vi.mock('@process/utils/initStorage', () => ({
  ProcessConfig: {
    get: mockProcessConfigGet,
    set: mockProcessConfigSet,
  },
}));

vi.mock('@process/services/database', () => ({
  getDatabase: mockGetDatabase,
}));

import { CoreTaskRuntimeRecordRepository } from '@process/core/tasks';

function createMockDriver() {
  const rows = new Map<string, Record<string, unknown>>();
  return {
    exec: vi.fn(),
    prepare: vi.fn((sql: string) => {
      if (sql.includes('SELECT * FROM core_task_runtime_records WHERE conversation_id = ?')) {
        return {
          get: vi.fn((conversationId: string) => rows.get(conversationId)),
        };
      }
      if (sql.includes('SELECT * FROM core_task_runtime_records ORDER BY updated_at DESC')) {
        return {
          all: vi.fn(() => [...rows.values()].sort((a, b) => Number(b.updated_at) - Number(a.updated_at))),
        };
      }
      if (sql.includes('INSERT INTO core_task_runtime_records')) {
        return {
          run: vi.fn(
            (
              conversationId: string,
              taskType: string | null,
              state: string,
              workspace: string | null,
              createdAt: number,
              updatedAt: number,
              lastActivityAt: number | null,
              lastEvent: string | null,
              lastReason: string | null,
              metadata: string
            ) => {
              rows.set(conversationId, {
                conversation_id: conversationId,
                task_type: taskType,
                state,
                workspace,
                created_at: createdAt,
                updated_at: updatedAt,
                last_activity_at: lastActivityAt,
                last_event: lastEvent,
                last_reason: lastReason,
                metadata,
              });
              return { changes: 1, lastInsertRowid: 1 };
            }
          ),
        };
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    }),
    pragma: vi.fn(),
    transaction: vi.fn((fn: (...args: unknown[]) => unknown) => fn),
    close: vi.fn(),
    rows,
  };
}

describe('CoreTaskRuntimeRecordRepository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetDatabase.mockRejectedValue(new Error('database unavailable'));
    mockProcessConfigGet.mockResolvedValue({});
    mockProcessConfigSet.mockResolvedValue(undefined);
  });

  it('creates a durable placeholder record from a runtime event', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1000);

    await expect(
      CoreTaskRuntimeRecordRepository.recordRuntimeEvent({
        conversationId: 'conv-1',
        event: 'built',
        runtime: {
          id: 'conv-1',
          type: 'acp',
          status: 'pending',
          workspace: '/workspace',
          lastActivityAt: 900,
          isActive: true,
        },
      })
    ).resolves.toEqual({
      conversationId: 'conv-1',
      taskType: 'acp',
      state: 'created',
      workspace: '/workspace',
      createdAt: 1000,
      updatedAt: 1000,
      lastActivityAt: 900,
      lastEvent: 'built',
      lastReason: undefined,
      metadata: {},
    });

    expect(mockProcessConfigSet).toHaveBeenCalledWith('core.taskRuntime.records', {
      'conv-1': expect.objectContaining({
        conversationId: 'conv-1',
        state: 'created',
      }),
    });
  });

  it('updates an existing record while preserving createdAt and previous metadata', async () => {
    mockProcessConfigGet.mockResolvedValue({
      'conv-1': {
        conversationId: 'conv-1',
        taskType: 'acp',
        state: 'created',
        workspace: '/workspace',
        createdAt: 1000,
        updatedAt: 1000,
        metadata: { first: true },
      },
    });
    vi.spyOn(Date, 'now').mockReturnValue(2000);

    await CoreTaskRuntimeRecordRepository.recordRuntimeEvent({
      conversationId: 'conv-1',
      event: 'message_sent',
      runtime: {
        id: 'conv-1',
        type: 'acp',
        status: 'running',
        workspace: '/workspace',
        lastActivityAt: 1900,
        isActive: true,
      },
      metadata: { fileCount: 2 },
    });

    expect(mockProcessConfigSet).toHaveBeenCalledWith('core.taskRuntime.records', {
      'conv-1': expect.objectContaining({
        createdAt: 1000,
        updatedAt: 2000,
        state: 'running',
        lastEvent: 'message_sent',
        metadata: {
          first: true,
          fileCount: 2,
        },
      }),
    });
  });

  it('returns sorted records and handles unreadable config as empty storage', async () => {
    mockProcessConfigGet.mockRejectedValue(new Error('missing config'));

    await expect(CoreTaskRuntimeRecordRepository.list()).resolves.toEqual([]);
  });

  it('uses SQLite when the database is available', async () => {
    const driver = createMockDriver();
    mockGetDatabase.mockResolvedValue({ getDriver: () => driver });
    vi.spyOn(Date, 'now').mockReturnValue(3000);

    await CoreTaskRuntimeRecordRepository.recordRuntimeEvent({
      conversationId: 'conv-sqlite',
      event: 'message_sent',
      runtime: {
        id: 'conv-sqlite',
        type: 'aionrs',
        status: 'running',
        workspace: '/workspace',
        lastActivityAt: 2900,
        isActive: true,
      },
      metadata: { fileCount: 1 },
    });

    expect(mockProcessConfigSet).not.toHaveBeenCalled();
    await expect(CoreTaskRuntimeRecordRepository.get('conv-sqlite')).resolves.toMatchObject({
      conversationId: 'conv-sqlite',
      taskType: 'aionrs',
      state: 'running',
      metadata: { fileCount: 1 },
    });
  });

  it('lazily migrates legacy ProcessConfig records into SQLite on read', async () => {
    const driver = createMockDriver();
    mockGetDatabase.mockResolvedValue({ getDriver: () => driver });
    mockProcessConfigGet.mockResolvedValue({
      'conv-legacy': {
        conversationId: 'conv-legacy',
        taskType: 'acp',
        state: 'created',
        workspace: '/legacy',
        createdAt: 1000,
        updatedAt: 1200,
        metadata: { legacy: true },
      },
    });

    await expect(CoreTaskRuntimeRecordRepository.get('conv-legacy')).resolves.toMatchObject({
      conversationId: 'conv-legacy',
      state: 'created',
      metadata: { legacy: true },
    });
    expect(driver.rows.has('conv-legacy')).toBe(true);
  });
});
