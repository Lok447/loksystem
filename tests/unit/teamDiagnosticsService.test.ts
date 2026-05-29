import { describe, expect, it, vi } from 'vitest';
import { TeamDiagnosticsService, TeamEventStore, TeamRuntimeSnapshotStore } from '@process/team-runtime/diagnostics';
import type { ITeamRepository } from '@process/team/repository/ITeamRepository';
import type { TTeam } from '@process/team/types';
import type { TeamExecutionInfo } from '@process/team-runtime/ITeamExecutionSession';

function makeRepo(tasks: Array<Record<string, unknown>> = []): ITeamRepository {
  return {
    create: vi.fn(),
    findById: vi.fn(),
    findAll: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    deleteMailboxByTeam: vi.fn(),
    deleteTasksByTeam: vi.fn(),
    writeMessage: vi.fn(),
    readUnread: vi.fn(),
    readUnreadAndMark: vi.fn(),
    markRead: vi.fn(),
    getMailboxHistory: vi.fn(),
    createTask: vi.fn(),
    findTaskById: vi.fn(),
    updateTask: vi.fn(),
    findTasksByTeam: vi.fn().mockResolvedValue(tasks),
    findTasksByOwner: vi.fn(),
    deleteTask: vi.fn(),
    appendToBlocks: vi.fn(),
    removeFromBlockedBy: vi.fn(),
  } as unknown as ITeamRepository;
}

describe('TeamDiagnosticsService', () => {
  it('projects protocol ownership and recovery data from tasks and protocol events', async () => {
    const repo = makeRepo([
      {
        id: 'task-1',
        teamId: 'team-1',
        subject: 'Investigate regression',
        status: 'pending',
        owner: 'slot-worker',
        blockedBy: [],
        blocks: [],
        metadata: {
          reassignedFromOwner: 'slot-lead',
          reassignedReason: 'member_crashed',
        },
        createdAt: 1,
        updatedAt: 100,
      },
    ]);
    const eventStore = new TeamEventStore();
    const snapshotStore = new TeamRuntimeSnapshotStore();
    const service = new TeamDiagnosticsService({
      repo,
      eventStore,
      snapshotStore,
    });
    const sink = service.createProtocolEventSink('team-1');

    await sink.emit('reassign', {
      slotId: 'slot-worker',
      taskId: 'task-1',
      subject: 'Investigate regression',
      owner: 'slot-worker',
      fromOwnerId: 'slot-lead',
      toOwnerId: 'slot-worker',
      ownershipStatus: 'reassigned',
      taskStatus: 'pending',
      recoveryAction: 'replay_protocol_coordination',
      recoveryMode: 'protocol_replay',
      leaderSummary: 'Leader reassigned the regression task to Worker.',
      recoveryHint: 'Replay coordination before asking the worker to continue.',
      message: 'Task reassigned: Investigate regression',
      level: 'warning',
    });

    const team: TTeam = {
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
    const executionInfo: TeamExecutionInfo = {
      teamId: 'team-1',
      executionKind: 'protocol',
      orchestrationMode: 'protocol_coordinated',
      state: 'running',
    };

    const diagnostics = await service.getDiagnostics(team, executionInfo);

    expect(diagnostics.protocolDiagnostics.activeOwners).toEqual([
      {
        ownerId: 'slot-worker',
        taskCount: 1,
        taskIds: ['task-1'],
      },
    ]);
    expect(diagnostics.protocolDiagnostics.ownership).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          taskId: 'task-1',
          previousOwner: 'slot-lead',
          ownershipStatus: 'reassigned',
          recoveryAction: 'replay_protocol_coordination',
          recoveryMode: 'protocol_replay',
        }),
      ])
    );
    expect(diagnostics.protocolDiagnostics.recentRecovery[0]).toEqual(
      expect.objectContaining({
        taskId: 'task-1',
        recoveryAction: 'replay_protocol_coordination',
        recoveryMode: 'protocol_replay',
        recoveryHint: expect.stringContaining('Replay coordination'),
      })
    );
    expect(diagnostics.summary).toEqual(
      expect.arrayContaining(['protocol_active_owners:1', 'protocol_recovery_hints:1'])
    );
  });

  it('projects gateway lifecycle and recovery data from gateway events', async () => {
    const repo = makeRepo([
      {
        id: 'task-gateway-1',
        teamId: 'team-gateway',
        subject: 'Collect external records',
        status: 'pending',
        owner: 'slot-worker',
        blockedBy: [],
        blocks: [],
        metadata: {},
        createdAt: 1,
        updatedAt: 100,
      },
    ]);
    const eventStore = new TeamEventStore();
    const snapshotStore = new TeamRuntimeSnapshotStore();
    const service = new TeamDiagnosticsService({
      repo,
      eventStore,
      snapshotStore,
    });
    const sink = service.createGatewayEventSink('team-gateway');

    await sink.emit('degrade', {
      slotId: 'slot-worker',
      taskId: 'task-gateway-1',
      subject: 'Collect external records',
      owner: 'slot-worker',
      workerBackend: 'openclaw-gateway',
      gatewaySessionId: 'gw-1',
      lifecycleState: 'degraded',
      degradedReason: 'gateway_connection_lost',
      recoveryAction: 'replay_gateway_session',
      recoveryMode: 'gateway_replay',
      recoveryHint: 'Reconnect gateway session before redispatch.',
      message: 'Gateway worker degraded: Collect external records',
      level: 'warning',
    });

    const team: TTeam = {
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
          agentType: 'hermes',
          agentName: 'Leader',
          conversationType: 'lokcli',
          status: 'idle',
        },
        {
          slotId: 'slot-worker',
          conversationId: 'conv-worker',
          role: 'teammate',
          agentType: 'openclaw-gateway',
          agentName: 'Gateway Worker',
          conversationType: 'openclaw-gateway',
          status: 'idle',
        },
      ],
      createdAt: 1,
      updatedAt: 1,
    };
    const executionInfo: TeamExecutionInfo = {
      teamId: 'team-gateway',
      executionKind: 'gateway',
      orchestrationMode: 'gateway_coordinated',
      state: 'running',
    };

    const diagnostics = await service.getDiagnostics(team, executionInfo);

    expect(diagnostics.gatewayDiagnostics).toEqual(
      expect.objectContaining({
        activeSessions: [
          expect.objectContaining({
            slotId: 'slot-worker',
            lifecycleState: 'degraded',
            taskCount: 1,
          }),
        ],
        lifecycle: [
          expect.objectContaining({
            slotId: 'slot-worker',
            lifecycleState: 'degraded',
            degradedReason: 'gateway_connection_lost',
            recoveryAction: 'replay_gateway_session',
            recoveryMode: 'gateway_replay',
          }),
        ],
        taskOwnership: [
          expect.objectContaining({
            taskId: 'task-gateway-1',
            lifecycleState: 'degraded',
            recoveryAction: 'replay_gateway_session',
          }),
        ],
      })
    );
    expect(diagnostics.summary).toEqual(
      expect.arrayContaining(['gateway_active_sessions:1', 'gateway_degraded_members:1'])
    );
  });
});
