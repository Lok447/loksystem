import { describe, expect, it, vi } from 'vitest';
import { CoreBackendServices } from '@process/core';

describe('CoreBackendServices', () => {
  it('builds a shared service graph for future transport adapters', () => {
    const conversationService = {
      getConversation: vi.fn(),
      listAllConversations: vi.fn(),
    };
    const workerTaskManager = {
      getTask: vi.fn(),
      getOrBuildTask: vi.fn(),
      listTasks: vi.fn(() => []),
      clear: vi.fn(),
      kill: vi.fn(),
    };

    const services = new CoreBackendServices({
      conversationService: conversationService as never,
      workerTaskManager: workerTaskManager as never,
    });

    expect(services.sessions).toBeDefined();
    expect(services.sessionRuntime).toBeDefined();
    expect(services.acpGateway).toBeDefined();
    expect(services.teams).toBeDefined();
    expect(services.uploads).toBeDefined();
    expect(services.taskRuntime.listRuntimeStates()).toEqual([]);
  });
});
