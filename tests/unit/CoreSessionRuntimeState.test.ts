/**
 * @license
 * Copyright 2025 LokSystem (loksystem.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockEmit } = vi.hoisted(() => ({
  mockEmit: vi.fn(),
}));

vi.mock('@process/core/shared/CoreEventBus', () => ({
  coreEventBus: {
    emit: mockEmit,
  },
}));

vi.mock('@process/task/AcpSkillManager', () => ({
  AcpSkillManager: {
    getInstance: vi.fn(() => ({
      discoverSkills: vi.fn(async () => {}),
      getSkillsIndex: vi.fn(() => []),
    })),
  },
}));

vi.mock('@process/bridge/migrationUtils', () => ({
  migrateConversationToDatabase: vi.fn(async () => {}),
}));

vi.mock('@process/utils/initStorage', () => ({
  ProcessChat: {
    get: vi.fn(async () => []),
  },
}));

vi.mock('@process/utils/openclawUtils', () => ({
  computeOpenClawIdentityHash: vi.fn(async () => null),
}));

import { CoreSessionService } from '@process/core/sessions';
import type { TChatConversation } from '@/common/config/storage';
import type { IConversationService } from '@process/services/IConversationService';

function makeConversation(overrides: Partial<TChatConversation> = {}): TChatConversation {
  return {
    id: 'conv-1',
    type: 'acp',
    name: 'Conversation',
    createTime: 100,
    modifyTime: 200,
    source: 'loksystem',
    extra: {
      workspace: '/workspace',
      backend: 'codex',
    },
    status: 'finished',
    ...overrides,
  } as TChatConversation;
}

function makeConversationService(conversations: TChatConversation[]): IConversationService {
  return {
    createConversation: vi.fn(),
    deleteConversation: vi.fn(),
    updateConversation: vi.fn(),
    getConversation: vi.fn(async (id: string) => conversations.find((conversation) => conversation.id === id)),
    createWithMigration: vi.fn(),
    listAllConversations: vi.fn(async () => conversations),
    getConversationsByCronJob: vi.fn(async () => []),
  } as unknown as IConversationService;
}

describe('CoreSessionService runtime state', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('combines persisted conversation metadata with task runtime state', async () => {
    const conversation = makeConversation();
    const taskRuntimeService = {
      getTask: vi.fn(() => ({ status: 'running' })),
      getRuntimeOverview: vi.fn(async () => ({
        conversationId: 'conv-1',
        runtime: {
          id: 'conv-1',
          type: 'acp',
          status: 'running',
          workspace: '/workspace',
          lastActivityAt: 123,
          isActive: true,
        },
        record: {
          conversationId: 'conv-1',
          state: 'running',
          createdAt: 100,
          updatedAt: 150,
        },
      })),
    };
    const service = new CoreSessionService(
      makeConversationService([conversation]),
      taskRuntimeService as never
    );

    await expect(service.getSessionRuntimeState('conv-1')).resolves.toEqual({
      conversationId: 'conv-1',
      exists: true,
      type: 'acp',
      source: 'loksystem',
      workspace: '/workspace',
      status: 'running',
      runtime: expect.objectContaining({ id: 'conv-1', isActive: true }),
      record: expect.objectContaining({ conversationId: 'conv-1', state: 'running' }),
      persistedAt: 200,
    });
  });

  it('returns a non-existing session state when only runtime lookup is available', async () => {
    const taskRuntimeService = {
      getTask: vi.fn(() => undefined),
      getRuntimeOverview: vi.fn(async () => ({
        conversationId: 'missing',
        runtime: null,
        record: null,
      })),
    };
    const service = new CoreSessionService(makeConversationService([]), taskRuntimeService as never);

    await expect(service.getSessionRuntimeState('missing')).resolves.toEqual({
      conversationId: 'missing',
      exists: false,
      status: 'finished',
      runtime: null,
      record: null,
    });
  });

  it('lists runtime states for persisted conversations', async () => {
    const conversations = [
      makeConversation({ id: 'conv-1', modifyTime: 200 }),
      makeConversation({ id: 'conv-2', modifyTime: 300, extra: { workspace: '/other', backend: 'codex' } }),
    ];
    const taskRuntimeService = {
      getTask: vi.fn(() => undefined),
      listRuntimeOverviews: vi.fn(async () => [
        {
          conversationId: 'conv-2',
          runtime: {
            id: 'conv-2',
            type: 'acp',
            status: 'pending',
            workspace: '/other',
            lastActivityAt: 456,
            isActive: true,
          },
          record: {
            conversationId: 'conv-2',
            state: 'pending',
            createdAt: 1,
            updatedAt: 2,
          },
        },
      ]),
    };
    const service = new CoreSessionService(makeConversationService(conversations), taskRuntimeService as never);

    await expect(service.listSessionRuntimeStates()).resolves.toEqual([
      expect.objectContaining({
        conversationId: 'conv-1',
        status: 'finished',
        runtime: null,
        record: null,
        persistedAt: 200,
      }),
      expect.objectContaining({
        conversationId: 'conv-2',
        status: 'pending',
        runtime: expect.objectContaining({ id: 'conv-2' }),
        record: expect.objectContaining({ state: 'pending' }),
        persistedAt: 300,
      }),
    ]);
  });
});
