import { describe, expect, it, vi } from 'vitest';
import { TeamRecoveryCoordinator } from '../../src/process/team-runtime/recovery';
import { GatewayRecoveryShell } from '../../src/process/team-runtime/gateway';
import type { TTeam } from '../../src/process/team/types';
import type { TeamExecutionInfo } from '../../src/process/team-runtime/ITeamExecutionSession';
import type { TeamRuntimeDiagnostics } from '../../src/process/team-runtime/diagnostics';

function makeTeam(): TTeam {
  return {
    id: 'team-1',
    userId: 'user-1',
    name: 'Protocol Team',
    workspace: '/workspace',
    workspaceMode: 'shared',
    leaderAgentId: 'slot-lead',
    agents: [
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
    ],
    createdAt: 1,
    updatedAt: 1,
  };
}

describe('TeamRecoveryCoordinator', () => {
  it('prepares and executes protocol replay with worker-targeted replay context', async () => {
    const sendMessageToAgent = vi.fn().mockResolvedValue(undefined);
    const session = {
      sendMessageToAgent,
    } as any;
    const executionInfo: TeamExecutionInfo = {
      teamId: 'team-1',
      executionKind: 'protocol',
      orchestrationMode: 'protocol_coordinated',
      state: 'stopped',
      recoveryPlan: {
        status: 'ready_for_replay',
        mode: 'protocol_replay',
        steps: [],
        blockers: [],
        summary: ['recovery_plan:protocol_replay'],
      },
    };
    const diagnostics: TeamRuntimeDiagnostics = {
      teamId: 'team-1',
      capturedAt: 1,
      executionInfo: {
        teamId: 'team-1',
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
            recoveryAction: 'replay_protocol_coordination',
            recoveryMode: 'protocol_replay',
            leaderSummary: 'Leader routed the regression task to Worker.',
            recoveryHint: 'Replay coordination before redispatch.',
          },
        ],
        recentRecovery: [],
        leaderSummaries: [],
      },
      timeline: [],
      summary: [],
    };

    const coordinator = new TeamRecoveryCoordinator({
      getLiveSession: vi.fn(() => undefined),
      startSession: vi.fn().mockResolvedValue(session),
      loadExecutionInfo: vi.fn().mockResolvedValue({
        ...executionInfo,
        state: 'running',
        recovery: {
          source: 'live_session',
          snapshotAvailable: true,
          replayReady: true,
          resumeReady: false,
          preferredMode: 'protocol_replay',
        },
      }),
    });

    const preparation = coordinator.prepare({
      team: makeTeam(),
      executionInfo,
      diagnostics,
    });
    expect(preparation.protocolReplayContext).toEqual(
      expect.objectContaining({
        kind: 'protocol',
        targets: expect.arrayContaining([
          expect.objectContaining({
            slotId: 'slot-worker',
            taskIds: ['task-1'],
          }),
        ]),
      })
    );
    expect(preparation.protocolReplayExecutionPlan).toEqual(
      expect.objectContaining({
        kind: 'protocol_replay_execution',
        targets: expect.arrayContaining([
          expect.objectContaining({
            slotId: 'slot-worker',
            replayTaskCount: 1,
            replayActions: [
              expect.objectContaining({
                action: 'replay_protocol_coordination',
                mode: 'protocol_replay',
                taskIds: ['task-1'],
              }),
            ],
          }),
        ]),
      })
    );

    const result = await coordinator.execute({
      team: makeTeam(),
      executionInfo,
      diagnostics,
    });

    expect(result.actionsApplied).toEqual(['rebuild_protocol_runtime', 'replay_protocol_coordination']);
    expect(result.protocolReplayContext).toEqual(
      expect.objectContaining({
        kind: preparation.protocolReplayContext?.kind,
        leaderSlotId: preparation.protocolReplayContext?.leaderSlotId,
        summary: preparation.protocolReplayContext?.summary,
        replaySteps: preparation.protocolReplayContext?.replaySteps,
        targets: preparation.protocolReplayContext?.targets,
        executionPlan: expect.objectContaining({
          kind: preparation.protocolReplayContext?.executionPlan.kind,
          leaderSlotId: preparation.protocolReplayContext?.executionPlan.leaderSlotId,
          summary: preparation.protocolReplayContext?.executionPlan.summary,
          steps: preparation.protocolReplayContext?.executionPlan.steps,
          targets: preparation.protocolReplayContext?.executionPlan.targets,
        }),
      })
    );
    expect(result.protocolReplayExecutionPlan).toEqual(
      expect.objectContaining({
        kind: preparation.protocolReplayExecutionPlan?.kind,
        leaderSlotId: preparation.protocolReplayExecutionPlan?.leaderSlotId,
        summary: preparation.protocolReplayExecutionPlan?.summary,
        steps: preparation.protocolReplayExecutionPlan?.steps,
        targets: preparation.protocolReplayExecutionPlan?.targets,
      })
    );
    expect(result.replayMessage).toContain('Protocol targets:');
    expect(result.replayMessage).toContain('Protocol replay execution:');
    expect(result.replayMessage).toContain('Investigate regression');
    expect(sendMessageToAgent).toHaveBeenCalledWith(
      'slot-lead',
      expect.stringContaining('Replay steps:'),
      { silent: true }
    );
  });

  it('prepares and executes gateway replay through gateway recovery shell', async () => {
    const sendMessageToAgent = vi.fn().mockResolvedValue(undefined);
    const session = {
      sendMessageToAgent,
    } as any;
    const team = {
      ...makeTeam(),
      name: 'Gateway Team',
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
    } as TTeam;
    const executionInfo: TeamExecutionInfo = {
      teamId: 'team-1',
      executionKind: 'gateway',
      orchestrationMode: 'gateway_coordinated',
      state: 'stopped',
      recoveryPlan: {
        status: 'ready_for_replay',
        mode: 'gateway_replay',
        steps: [],
        blockers: [],
        summary: ['recovery_plan:gateway_replay'],
      },
    };
    const diagnostics: TeamRuntimeDiagnostics = {
      teamId: 'team-1',
      capturedAt: 1,
      executionInfo: {
        teamId: 'team-1',
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
            recoveryMode: 'native_resume',
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
            recoveryMode: 'native_resume',
          },
        ],
      },
      timeline: [],
      summary: [],
    };

    const coordinator = new TeamRecoveryCoordinator({
      getLiveSession: vi.fn(() => undefined),
      startSession: vi.fn().mockResolvedValue(session),
      loadExecutionInfo: vi.fn().mockResolvedValue({
        ...executionInfo,
        state: 'running',
        recovery: {
          source: 'live_session',
          snapshotAvailable: true,
          replayReady: true,
          resumeReady: false,
          preferredMode: 'gateway_replay',
        },
      }),
    });

    const preparation = coordinator.prepare({
      team,
      executionInfo,
      diagnostics,
    });
    expect(preparation.gatewayReplayContext).toEqual(
      expect.objectContaining({
        kind: 'gateway',
        targets: expect.arrayContaining([
          expect.objectContaining({
            slotId: 'slot-worker',
            taskIds: ['task-1'],
            lifecycleState: 'reconnecting',
          }),
        ]),
      })
    );
    expect(preparation.gatewayReplayExecutionPlan).toEqual(
      expect.objectContaining({
        kind: 'gateway',
        targets: expect.arrayContaining([
          expect.objectContaining({
            slotId: 'slot-worker',
            taskIds: ['task-1'],
          }),
        ]),
      })
    );

    const result = await coordinator.execute({
      team,
      executionInfo,
      diagnostics,
    });

    expect(result.actionsApplied).toEqual(['rebuild_gateway_runtime', 'replay_gateway_session']);
    expect(result.gatewayReplayContext).toEqual(
      expect.objectContaining({
        kind: 'gateway',
        targets: preparation.gatewayReplayContext?.targets,
      })
    );
    expect(result.gatewayReplayExecutionPlan).toEqual(
      expect.objectContaining({
        kind: preparation.gatewayReplayExecutionPlan?.kind,
        summary: preparation.gatewayReplayExecutionPlan?.summary,
        targets: preparation.gatewayReplayExecutionPlan?.targets,
      })
    );
    expect(result.gatewayReplayExecution).toEqual(
      expect.objectContaining({
        replayPlan: expect.objectContaining({
          kind: preparation.gatewayReplayExecutionPlan?.kind,
          summary: preparation.gatewayReplayExecutionPlan?.summary,
          targets: preparation.gatewayReplayExecutionPlan?.targets,
        }),
        workerResults: [
          expect.objectContaining({
            slotId: 'slot-worker',
            taskIds: ['task-1'],
            status: 'queued_for_redispatch',
          }),
        ],
      })
    );
    const gatewayRecoveryShell = new GatewayRecoveryShell();
    const expectedPlan = gatewayRecoveryShell.buildExecutionContract(team, diagnostics).replayPlan;
    expect(expectedPlan.targets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          slotId: 'slot-worker',
          replayStrategy: 'rebuild_session_then_wait',
          requiresLeaderRedispatch: true,
        }),
      ])
    );
    expect(result.replayMessage).toContain('gateway coordination replay');
    expect(result.replayMessage).toContain('Gateway targets:');
    expect(result.replayMessage).toContain('Recover gateway task');
    expect(sendMessageToAgent).toHaveBeenCalledWith(
      'slot-worker',
      expect.stringContaining('[Gateway Replay Payload]'),
      { silent: true }
    );
    expect(sendMessageToAgent).toHaveBeenCalledWith(
      'slot-lead',
      expect.stringContaining('Gateway targets:'),
      { silent: true }
    );
  });

  it('requests native gateway resume when feature-gated resume is enabled', async () => {
    const team: TTeam = {
      id: 'team-gateway-resume',
      userId: 'user-1',
      name: 'Gateway Resume Team',
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
    const executionInfo: TeamExecutionInfo = {
      teamId: 'team-gateway-resume',
      executionKind: 'gateway',
      orchestrationMode: 'gateway_coordinated',
      state: 'failed',
      recovery: {
        source: 'persisted_snapshot',
        snapshotAvailable: true,
        replayReady: true,
        resumeReady: true,
        preferredMode: 'gateway_replay',
      },
      recoveryPlan: {
        status: 'ready_for_replay',
        mode: 'gateway_replay',
        steps: [],
        blockers: [],
        summary: ['recovery_plan:gateway_replay'],
      },
    };
    const diagnostics: TeamRuntimeDiagnostics = {
      teamId: 'team-gateway-resume',
      capturedAt: 1,
      executionInfo,
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
    const sendMessageToAgent = vi.fn().mockResolvedValue(undefined);
    const session = {
      teamId: team.id,
      executionKind: 'gateway',
      start: vi.fn(),
      getExecutionInfo: () => executionInfo,
      getStdioConfig: vi.fn(),
      sendMessage: vi.fn(),
      sendMessageToAgent,
      renameAgent: vi.fn(),
      addAgent: vi.fn(),
      removeAgent: vi.fn(),
      getAgents: () => team.agents,
      dispose: vi.fn(),
    };
    const coordinator = new TeamRecoveryCoordinator({
      getLiveSession: vi.fn(() => undefined),
      startSession: vi.fn().mockResolvedValue(session),
      loadExecutionInfo: vi.fn().mockResolvedValue({
        ...executionInfo,
        state: 'running',
      }),
      gatewayNativeResumeMode: 'enabled',
    });

    const result = await coordinator.execute({
      team,
      executionInfo,
      diagnostics,
    });

    expect(result.gatewayReplayExecution?.workerResults).toEqual([
      expect.objectContaining({
        slotId: 'slot-worker',
        replayStrategy: 'rebuild_session_then_resume_tasks',
        status: 'resume_requested',
      }),
    ]);
    expect(sendMessageToAgent).toHaveBeenCalledWith(
      'slot-worker',
      expect.stringContaining('"resume"'),
      { silent: true }
    );
  });
});
