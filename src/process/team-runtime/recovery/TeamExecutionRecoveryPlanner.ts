import type { TeamExecutionInfo, TeamExecutionRecoveryPlan, TeamExecutionRecoveryPlanStep } from '../ITeamExecutionSession';

function makeStep(
  id: string,
  title: string,
  action: TeamExecutionRecoveryPlanStep['action'],
  status: TeamExecutionRecoveryPlanStep['status'],
  detail?: string
): TeamExecutionRecoveryPlanStep {
  return { id, title, action, status, detail };
}

export function buildTeamExecutionRecoveryPlan(executionInfo: TeamExecutionInfo): TeamExecutionRecoveryPlan {
  const recovery = executionInfo.recovery;
  if (!recovery || !recovery.snapshotAvailable) {
    return {
      status: 'not_available',
      mode: recovery?.preferredMode ?? 'none',
      steps: [
        makeStep(
          'inspect-diagnostics',
          'Inspect runtime diagnostics',
          'inspect_diagnostics',
          'blocked',
          'No persisted runtime snapshot is available for replay or resume.'
        ),
      ],
      blockers: ['missing_runtime_snapshot'],
      summary: ['recovery_plan:not_available'],
    };
  }

  if (recovery.preferredMode === 'mailbox_replay') {
    return {
      status: 'ready_for_replay',
      mode: 'mailbox_replay',
      steps: [
        makeStep('rebuild-mailbox-runtime', 'Rebuild mailbox runtime shell', 'rebuild_mailbox_runtime', 'ready'),
        makeStep(
          'replay-mailbox-messages',
          'Replay mailbox coordination context',
          'replay_mailbox_messages',
          'ready',
          'Use persisted diagnostics timeline and mailbox-derived checkpoints to rebuild coordination state.'
        ),
      ],
      blockers: [],
      summary: ['recovery_plan:mailbox_replay', 'recovery_plan_status:ready_for_replay'],
    };
  }

  if (recovery.preferredMode === 'native_replay') {
    return {
      status: 'ready_for_replay',
      mode: 'native_replay',
      steps: [
        makeStep('rebuild-native-runtime', 'Rebuild native runtime shell', 'rebuild_native_runtime', 'ready'),
        makeStep(
          'replay-native-context',
          'Replay native orchestration context',
          'replay_native_context',
          'ready',
          'Rehydrate the compatibility-backed native execution context before enabling true native resume.'
        ),
      ],
      blockers: ['native_resume_not_enabled'],
      summary: ['recovery_plan:native_replay', 'recovery_plan_status:ready_for_replay'],
    };
  }

  if (recovery.preferredMode === 'protocol_replay') {
    return {
      status: 'ready_for_replay',
      mode: 'protocol_replay',
      steps: [
        makeStep('rebuild-protocol-runtime', 'Rebuild protocol coordination shell', 'rebuild_protocol_runtime', 'ready'),
        makeStep(
          'replay-protocol-coordination',
          'Replay leader and worker coordination state',
          'replay_protocol_coordination',
          'ready',
          'Restore protocol task ownership, reassignment history, and leader-facing recovery context before re-dispatch.'
        ),
      ],
      blockers: ['native_protocol_resume_not_enabled'],
      summary: ['recovery_plan:protocol_replay', 'recovery_plan_status:ready_for_replay'],
    };
  }

  if (recovery.preferredMode === 'gateway_replay') {
    return {
      status: 'ready_for_replay',
      mode: 'gateway_replay',
      steps: [
        makeStep('rebuild-gateway-runtime', 'Rebuild gateway coordination shell', 'rebuild_gateway_runtime', 'ready'),
        makeStep(
          'replay-gateway-session',
          'Replay gateway worker lifecycle and session context',
          'replay_gateway_session',
          'ready',
          'Restore gateway session lifecycle, degraded worker hints, and task ownership before redispatch.'
        ),
      ],
      blockers: ['native_gateway_resume_not_enabled'],
      summary: ['recovery_plan:gateway_replay', 'recovery_plan_status:ready_for_replay'],
    };
  }

  if (recovery.preferredMode === 'native_resume' && recovery.resumeReady) {
    return {
      status: 'ready_for_resume',
      mode: 'native_resume',
      steps: [
        makeStep('resume-native-session', 'Resume native orchestration session', 'resume_native_session', 'ready'),
      ],
      blockers: [],
      summary: ['recovery_plan:native_resume', 'recovery_plan_status:ready_for_resume'],
    };
  }

  return {
    status: 'planned',
    mode: recovery.preferredMode,
    steps: [
      makeStep(
        'restart-runtime',
        'Restart runtime from persisted execution metadata',
        'restart_runtime',
        'ready',
        'Fallback path when a specialized replay or resume flow is not yet available.'
      ),
    ],
    blockers: [],
    summary: ['recovery_plan:restart_runtime', 'recovery_plan_status:planned'],
  };
}

export function attachExecutionRecoveryPlan(executionInfo: TeamExecutionInfo): TeamExecutionInfo {
  const recoveryPlan = buildTeamExecutionRecoveryPlan(executionInfo);
  const summary = [...(executionInfo.diagnostics?.summary ?? []), ...recoveryPlan.summary];

  return {
    ...executionInfo,
    diagnostics: {
      ...(executionInfo.diagnostics ?? { summary: [] }),
      summary: [...new Set(summary)],
      fallbackReason: executionInfo.diagnostics?.fallbackReason,
    },
    recoveryPlan,
  };
}
