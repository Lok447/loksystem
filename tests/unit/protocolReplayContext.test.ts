import { describe, expect, it } from 'vitest';
import { buildProtocolReplayContext } from '../../src/process/team-runtime/protocol';
import type { TTeam } from '../../src/common/types/teamTypes';
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

describe('buildProtocolReplayContext', () => {
  it('builds worker-targeted replay context from ownership and recovery diagnostics', () => {
    const diagnostics: TeamRuntimeDiagnostics = {
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
            previousOwner: 'slot-lead',
            ownershipStatus: 'reassigned',
            taskStatus: 'pending',
            updatedAt: 100,
            workerBackend: 'codex',
            leaderSummary: 'Leader reassigned the regression task to Worker.',
            recoveryHint: 'Replay coordination before continuing.',
            recoveryAction: 'replay_protocol_coordination',
            recoveryMode: 'protocol_replay',
          },
        ],
        recentRecovery: [
          {
            taskId: 'task-1',
            slotId: 'slot-worker',
            owner: 'slot-worker',
            workerBackend: 'codex',
            recoveryAction: 'replay_protocol_coordination',
            recoveryMode: 'protocol_replay',
            leaderSummary: 'Worker needs a recovery-aware replay.',
            recoveryHint: 'Rebuild routing context, then redispatch.',
            updatedAt: 101,
            sourceEventType: 'protocol_failed',
          },
        ],
        leaderSummaries: [],
      },
      timeline: [],
      summary: [],
    };

    const context = buildProtocolReplayContext({
      team: makeTeam(),
      diagnostics,
      workerContracts: [
        {
          slotId: 'slot-worker',
          agentName: 'Worker',
          backend: 'codex',
          conversationId: 'conv-worker',
          supportsInterrupt: true,
          supportsResume: true,
          supportsStructuredTasks: true,
        },
      ],
    });

    expect(context.summary).toEqual(
      expect.arrayContaining(['protocol_targets:2', 'protocol_workers:1', 'protocol_tasks:1'])
    );
    expect(context.targets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          slotId: 'slot-worker',
          role: 'worker',
          taskIds: ['task-1'],
          tasks: [
            expect.objectContaining({
              taskId: 'task-1',
              subject: 'Investigate regression',
              recoveryAction: 'replay_protocol_coordination',
            }),
          ],
          recoveryActions: ['replay_protocol_coordination'],
          latestRecoveryHint: expect.stringContaining('Rebuild routing context'),
        }),
      ])
    );
    expect(context.replaySteps.some((step) => step.includes('Investigate regression'))).toBe(true);
    expect(context.executionPlan).toEqual(
      expect.objectContaining({
        kind: 'protocol_replay_execution',
        targetCount: 2,
        replayTaskCount: 1,
        targets: expect.arrayContaining([
          expect.objectContaining({
            slotId: 'slot-worker',
            replayTaskCount: 1,
            replayTasks: [
              expect.objectContaining({
                taskId: 'task-1',
                subject: 'Investigate regression',
              }),
            ],
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
  });
});
