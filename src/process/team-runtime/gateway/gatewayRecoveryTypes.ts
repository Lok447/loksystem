import type { TeamExecutionRecoveryAction, TeamExecutionRecoveryMode } from '../ITeamExecutionSession';

export function isTeamExecutionRecoveryAction(value: unknown): value is TeamExecutionRecoveryAction {
  return (
    value === 'restart_runtime' ||
    value === 'rebuild_mailbox_runtime' ||
    value === 'replay_mailbox_messages' ||
    value === 'rebuild_native_runtime' ||
    value === 'replay_native_context' ||
    value === 'rebuild_protocol_runtime' ||
    value === 'replay_protocol_coordination' ||
    value === 'rebuild_gateway_runtime' ||
    value === 'replay_gateway_session' ||
    value === 'resume_native_session' ||
    value === 'inspect_diagnostics'
  );
}

export function isTeamExecutionRecoveryMode(value: unknown): value is TeamExecutionRecoveryMode {
  return (
    value === 'none' ||
    value === 'restart' ||
    value === 'mailbox_replay' ||
    value === 'native_replay' ||
    value === 'protocol_replay' ||
    value === 'gateway_replay' ||
    value === 'native_resume'
  );
}
