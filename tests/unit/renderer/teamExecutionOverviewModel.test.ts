import { describe, expect, it } from 'vitest';
import { buildTeamExecutionOverviewModel } from '../../../src/renderer/pages/team/components/teamExecutionOverviewModel';
import type { TeamAgent } from '../../../src/common/types/teamTypes';
import type { CoreTeamRuntimeDiagnosticsDto } from '../../../src/process/core/shared/CoreContracts';

function makeAgents(): TeamAgent[] {
  return [
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
      agentType: 'codex',
      agentName: 'Worker',
      conversationType: 'acp',
      status: 'idle',
    },
  ];
}

describe('teamExecutionOverviewModel', () => {
  it('projects protocol worker events into recent activity', () => {
    const diagnostics: CoreTeamRuntimeDiagnosticsDto = {
      teamId: 'team-1',
      capturedAt: 100,
      executionInfo: {
        teamId: 'team-1',
        executionKind: 'protocol',
        orchestrationMode: 'protocol_coordinated',
        state: 'running',
      },
      degradedMembers: [],
      taskDiagnostics: {
        pending: 0,
        inProgress: 0,
        completed: 0,
        waiting: [],
      },
      protocolDiagnostics: {
        activeOwners: [
          {
            ownerId: 'slot-worker',
            taskCount: 1,
            taskIds: ['task-12345678'],
          },
        ],
        ownership: [
          {
            taskId: 'task-12345678',
            subject: 'Build feature',
            owner: 'slot-worker',
            previousOwner: 'slot-lead',
            ownershipStatus: 'reassigned',
            taskStatus: 'in_progress',
            updatedAt: 20,
            workerBackend: 'codex',
            leaderSummary: 'Leader handed Build feature to Worker for implementation.',
            recoveryHint: 'If Worker stalls, reassign the task back to the leader.',
            recoveryAction: 'replay_protocol_coordination',
            recoveryMode: 'protocol_replay',
          },
        ],
        recentRecovery: [
          {
            taskId: 'task-12345678',
            slotId: 'slot-worker',
            owner: 'slot-worker',
            workerBackend: 'codex',
            recoveryAction: 'replay_protocol_coordination',
            recoveryMode: 'protocol_replay',
            leaderSummary: 'Worker may need a replayable coordination reset.',
            recoveryHint: 'Replay the coordination shell before redispatch.',
            updatedAt: 22,
            sourceEventType: 'protocol_failed',
          },
        ],
        leaderSummaries: [
          {
            eventId: 'evt-summary',
            at: 22,
            slotId: 'slot-worker',
            taskId: 'task-12345678',
            summary: 'Leader routed Build feature to Worker.',
          },
        ],
      },
      timeline: [
        {
          id: 'evt-1',
          teamId: 'team-1',
          at: 10,
          type: 'protocol_dispatch',
          level: 'info',
          message: 'Task dispatched: Build feature',
          details: {
            slotId: 'slot-worker',
            taskId: 'task-12345678',
            subject: 'Build feature',
          },
        },
        {
          id: 'evt-2',
          teamId: 'team-1',
          at: 20,
          type: 'protocol_completed',
          level: 'info',
          message: 'Task completed: Build feature',
          details: {
            slotId: 'slot-worker',
            taskId: 'task-12345678',
            subject: 'Build feature',
            owner: 'slot-worker',
            leaderSummary: 'Worker completed implementation and returned the result to the leader.',
            recoveryHint: 'Leader can review and either merge the result or re-dispatch follow-up work.',
          },
        },
      ],
      summary: [],
    };

    const model = buildTeamExecutionOverviewModel(makeAgents(), diagnostics);
    expect(model.recentActivity[0]).toEqual(
      expect.objectContaining({
        kind: 'protocol',
        title: 'Task completed: Build feature',
        laneId: 'slot-worker',
      })
    );
    expect(model.recentActivity[0]?.subtitle).toContain('Worker completed implementation');
    expect(model.recentActivity[0]?.subtitle).toContain('Leader can review');
    expect(model.ownershipHighlights[0]).toEqual(
      expect.objectContaining({
        title: 'Build feature',
      })
    );
    expect(model.ownershipHighlights[0]?.subtitle).toContain('Leader');
    expect(model.recoveryHighlights[0]).toEqual(
      expect.objectContaining({
        title: 'replay_protocol_coordination',
      })
    );
    expect(model.recoveryHighlights[0]?.subtitle).toContain('Replay the coordination shell');
  });

  it('projects gateway worker lifecycle into execution overview', () => {
    const diagnostics: CoreTeamRuntimeDiagnosticsDto = {
      teamId: 'team-1',
      capturedAt: 100,
      executionInfo: {
        teamId: 'team-1',
        executionKind: 'gateway',
        orchestrationMode: 'gateway_coordinated',
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
        activeOwners: [],
        ownership: [],
        recentRecovery: [],
        leaderSummaries: [],
      },
      gatewayDiagnostics: {
        activeSessions: [
          {
            slotId: 'slot-worker',
            gatewaySessionId: 'gw-1',
            lifecycleState: 'degraded',
            taskCount: 1,
          },
        ],
        lifecycle: [
          {
            slotId: 'slot-worker',
            workerBackend: 'openclaw-gateway',
            gatewaySessionId: 'gw-1',
            lifecycleState: 'degraded',
            degradedReason: 'gateway_connection_lost',
            recoveryHint: 'Reconnect gateway session before redispatch.',
            recoveryAction: 'replay_gateway_session',
            recoveryMode: 'gateway_replay',
            updatedAt: 30,
            sourceEventType: 'gateway_degraded',
          },
        ],
        taskOwnership: [
          {
            taskId: 'task-gw-1',
            subject: 'Collect external records',
            owner: 'slot-worker',
            workerBackend: 'openclaw-gateway',
            gatewaySessionId: 'gw-1',
            taskStatus: 'failed',
            updatedAt: 30,
            lifecycleState: 'degraded',
            degradedReason: 'gateway_connection_lost',
            recoveryHint: 'Reconnect gateway session before redispatch.',
            recoveryAction: 'replay_gateway_session',
            recoveryMode: 'gateway_replay',
          },
        ],
      },
      timeline: [
        {
          id: 'evt-gw-1',
          teamId: 'team-1',
          at: 30,
          type: 'gateway_degraded',
          level: 'warning',
          message: 'Gateway worker degraded: Collect external records',
          details: {
            slotId: 'slot-worker',
            taskId: 'task-gw-1',
            subject: 'Collect external records',
            lifecycleState: 'degraded',
            degradedReason: 'gateway_connection_lost',
            recoveryHint: 'Reconnect gateway session before redispatch.',
          },
        },
      ],
      summary: [],
    };

    const model = buildTeamExecutionOverviewModel(
      [
        makeAgents()[0],
        {
          ...makeAgents()[1],
          agentType: 'openclaw-gateway',
          conversationType: 'openclaw-gateway',
        },
      ],
      diagnostics
    );

    expect(model.recentActivity[0]).toEqual(
      expect.objectContaining({
        kind: 'gateway',
        title: 'Gateway worker degraded: Collect external records',
        laneId: 'slot-worker',
      })
    );
    expect(model.recentActivity[0]?.subtitle).toContain('gateway_connection_lost');
    expect(model.ownershipHighlights.some((item) => item.kind === 'gateway' && item.title === 'degraded')).toBe(true);
    expect(model.recoveryHighlights.some((item) => item.kind === 'gateway')).toBe(true);
  });
});
