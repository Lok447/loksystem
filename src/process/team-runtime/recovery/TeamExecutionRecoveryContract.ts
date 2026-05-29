import type { TeamExecutionEngineId } from '@/common/types/teamTypes';
import type {
  TeamExecutionInfo,
  TeamExecutionRecoveryInfo,
  TeamExecutionRecoveryMode,
  TeamExecutionRecoverySource,
  TeamExecutionSessionState,
} from '../ITeamExecutionSession';
import type { TeamRuntimeSnapshot } from '../diagnostics';
import { attachExecutionRecoveryPlan } from './TeamExecutionRecoveryPlanner';

type BuildRecoveryInfoParams = {
  executionKind: TeamExecutionEngineId;
  source: TeamExecutionRecoverySource;
  snapshotAvailable: boolean;
  lastKnownState?: TeamExecutionSessionState;
  snapshotCapturedAt?: number;
  lastEventAt?: number;
};

function inferPreferredMode(executionKind: TeamExecutionEngineId): TeamExecutionRecoveryMode {
  if (executionKind === 'legacy_mailbox') return 'mailbox_replay';
  if (executionKind === 'hermes_native') return 'native_replay';
  if (executionKind === 'protocol') return 'protocol_replay';
  if (executionKind === 'gateway') return 'gateway_replay';
  return 'restart';
}

function buildNotes(
  executionKind: TeamExecutionEngineId,
  source: TeamExecutionRecoverySource,
  preferredMode: TeamExecutionRecoveryMode
): string[] {
  if (source === 'fresh') {
    return ['No persisted runtime snapshot is available yet.'];
  }

  if (source === 'live_session') {
    if (preferredMode === 'mailbox_replay') {
      return ['Live runtime is active and can emit replay-ready mailbox checkpoints.'];
    }

    if (preferredMode === 'protocol_replay') {
      return ['Live runtime is active and can emit protocol coordination checkpoints for future replay.'];
    }

    return ['Live runtime is active and can emit recovery checkpoints for future replay.'];
  }

  if (executionKind === 'legacy_mailbox') {
    return ['Recovered diagnostics view from persisted mailbox snapshot.', 'Replay should rebuild the legacy mailbox shell.'];
  }

  if (executionKind === 'hermes_native') {
    return [
      'Recovered diagnostics view from persisted native snapshot.',
      'Native resume is not enabled yet, so replay should rebuild the compatibility shell first.',
    ];
  }

  if (executionKind === 'protocol') {
    return [
      'Recovered diagnostics view from persisted protocol-coordinated snapshot.',
      'Replay should rebuild the protocol coordination shell and restore leader-to-worker task ownership before continuing.',
    ];
  }

  if (executionKind === 'gateway') {
    return [
      'Recovered diagnostics view from persisted gateway-coordinated snapshot.',
      'Replay should rebuild the gateway coordination shell, reattach gateway lifecycle state, and restore degraded worker context before continuing.',
    ];
  }

  return ['Recovered diagnostics view from persisted runtime snapshot.'];
}

export function buildTeamExecutionRecoveryInfo(params: BuildRecoveryInfoParams): TeamExecutionRecoveryInfo {
  const preferredMode = inferPreferredMode(params.executionKind);
  const replayReady = params.snapshotAvailable && preferredMode !== 'none';
  const resumeReady = params.snapshotAvailable && preferredMode === 'native_resume';

  return {
    source: params.source,
    snapshotAvailable: params.snapshotAvailable,
    replayReady,
    resumeReady,
    preferredMode,
    snapshotCapturedAt: params.snapshotCapturedAt,
    lastEventAt: params.lastEventAt,
    lastKnownState: params.lastKnownState,
    notes: buildNotes(params.executionKind, params.source, preferredMode),
  };
}

export function attachExecutionRecovery(
  executionInfo: TeamExecutionInfo,
  params: Omit<BuildRecoveryInfoParams, 'executionKind'>
): TeamExecutionInfo {
  const recovery = buildTeamExecutionRecoveryInfo({
    executionKind: executionInfo.executionKind,
    ...params,
  });
  const summary = [
    ...(executionInfo.diagnostics?.summary ?? []),
    `recovery_source:${recovery.source}`,
    `recovery_snapshot_available:${String(recovery.snapshotAvailable)}`,
    `recovery_replay_ready:${String(recovery.replayReady)}`,
    `recovery_resume_ready:${String(recovery.resumeReady)}`,
    `recovery_preferred_mode:${recovery.preferredMode}`,
  ];

  if (recovery.lastKnownState) {
    summary.push(`recovery_last_known_state:${recovery.lastKnownState}`);
  }

  return attachExecutionRecoveryPlan({
    ...executionInfo,
    diagnostics: {
      ...(executionInfo.diagnostics ?? { summary: [] }),
      summary: [...new Set(summary)],
      fallbackReason: executionInfo.diagnostics?.fallbackReason,
    },
    recovery,
  });
}

export function buildRecoveredExecutionInfoFromSnapshot(snapshot: TeamRuntimeSnapshot): TeamExecutionInfo {
  const lastEventAt = snapshot.timeline.reduce<number | undefined>((latest, event) => {
    return latest === undefined || event.at > latest ? event.at : latest;
  }, undefined);
  const lastKnownState = snapshot.executionInfo.state;
  const currentState = lastKnownState === 'failed' ? 'failed' : 'stopped';

  return attachExecutionRecovery(
    {
      ...snapshot.executionInfo,
      state: currentState,
    },
    {
      source: 'persisted_snapshot',
      snapshotAvailable: true,
      snapshotCapturedAt: snapshot.capturedAt,
      lastEventAt,
      lastKnownState,
    }
  );
}
