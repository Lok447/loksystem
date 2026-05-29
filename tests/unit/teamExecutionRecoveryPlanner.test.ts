import { describe, expect, it } from 'vitest';
import { attachExecutionRecovery } from '@process/team-runtime/recovery';
import type { TeamExecutionInfo } from '@process/team-runtime/ITeamExecutionSession';

function makeExecutionInfo(overrides: Partial<TeamExecutionInfo> = {}): TeamExecutionInfo {
  return {
    teamId: 'team-1',
    executionKind: 'legacy_mailbox',
    orchestrationMode: 'legacy_mailbox',
    state: 'created',
    diagnostics: {
      summary: ['selected_engine:legacy_mailbox'],
    },
    ...overrides,
  };
}

describe('TeamExecutionRecoveryPlanner', () => {
  it('builds mailbox replay plan when a legacy snapshot is available', () => {
    const info = attachExecutionRecovery(makeExecutionInfo(), {
      source: 'persisted_snapshot',
      snapshotAvailable: true,
      snapshotCapturedAt: 100,
      lastEventAt: 90,
      lastKnownState: 'running',
    });

    expect(info.recoveryPlan).toEqual({
      status: 'ready_for_replay',
      mode: 'mailbox_replay',
      steps: [
        {
          id: 'rebuild-mailbox-runtime',
          title: 'Rebuild mailbox runtime shell',
          action: 'rebuild_mailbox_runtime',
          status: 'ready',
          detail: undefined,
        },
        {
          id: 'replay-mailbox-messages',
          title: 'Replay mailbox coordination context',
          action: 'replay_mailbox_messages',
          status: 'ready',
          detail: 'Use persisted diagnostics timeline and mailbox-derived checkpoints to rebuild coordination state.',
        },
      ],
      blockers: [],
      summary: ['recovery_plan:mailbox_replay', 'recovery_plan_status:ready_for_replay'],
    });
  });

  it('builds native replay plan and exposes native resume blocker for hermes_native snapshots', () => {
    const info = attachExecutionRecovery(
      makeExecutionInfo({
        executionKind: 'hermes_native',
        orchestrationMode: 'native_orchestrator',
      }),
      {
        source: 'persisted_snapshot',
        snapshotAvailable: true,
        snapshotCapturedAt: 200,
        lastEventAt: 180,
        lastKnownState: 'running',
      }
    );

    expect(info.recoveryPlan).toEqual({
      status: 'ready_for_replay',
      mode: 'native_replay',
      steps: [
        {
          id: 'rebuild-native-runtime',
          title: 'Rebuild native runtime shell',
          action: 'rebuild_native_runtime',
          status: 'ready',
          detail: undefined,
        },
        {
          id: 'replay-native-context',
          title: 'Replay native orchestration context',
          action: 'replay_native_context',
          status: 'ready',
          detail: 'Rehydrate the compatibility-backed native execution context before enabling true native resume.',
        },
      ],
      blockers: ['native_resume_not_enabled'],
      summary: ['recovery_plan:native_replay', 'recovery_plan_status:ready_for_replay'],
    });
  });

  it('builds protocol replay plan when a protocol snapshot is available', () => {
    const info = attachExecutionRecovery(
      makeExecutionInfo({
        executionKind: 'protocol',
        orchestrationMode: 'protocol_coordinated',
      }),
      {
        source: 'persisted_snapshot',
        snapshotAvailable: true,
        snapshotCapturedAt: 300,
        lastEventAt: 280,
        lastKnownState: 'running',
      }
    );

    expect(info.recoveryPlan).toEqual({
      status: 'ready_for_replay',
      mode: 'protocol_replay',
      steps: [
        {
          id: 'rebuild-protocol-runtime',
          title: 'Rebuild protocol coordination shell',
          action: 'rebuild_protocol_runtime',
          status: 'ready',
          detail: undefined,
        },
        {
          id: 'replay-protocol-coordination',
          title: 'Replay leader and worker coordination state',
          action: 'replay_protocol_coordination',
          status: 'ready',
          detail: 'Restore protocol task ownership, reassignment history, and leader-facing recovery context before re-dispatch.',
        },
      ],
      blockers: ['native_protocol_resume_not_enabled'],
      summary: ['recovery_plan:protocol_replay', 'recovery_plan_status:ready_for_replay'],
    });
  });

  it('returns not_available plan when no snapshot exists', () => {
    const info = attachExecutionRecovery(makeExecutionInfo(), {
      source: 'fresh',
      snapshotAvailable: false,
      lastKnownState: 'created',
    });

    expect(info.recoveryPlan).toEqual({
      status: 'not_available',
      mode: 'mailbox_replay',
      steps: [
        {
          id: 'inspect-diagnostics',
          title: 'Inspect runtime diagnostics',
          action: 'inspect_diagnostics',
          status: 'blocked',
          detail: 'No persisted runtime snapshot is available for replay or resume.',
        },
      ],
      blockers: ['missing_runtime_snapshot'],
      summary: ['recovery_plan:not_available'],
    });
  });

  it('builds gateway replay plan when a gateway snapshot is available', () => {
    const info = attachExecutionRecovery(
      makeExecutionInfo({
        executionKind: 'gateway',
        orchestrationMode: 'gateway_coordinated',
      }),
      {
        source: 'persisted_snapshot',
        snapshotAvailable: true,
        snapshotCapturedAt: 320,
        lastEventAt: 300,
        lastKnownState: 'running',
      }
    );

    expect(info.recoveryPlan).toEqual({
      status: 'ready_for_replay',
      mode: 'gateway_replay',
      steps: [
        {
          id: 'rebuild-gateway-runtime',
          title: 'Rebuild gateway coordination shell',
          action: 'rebuild_gateway_runtime',
          status: 'ready',
          detail: undefined,
        },
        {
          id: 'replay-gateway-session',
          title: 'Replay gateway worker lifecycle and session context',
          action: 'replay_gateway_session',
          status: 'ready',
          detail: 'Restore gateway session lifecycle, degraded worker hints, and task ownership before redispatch.',
        },
      ],
      blockers: ['native_gateway_resume_not_enabled'],
      summary: ['recovery_plan:gateway_replay', 'recovery_plan_status:ready_for_replay'],
    });
  });
});
