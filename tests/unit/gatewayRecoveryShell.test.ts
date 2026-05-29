import { describe, expect, it } from 'vitest';
import { GatewayRecoveryShell } from '../../src/process/team-runtime/gateway';
import type { TTeam } from '../../src/process/team/types';
import type { TeamRuntimeDiagnostics } from '../../src/process/team-runtime/diagnostics';

function makeTeam(): TTeam {
  return {
    id: 'team-gateway',
    userId: 'user-1',
    name: 'Gateway Team',
    workspace: '/workspace',
    workspaceMode: 'shared',
    leaderAgentId: 'slot-lead',
    agents: [
      {
        slotId: 'slot-lead',
        conversationId: 'conv-lead',
        role: 'leader',
        agentType: 'openclaw-gateway',
        agentName: 'Leader',
        conversationType: 'openclaw-gateway',
        status: 'idle',
      },
      {
        slotId: 'slot-worker',
        conversationId: 'conv-worker',
        role: 'teammate',
        agentType: 'openclaw-gateway',
        agentName: 'Gateway Worker',
        conversationType: 'openclaw-gateway',
        status: 'failed',
      },
    ],
    createdAt: 1,
    updatedAt: 1,
  };
}

describe('GatewayRecoveryShell', () => {
  it('builds gateway replay execution contract with lifecycle-aware replay message', () => {
    const shell = new GatewayRecoveryShell();
    const diagnostics: TeamRuntimeDiagnostics = {
      teamId: 'team-gateway',
      capturedAt: 1,
      executionInfo: {
        teamId: 'team-gateway',
        executionKind: 'gateway',
        orchestrationMode: 'gateway_coordinated',
        state: 'failed',
      },
      degradedMembers: [
        {
          slotId: 'slot-worker',
          agentName: 'Gateway Worker',
          reason: 'gateway_connection_lost',
        },
      ],
      taskDiagnostics: {
        pending: 1,
        inProgress: 0,
        completed: 0,
        waiting: [],
      },
      protocolDiagnostics: {
        activeOwners: [],
        ownership: [],
        recentRecovery: [],
        leaderSummaries: [],
      },
      gatewayDiagnostics: {
        activeSessions: [
          {
            slotId: 'slot-worker',
            gatewaySessionId: 'sess-1',
            lifecycleState: 'reconnecting',
            taskCount: 1,
          },
        ],
        lifecycle: [
          {
            slotId: 'slot-worker',
            workerBackend: 'openclaw-gateway',
            gatewaySessionId: 'sess-1',
            lifecycleState: 'reconnecting',
            runtimeStatus: 'reconnecting',
            degradedReason: 'gateway_connection_lost',
            recoveryHint: 'Replay the saved session before redispatching work.',
            recoveryAction: 'replay_gateway_session',
            recoveryMode: 'gateway_replay',
            updatedAt: 1,
            sourceEventType: 'gateway_recovered',
          },
        ],
        taskOwnership: [
          {
            taskId: 'task-1',
            subject: 'Recover gateway task',
            owner: 'slot-worker',
            workerBackend: 'openclaw-gateway',
            gatewaySessionId: 'sess-1',
            taskStatus: 'failed',
            updatedAt: 1,
            lifecycleState: 'reconnecting',
            degradedReason: 'gateway_connection_lost',
            recoveryHint: 'Replay the saved session before redispatching work.',
            recoveryAction: 'replay_gateway_session',
            recoveryMode: 'gateway_replay',
          },
        ],
      },
      timeline: [],
      summary: [],
    };

    const contract = shell.buildExecutionContract(makeTeam(), diagnostics);

    expect(contract.actionsApplied).toEqual(['rebuild_gateway_runtime', 'replay_gateway_session']);
    expect(contract.replayContext).toEqual(
      expect.objectContaining({
        kind: 'gateway',
        targets: expect.arrayContaining([
          expect.objectContaining({
            slotId: 'slot-worker',
            lifecycleState: 'reconnecting',
            taskIds: ['task-1'],
          }),
        ]),
      })
    );
    expect(contract.replayPlan).toEqual(
      expect.objectContaining({
        kind: 'gateway',
        targets: [
          expect.objectContaining({
            slotId: 'slot-worker',
            replayStrategy: 'rebuild_session_then_wait',
            resumeSupported: false,
            structuredTasksSupported: false,
            requiresLeaderRedispatch: true,
            taskIds: ['task-1'],
          }),
        ],
      })
    );
    expect(contract.replayMessage).toContain('gateway coordination replay');
    expect(contract.replayMessage).toContain('Gateway Worker');
    expect(contract.replayMessage).toContain('reconnecting');
    expect(contract.replayMessage).toContain('Recover gateway task');
    expect(contract.workerReplayInstructions).toEqual([
      expect.objectContaining({
        slotId: 'slot-worker',
        payload: expect.objectContaining({
          session: expect.objectContaining({
            recoveryActions: ['replay_gateway_session'],
            recoveryModes: ['gateway_replay'],
          }),
          tasks: [{ taskId: 'task-1', subject: 'Recover gateway task' }],
        }),
        message: expect.stringContaining('Restore gateway worker session context'),
      }),
    ]);
  });
});
