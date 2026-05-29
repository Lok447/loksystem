import { describe, expect, it, vi } from 'vitest';
import { HermesNativeExecutionSession } from '../../src/process/team-runtime/hermes/HermesNativeExecutionSession';

function makeInnerSession() {
  return {
    teamId: 'team-native',
    executionKind: 'legacy_mailbox',
    start: vi.fn().mockResolvedValue(undefined),
    getExecutionInfo: vi.fn().mockReturnValue({
      teamId: 'team-native',
      executionKind: 'legacy_mailbox',
      orchestrationMode: 'legacy_mailbox',
      state: 'running',
      context: {
        compatibilityMode: 'legacy_mailbox',
      },
      diagnostics: {
        summary: ['legacy_bootstrap'],
      },
    }),
    getStdioConfig: vi.fn().mockReturnValue(null),
    sendMessage: vi.fn().mockResolvedValue(undefined),
    sendMessageToAgent: vi.fn().mockResolvedValue(undefined),
    renameAgent: vi.fn(),
    addAgent: vi.fn(),
    removeAgent: vi.fn(),
    getAgents: vi.fn().mockReturnValue([]),
    dispose: vi.fn().mockResolvedValue(undefined),
  } as any;
}

describe('HermesNativeExecutionSession', () => {
  it('surfaces native execution identity while preserving compatibility context and diagnostics', () => {
    const session = new HermesNativeExecutionSession(makeInnerSession(), {
      context: {
        runtimeVersion: 'phase2',
        leaderBackend: 'hermes',
        memberCount: 3,
        compatibilityMode: 'native_compatibility_bridge',
      },
      diagnostics: {
        summary: ['selected_engine:hermes_native'],
      },
    });

    expect(session.getExecutionInfo()).toEqual({
      teamId: 'team-native',
      executionKind: 'hermes_native',
      orchestrationMode: 'native_orchestrator',
      state: 'running',
      context: {
        compatibilityMode: 'native_compatibility_bridge',
        runtimeVersion: 'phase2',
        leaderBackend: 'hermes',
        memberCount: 3,
      },
      diagnostics: {
        summary: ['legacy_bootstrap', 'selected_engine:hermes_native'],
        fallbackReason: undefined,
      },
    });
  });
});
