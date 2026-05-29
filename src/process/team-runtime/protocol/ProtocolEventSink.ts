import type { TeamRuntimeEventLevel } from '../diagnostics/types';

export type ProtocolWorkerEventType = 'dispatch' | 'progress' | 'complete' | 'fail' | 'reassign';

export type ProtocolWorkerEventPayload = {
  slotId?: string;
  taskId?: string;
  subject?: string;
  owner?: string;
  fromOwnerId?: string;
  toOwnerId?: string;
  leaderSlotId?: string;
  workerBackend?: string;
  leaderSummary?: string;
  recoveryHint?: string;
  recoveryAction?: string;
  recoveryMode?: string;
  ownershipStatus?: 'assigned' | 'unassigned' | 'reassigned' | 'returned_to_leader' | 'blocked';
  taskStatus?: 'pending' | 'in_progress' | 'completed' | 'deleted' | 'failed';
  message: string;
  details?: Record<string, unknown>;
  level?: TeamRuntimeEventLevel;
};

export interface ProtocolEventSink {
  emit(type: ProtocolWorkerEventType, payload: ProtocolWorkerEventPayload): Promise<void>;
}
