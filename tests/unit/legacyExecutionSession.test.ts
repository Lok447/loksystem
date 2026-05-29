import { describe, expect, it, vi } from 'vitest';
import { LegacyExecutionSession } from '../../src/process/team-runtime/legacy/LegacyExecutionSession';

function makeSession(overrides?: Partial<{
  teamId: string;
  start: () => Promise<void>;
  dispose: () => Promise<void>;
  getStdioConfig: (slotId?: string) => unknown;
  sendMessage: (content: string, files?: string[]) => Promise<void>;
  sendMessageToAgent: (slotId: string, content: string, options?: { silent?: boolean; files?: string[] }) => Promise<void>;
  renameAgent: (slotId: string, newName: string) => void;
  addAgent: (agent: any) => void;
  removeAgent: (slotId: string) => void;
  getAgents: () => any[];
}>) {
  return {
    teamId: 'team-1',
    start: vi.fn().mockResolvedValue(undefined),
    dispose: vi.fn().mockResolvedValue(undefined),
    getStdioConfig: vi.fn().mockReturnValue(null),
    sendMessage: vi.fn().mockResolvedValue(undefined),
    sendMessageToAgent: vi.fn().mockResolvedValue(undefined),
    renameAgent: vi.fn(),
    addAgent: vi.fn(),
    removeAgent: vi.fn(),
    getAgents: vi.fn().mockReturnValue([]),
    ...overrides,
  } as any;
}

describe('LegacyExecutionSession', () => {
  it('reports created -> running lifecycle through getExecutionInfo()', async () => {
    const inner = makeSession();
    const session = new LegacyExecutionSession(inner);

    expect(session.getExecutionInfo()).toEqual({
      teamId: 'team-1',
      executionKind: 'legacy_mailbox',
      orchestrationMode: 'legacy_mailbox',
      state: 'created',
      context: undefined,
      diagnostics: undefined,
    });

    await session.start();

    expect(session.getExecutionInfo()).toEqual({
      teamId: 'team-1',
      executionKind: 'legacy_mailbox',
      orchestrationMode: 'legacy_mailbox',
      state: 'running',
      context: undefined,
      diagnostics: undefined,
    });
  });

  it('can surface non-legacy execution metadata while using compatibility session', async () => {
    const inner = makeSession();
    const session = new LegacyExecutionSession(inner, {
      executionKind: 'hermes_native',
      orchestrationMode: 'native_orchestrator',
    });

    await session.start();

    expect(session.getExecutionInfo()).toEqual({
      teamId: 'team-1',
      executionKind: 'hermes_native',
      orchestrationMode: 'native_orchestrator',
      state: 'running',
      context: undefined,
      diagnostics: undefined,
    });
  });

  it('reports failed state when start throws', async () => {
    const inner = makeSession({
      start: vi.fn().mockRejectedValue(new Error('boom')),
    });
    const session = new LegacyExecutionSession(inner);

    await expect(session.start()).rejects.toThrow('boom');
    expect(session.getExecutionInfo().state).toBe('failed');
  });

  it('reports stopped after dispose succeeds', async () => {
    const inner = makeSession();
    const session = new LegacyExecutionSession(inner);

    await session.start();
    await session.dispose();

    expect(session.getExecutionInfo().state).toBe('stopped');
  });
});
