import type { TeamAgent } from '@/common/types/teamTypes';
import type { CoreTeamRuntimeDiagnosticsDto } from '@process/core/shared/CoreContracts';

export type TeamOrchestrationLaneKind = 'leader' | 'worker';

export type TeamOrchestrationItemKind =
  | 'routing'
  | 'session'
  | 'recovery'
  | 'protocol'
  | 'gateway'
  | 'diagnostics'
  | 'blocked_task'
  | 'degraded'
  | 'event';

export type TeamOrchestrationItemTone = 'info' | 'success' | 'warning' | 'danger' | 'neutral';

export type TeamOrchestrationLaneItem = {
  id: string;
  laneId: string;
  kind: TeamOrchestrationItemKind;
  tone: TeamOrchestrationItemTone;
  title: string;
  subtitle?: string;
  timestamp?: number;
  sourceType?: string;
};

export type TeamOrchestrationLane = {
  id: string;
  kind: TeamOrchestrationLaneKind;
  agentName: string;
  agentType: string;
  role: TeamAgent['role'];
  status: TeamAgent['status'];
  waitingCount: number;
  degradedReason?: string;
  items: TeamOrchestrationLaneItem[];
};

export type TeamExecutionOverviewModel = {
  lanes: TeamOrchestrationLane[];
  recentActivity: TeamOrchestrationLaneItem[];
  ownershipHighlights: TeamOrchestrationLaneItem[];
  recoveryHighlights: TeamOrchestrationLaneItem[];
};

function eventTone(level: CoreTeamRuntimeDiagnosticsDto['timeline'][number]['level'] | undefined): TeamOrchestrationItemTone {
  if (level === 'error') return 'danger';
  if (level === 'warning') return 'warning';
  if (level === 'info') return 'info';
  return 'neutral';
}

function inferEventKind(type: string): TeamOrchestrationItemKind {
  if (type === 'routing_selected') return 'routing';
  if (type.startsWith('session_')) return 'session';
  if (type.startsWith('recovery_') || type === 'snapshot_recovered') return 'recovery';
  if (type.startsWith('protocol_')) return 'protocol';
  if (type.startsWith('gateway_')) return 'gateway';
  if (type === 'diagnostics_refreshed' || type === 'task_snapshot_refreshed') return 'diagnostics';
  if (type === 'agent_degraded') return 'degraded';
  return 'event';
}

function describeEventDetails(event: CoreTeamRuntimeDiagnosticsDto['timeline'][number]): string | undefined {
  const details = event.details as Record<string, unknown> | undefined;
  if (!details) return undefined;

  if (event.type === 'routing_selected') {
    const requestedEngine = typeof details.requestedEngine === 'string' ? details.requestedEngine : 'auto';
    const routingMode = typeof details.routingMode === 'string' ? details.routingMode : 'default';
    return `${requestedEngine} / ${routingMode}`;
  }

  if (event.type === 'session_started') {
    const executionKind = typeof details.executionKind === 'string' ? details.executionKind : 'unknown';
    const orchestrationMode = typeof details.orchestrationMode === 'string' ? details.orchestrationMode : 'unknown';
    return `${executionKind} / ${orchestrationMode}`;
  }

  if (event.type === 'recovery_plan_prepared' || event.type === 'recovery_plan_executed') {
    const status = typeof details.status === 'string' ? details.status : 'unknown';
    const mode = typeof details.mode === 'string' ? details.mode : 'unknown';
    return `${status} / ${mode}`;
  }

  if (event.type === 'snapshot_recovered') {
    return typeof details.preferredMode === 'string' ? details.preferredMode : undefined;
  }

  if (event.type === 'diagnostics_refreshed') {
    const waitingTasks = typeof details.waitingTasks === 'number' ? details.waitingTasks : 0;
    const degradedMembers = typeof details.degradedMembers === 'number' ? details.degradedMembers : 0;
    return `${waitingTasks} waiting / ${degradedMembers} degraded`;
  }

  if (event.type.startsWith('protocol_')) {
    const leaderSummary = typeof details.leaderSummary === 'string' ? details.leaderSummary : undefined;
    const recoveryHint = typeof details.recoveryHint === 'string' ? details.recoveryHint : undefined;
    const taskId = typeof details.taskId === 'string' ? details.taskId : undefined;
    const subject = typeof details.subject === 'string' ? details.subject : undefined;
    const owner = typeof details.owner === 'string' ? details.owner : undefined;
    const reason = typeof details.reason === 'string' ? details.reason : undefined;

    const primary = leaderSummary ?? [taskId ? taskId.slice(0, 8) : undefined, subject, owner, reason].filter(Boolean).join(' / ');
    if (!primary && !recoveryHint) return undefined;
    return [primary || undefined, recoveryHint].filter(Boolean).join(' | ');
  }

  if (event.type.startsWith('gateway_')) {
    const lifecycleState = typeof details.lifecycleState === 'string' ? details.lifecycleState : undefined;
    const degradedReason = typeof details.degradedReason === 'string' ? details.degradedReason : undefined;
    const recoveryHint = typeof details.recoveryHint === 'string' ? details.recoveryHint : undefined;
    const taskId = typeof details.taskId === 'string' ? details.taskId : undefined;
    const subject = typeof details.subject === 'string' ? details.subject : undefined;
    const owner = typeof details.owner === 'string' ? details.owner : undefined;

    const primary = [lifecycleState, taskId ? taskId.slice(0, 8) : undefined, subject, owner, degradedReason]
      .filter(Boolean)
      .join(' / ');
    if (!primary && !recoveryHint) return undefined;
    return [primary || undefined, recoveryHint].filter(Boolean).join(' | ');
  }

  return undefined;
}

function resolveEventLaneId(
  event: CoreTeamRuntimeDiagnosticsDto['timeline'][number],
  leaderSlotId: string | undefined,
  agentBySlotId: Map<string, TeamAgent>
): string | undefined {
  const details = event.details as Record<string, unknown> | undefined;
  const detailSlotId = typeof details?.slotId === 'string' ? details.slotId : undefined;
  if (detailSlotId && agentBySlotId.has(detailSlotId)) {
    return detailSlotId;
  }

  if (event.type === 'agent_degraded' && typeof details?.agentId === 'string' && agentBySlotId.has(details.agentId)) {
    return details.agentId;
  }

  return leaderSlotId;
}

function pushLaneItem(
  laneMap: Map<string, TeamOrchestrationLane>,
  laneId: string | undefined,
  item: TeamOrchestrationLaneItem
) {
  if (!laneId) return;
  const lane = laneMap.get(laneId);
  if (!lane) return;
  lane.items.push(item);
}

function buildOwnershipHighlights(
  agents: TeamAgent[],
  diagnostics: CoreTeamRuntimeDiagnosticsDto | null
): TeamOrchestrationLaneItem[] {
  const ownership = diagnostics?.protocolDiagnostics?.ownership ?? [];
  return ownership.slice(0, 4).map((record) => {
    const ownerAgent = record.owner ? agents.find((agent) => agent.slotId === record.owner) : undefined;
    const previousOwnerAgent = record.previousOwner
      ? agents.find((agent) => agent.slotId === record.previousOwner)
      : undefined;

    const ownerLabel = ownerAgent?.agentName ?? record.owner ?? 'Unassigned';
    const previousOwnerLabel = previousOwnerAgent?.agentName ?? record.previousOwner ?? undefined;
    const statusLabel =
      record.ownershipStatus === 'reassigned'
        ? previousOwnerLabel
          ? `${previousOwnerLabel} -> ${ownerLabel}`
          : ownerLabel
        : ownerLabel;

    return {
      id: `ownership-${record.taskId}`,
      laneId: record.owner ?? 'leader',
      kind: 'protocol',
      tone:
        record.ownershipStatus === 'blocked' || record.taskStatus === 'failed'
          ? 'danger'
          : record.ownershipStatus === 'reassigned' || record.ownershipStatus === 'returned_to_leader'
            ? 'warning'
            : 'info',
      title: record.subject,
      subtitle: [statusLabel, record.leaderSummary, record.recoveryHint].filter(Boolean).join(' | '),
      timestamp: record.updatedAt,
      sourceType: `protocol_ownership_${record.ownershipStatus}`,
    };
  });
}

function buildRecoveryHighlights(
  agents: TeamAgent[],
  diagnostics: CoreTeamRuntimeDiagnosticsDto | null
): TeamOrchestrationLaneItem[] {
  const recentRecovery = diagnostics?.protocolDiagnostics?.recentRecovery ?? [];
  return recentRecovery.slice(0, 4).map((record, index) => {
    const ownerAgent = record.owner ? agents.find((agent) => agent.slotId === record.owner) : undefined;
    const ownerLabel = ownerAgent?.agentName ?? record.owner ?? 'Leader';

    return {
      id: `recovery-${record.taskId ?? record.slotId ?? index}`,
      laneId: record.owner ?? record.slotId ?? 'leader',
      kind: 'recovery',
      tone: record.recoveryAction ? 'warning' : 'info',
      title: record.recoveryAction ?? record.recoveryMode ?? 'Recovery hint',
      subtitle: [ownerLabel, record.leaderSummary, record.recoveryHint].filter(Boolean).join(' | '),
      timestamp: record.updatedAt,
      sourceType: record.sourceEventType,
    };
  });
}

function buildGatewayHighlights(
  agents: TeamAgent[],
  diagnostics: CoreTeamRuntimeDiagnosticsDto | null
): TeamOrchestrationLaneItem[] {
  const lifecycle = diagnostics?.gatewayDiagnostics?.lifecycle ?? [];
  return lifecycle.slice(0, 4).map((record, index) => {
    const ownerAgent = agents.find((agent) => agent.slotId === record.slotId);
    const ownerLabel = ownerAgent?.agentName ?? record.slotId;

    return {
      id: `gateway-${record.slotId}-${index}`,
      laneId: record.slotId,
      kind: 'gateway',
      tone:
        record.lifecycleState === 'failed' || record.lifecycleState === 'degraded'
          ? 'warning'
          : record.lifecycleState === 'completed'
            ? 'success'
            : 'info',
      title: record.lifecycleState,
      subtitle: [ownerLabel, record.degradedReason, record.recoveryHint].filter(Boolean).join(' | '),
      timestamp: record.updatedAt,
      sourceType: record.sourceEventType,
    };
  });
}

export function buildTeamExecutionOverviewModel(
  agents: TeamAgent[],
  diagnostics: CoreTeamRuntimeDiagnosticsDto | null
): TeamExecutionOverviewModel {
  const orderedAgents = [...agents].sort((left, right) => {
    if (left.role === right.role) return left.agentName.localeCompare(right.agentName);
    return left.role === 'leader' ? -1 : 1;
  });

  const leaderSlotId = orderedAgents.find((agent) => agent.role === 'leader')?.slotId;
  const agentBySlotId = new Map(orderedAgents.map((agent) => [agent.slotId, agent]));
  const laneMap = new Map<string, TeamOrchestrationLane>(
    orderedAgents.map((agent) => [
      agent.slotId,
      {
        id: agent.slotId,
        kind: agent.role === 'leader' ? 'leader' : 'worker',
        agentName: agent.agentName,
        agentType: agent.agentType,
        role: agent.role,
        status: agent.status,
        waitingCount: 0,
        items: [] as TeamOrchestrationLaneItem[],
      },
    ])
  );

  for (const event of diagnostics?.timeline ?? []) {
    if (event.type === 'diagnostics_refreshed') {
      continue;
    }

    const laneId = resolveEventLaneId(event, leaderSlotId, agentBySlotId);
    pushLaneItem(laneMap, laneId, {
      id: event.id,
      laneId: laneId ?? 'unknown',
      kind: inferEventKind(event.type),
      tone: eventTone(event.level),
      title: event.message,
      subtitle: describeEventDetails(event),
      timestamp: event.at,
      sourceType: event.type,
    });
  }

  for (const degraded of diagnostics?.degradedMembers ?? []) {
    const lane = laneMap.get(degraded.slotId);
    if (!lane) continue;
    lane.degradedReason = degraded.reason;
    lane.items.push({
      id: `degraded-${degraded.slotId}`,
      laneId: degraded.slotId,
      kind: 'degraded',
      tone: 'warning',
      title: degraded.agentName,
      subtitle: degraded.reason,
      timestamp: diagnostics?.capturedAt,
      sourceType: 'agent_degraded',
    });
  }

  for (const waitingTask of diagnostics?.taskDiagnostics.waiting ?? []) {
    const ownerSlotId =
      waitingTask.owner && agentBySlotId.has(waitingTask.owner) ? waitingTask.owner : leaderSlotId;
    const lane = ownerSlotId ? laneMap.get(ownerSlotId) : undefined;
    if (!lane) continue;
    lane.waitingCount += 1;
    lane.items.push({
      id: `waiting-${waitingTask.taskId}`,
      laneId: lane.id,
      kind: 'blocked_task',
      tone: 'warning',
      title: waitingTask.subject,
      subtitle: waitingTask.blockedBy.join(', '),
      timestamp: diagnostics?.capturedAt,
      sourceType: 'waiting_task',
    });
  }

  const lanes = orderedAgents.map((agent) => {
    const lane = laneMap.get(agent.slotId)!;
    lane.items.sort((left, right) => (right.timestamp ?? 0) - (left.timestamp ?? 0));
    lane.items = lane.items.slice(0, 5);
    return lane;
  });

  const recentActivity = lanes
    .flatMap((lane) => lane.items.map((item) => ({ ...item, laneId: lane.id })))
    .sort((left, right) => (right.timestamp ?? 0) - (left.timestamp ?? 0))
    .slice(0, 6);

  const gatewayHighlights = buildGatewayHighlights(orderedAgents, diagnostics);

  return {
    lanes,
    recentActivity,
    ownershipHighlights: [...buildOwnershipHighlights(orderedAgents, diagnostics), ...gatewayHighlights].slice(0, 6),
    recoveryHighlights: [...buildRecoveryHighlights(orderedAgents, diagnostics), ...gatewayHighlights].slice(0, 6),
  };
}
