import { describe, expect, it, vi } from 'vitest';
import { ProtocolExecutionSession } from '../../src/process/team-runtime/protocol';

function makeInnerSession() {
  return {
    teamId: 'team-protocol',
    executionKind: 'legacy_mailbox',
    start: vi.fn().mockResolvedValue(undefined),
    getExecutionInfo: vi.fn().mockReturnValue({
      teamId: 'team-protocol',
      executionKind: 'legacy_mailbox',
      orchestrationMode: 'legacy_mailbox',
      state: 'running',
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
    getAgents: vi.fn().mockReturnValue([
      {
        slotId: 'slot-lead',
        conversationId: 'conv-lead',
        role: 'leader',
        agentType: 'codex',
        agentName: 'Leader',
        conversationType: 'codex',
        status: 'idle',
      },
      {
        slotId: 'slot-worker',
        conversationId: 'conv-worker',
        role: 'teammate',
        agentType: 'codex',
        agentName: 'Worker',
        conversationType: 'acp',
        status: 'idle',
      },
    ]),
    dispose: vi.fn().mockResolvedValue(undefined),
  } as any;
}

describe('ProtocolExecutionSession', () => {
  it('builds replay context from runtime diagnostics and worker contracts', () => {
    const session = new ProtocolExecutionSession(makeInnerSession(), {
      acpAdapter: {
        getWorkerContract: vi.fn((agent) =>
          agent.role === 'teammate'
            ? {
                slotId: agent.slotId,
                agentName: agent.agentName,
                backend: agent.agentType,
                conversationId: agent.conversationId,
                supportsInterrupt: true,
                supportsResume: true,
                supportsStructuredTasks: true,
              }
            : null
        ),
      } as any,
      team: {
        leaderAgentId: 'slot-lead',
        agents: makeInnerSession().getAgents(),
      },
      diagnostics: {
        summary: ['selected_engine:protocol'],
      },
    });

    const replayContext = session.buildReplayContext({
      teamId: 'team-protocol',
      capturedAt: 1,
      executionInfo: {
        teamId: 'team-protocol',
        executionKind: 'protocol',
        orchestrationMode: 'protocol_coordinated',
        state: 'running',
      },
      degradedMembers: [],
      taskDiagnostics: {
        pending: 1,
        inProgress: 0,
        completed: 0,
        waiting: [],
      },
      protocolDiagnostics: {
        activeOwners: [
          {
            ownerId: 'slot-worker',
            taskCount: 1,
            taskIds: ['task-1'],
          },
        ],
        ownership: [
          {
            taskId: 'task-1',
            subject: 'Investigate regression',
            owner: 'slot-worker',
            ownershipStatus: 'assigned',
            updatedAt: 1,
          },
        ],
        recentRecovery: [],
        leaderSummaries: [],
      },
      timeline: [],
      summary: [],
    });

    expect(replayContext.targets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          slotId: 'slot-worker',
          role: 'worker',
          taskIds: ['task-1'],
          supportsResume: true,
        }),
      ])
    );
    expect(replayContext.executionPlan.targets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          slotId: 'slot-worker',
          replayTaskCount: 1,
          replayActions: [
            expect.objectContaining({
              action: 'inspect_diagnostics',
              taskIds: ['task-1'],
            }),
          ],
        }),
      ])
    );
  });
});
