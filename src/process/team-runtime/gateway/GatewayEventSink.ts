import type { TeamRuntimeEventLevel } from '../diagnostics/types';

export type GatewayWorkerEventType = 'dispatch' | 'progress' | 'complete' | 'fail' | 'degrade' | 'recover';

export type GatewayWorkerEventPayload = {
  slotId?: string;
  taskId?: string;
  subject?: string;
  owner?: string;
  workerBackend?: string;
  gatewaySessionId?: string;
  lifecycleState?:
    | 'connecting'
    | 'connected'
    | 'session_active'
    | 'reconnecting'
    | 'disconnected'
    | 'degraded'
    | 'recovering'
    | 'completed'
    | 'failed';
  runtimeStatus?:
    | 'connecting'
    | 'connected'
    | 'session_active'
    | 'reconnecting'
    | 'disconnected'
    | 'idle';
  degradedReason?: string;
  recoveryHint?: string;
  recoveryAction?: string;
  recoveryMode?: string;
  message: string;
  details?: Record<string, unknown>;
  level?: TeamRuntimeEventLevel;
};

export interface GatewayEventSink {
  emit(type: GatewayWorkerEventType, payload: GatewayWorkerEventPayload): Promise<void>;
}
