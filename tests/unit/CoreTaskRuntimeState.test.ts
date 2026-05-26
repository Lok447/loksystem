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

vi.mock('@process/task/AcpAgentManager', () => ({
  default: class MockAcpAgentManager {},
}));

vi.mock('@process/task/AionrsManager', () => ({
  AionrsApprovalStore: {
    createKeysFromConfirmation: vi.fn(() => []),
  },
  AionrsManager: class MockAionrsManager {},
}));

vi.mock('@process/task/agentUtils', () => ({
  prepareFirstMessage: vi.fn(async (input: string) => input),
}));

vi.mock('@process/utils/initStorage', () => ({
  getBuiltinSkillsCopyDir: vi.fn(() => '/builtin-skills'),
  getSkillsDir: vi.fn(() => '/user-skills'),
  ProcessConfig: {
    get: vi.fn(async () => ({})),
    set: vi.fn(async () => undefined),
  },
}));

import { CoreTaskRuntimeService } from '@process/core/tasks';
import type { IAgentManager } from '@process/task/IAgentManager';
import type { IWorkerTaskManager } from '@process/task/IWorkerTaskManager';

function makeTask(overrides: Partial<IAgentManager> = {}): IAgentManager {
  return {
    type: 'acp',
    status: 'running',
    workspace: '/workspace',
    conversation_id: 'conv-1',
    lastActivityAt: 123,
    sendMessage: vi.fn(async () => {}),
    stop: vi.fn(async () => {}),
    confirm: vi.fn(),
    getConfirmations: vi.fn(() => []),
    kill: vi.fn(),
    ...overrides,
  };
}

function makeWorkerTaskManager(task: IAgentManager | undefined): IWorkerTaskManager {
  return {
    getTask: vi.fn(() => task),
    getOrBuildTask: vi.fn(async () => task as IAgentManager),
    addTask: vi.fn(),
    kill: vi.fn(),
    clear: vi.fn(async () => {}),
    listTasks: vi.fn(() => (task ? [{ id: task.conversation_id, type: task.type }] : [])),
  };
}

describe('CoreTaskRuntimeService runtime state', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('maps a task into a stable runtime state DTO', () => {
    const service = new CoreTaskRuntimeService(makeWorkerTaskManager(makeTask()));

    expect(service.getRuntimeState('conv-1')).toEqual({
      id: 'conv-1',
      type: 'acp',
      status: 'running',
      workspace: '/workspace',
      lastActivityAt: 123,
      isActive: true,
    });
  });

  it('emits a built event with runtime state when building a task', async () => {
    const task = makeTask({ status: 'pending' });
    const service = new CoreTaskRuntimeService(makeWorkerTaskManager(task));

    await service.getOrBuildTask('conv-1');

    expect(mockEmit).toHaveBeenCalledWith('task', 'task.runtime.updated', {
      action: 'built',
      conversationId: 'conv-1',
      status: 'pending',
      runtime: expect.objectContaining({
        id: 'conv-1',
        isActive: true,
      }),
    });
  });

  it('emits cleared events for previous runtime states when clearing tasks', async () => {
    const task = makeTask({ status: 'finished' });
    const service = new CoreTaskRuntimeService(makeWorkerTaskManager(task));

    await service.clear();

    expect(mockEmit).toHaveBeenCalledWith('task', 'task.runtime.updated', {
      action: 'cleared',
      conversationId: 'conv-1',
      status: 'finished',
      runtime: expect.objectContaining({
        id: 'conv-1',
        isActive: false,
      }),
    });
  });

  it('returns null runtime state when a task is not in memory', () => {
    const service = new CoreTaskRuntimeService(makeWorkerTaskManager(undefined));

    expect(service.getRuntimeState('missing')).toBeNull();
    expect(service.listRuntimeStates()).toEqual([]);
  });

  it('combines in-memory runtime states with persisted runtime records', async () => {
    const task = makeTask({ conversation_id: 'conv-live' });
    const service = new CoreTaskRuntimeService(makeWorkerTaskManager(task));
    const { ProcessConfig } = await import('@process/utils/initStorage');
    vi.mocked(ProcessConfig.get).mockResolvedValue({
      'conv-live': {
        conversationId: 'conv-live',
        taskType: 'acp',
        state: 'running',
        createdAt: 1,
        updatedAt: 2,
      },
      'conv-record-only': {
        conversationId: 'conv-record-only',
        state: 'killed',
        createdAt: 3,
        updatedAt: 4,
      },
    });

    await expect(service.getRuntimeOverview('conv-live')).resolves.toEqual({
      conversationId: 'conv-live',
      runtime: expect.objectContaining({ id: 'conv-live' }),
      record: expect.objectContaining({ conversationId: 'conv-live', state: 'running' }),
    });
    await expect(service.listRuntimeOverviews()).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          conversationId: 'conv-live',
          runtime: expect.objectContaining({ id: 'conv-live' }),
          record: expect.objectContaining({ state: 'running' }),
        }),
        expect.objectContaining({
          conversationId: 'conv-record-only',
          runtime: null,
          record: expect.objectContaining({ state: 'killed' }),
        }),
      ])
    );
  });
});
