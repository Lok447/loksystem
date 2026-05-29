import type { TeamExecutionInfo } from '../ITeamExecutionSession';
import type { ITeamRepository } from '@process/team/repository/ITeamRepository';
import type { TeamAgent, TTeam } from '@process/team/types';
import { buildRecoveredExecutionInfoFromSnapshot } from '../recovery';
import type { ITeamEventStore, ITeamRuntimeSnapshotStore } from './storeTypes';
import type {
  TeamGatewayDiagnostics,
  TeamGatewayLifecycleRecord,
  TeamGatewayTaskOwnershipRecord,
  TeamProtocolDiagnostics,
  TeamProtocolOwnershipRecord,
  TeamProtocolRecoveryHint,
  TeamRecoveredRuntimeDiagnostics,
  TeamRuntimeDiagnostics,
  TeamRuntimeEvent,
  TeamRuntimeSnapshot,
} from './types';
import type { ProtocolEventSink, ProtocolWorkerEventPayload, ProtocolWorkerEventType } from '../protocol';
import type { GatewayEventSink, GatewayWorkerEventPayload, GatewayWorkerEventType } from '../gateway';

type TeamDiagnosticsServiceParams = {
  repo: ITeamRepository;
  eventStore: ITeamEventStore;
  snapshotStore: ITeamRuntimeSnapshotStore;
};

export class TeamDiagnosticsService {
  constructor(private readonly params: TeamDiagnosticsServiceParams) {}

  async recordEvent(teamId: string, event: Omit<TeamRuntimeEvent, 'id' | 'teamId'>): Promise<TeamRuntimeEvent> {
    return this.params.eventStore.append(teamId, event);
  }

  async refreshSnapshot(team: TTeam, executionInfo: TeamExecutionInfo): Promise<TeamRuntimeSnapshot> {
    const tasks = (await this.params.repo.findTasksByTeam(team.id)) ?? [];
    const degradedMembers = this.buildDegradedMembers(team.agents, executionInfo);
    const timeline = await this.params.eventStore.list(team.id);
    const protocolDiagnostics = this.buildProtocolDiagnostics(tasks, timeline);
    const gatewayDiagnostics = this.buildGatewayDiagnostics(tasks, timeline);

    const snapshot: TeamRuntimeSnapshot = {
      teamId: team.id,
      capturedAt: Date.now(),
      executionInfo,
      degradedMembers,
      taskDiagnostics: this.buildTaskDiagnostics(tasks),
      protocolDiagnostics,
      gatewayDiagnostics,
      timeline,
    };

    await this.params.snapshotStore.set(snapshot);
    return snapshot;
  }

  async getDiagnostics(team: TTeam, executionInfo: TeamExecutionInfo): Promise<TeamRuntimeDiagnostics> {
    const snapshot = await this.refreshSnapshot(team, executionInfo);
    return {
      ...snapshot,
      summary: this.buildSummary(snapshot),
    };
  }

  async getRecoveredDiagnostics(team: TTeam): Promise<TeamRecoveredRuntimeDiagnostics | null> {
    const snapshot = await this.params.snapshotStore.get(team.id);
    if (!snapshot) return null;
    const tasks = (await this.params.repo.findTasksByTeam(team.id)) ?? [];
    const runtimeTimeline = await this.params.eventStore.list(team.id);
    const mergedTimeline = runtimeTimeline.length > 0 ? runtimeTimeline : snapshot.timeline;
    const normalizedProtocolDiagnostics = this.normalizeProtocolDiagnostics(snapshot.protocolDiagnostics);
    const normalizedGatewayDiagnostics = this.normalizeGatewayDiagnostics(snapshot.gatewayDiagnostics);
    const rebuiltTaskDiagnostics = this.buildTaskDiagnostics(tasks);
    const rebuiltProtocolDiagnostics = this.buildProtocolDiagnostics(tasks, mergedTimeline);
    const rebuiltGatewayDiagnostics = this.buildGatewayDiagnostics(tasks, mergedTimeline);

    const recoveredSnapshot: TeamRuntimeSnapshot = {
      ...snapshot,
      taskDiagnostics: this.mergeTaskDiagnostics(snapshot.taskDiagnostics, rebuiltTaskDiagnostics),
      protocolDiagnostics: this.mergeProtocolDiagnostics(normalizedProtocolDiagnostics, rebuiltProtocolDiagnostics),
      gatewayDiagnostics: this.mergeGatewayDiagnostics(normalizedGatewayDiagnostics, rebuiltGatewayDiagnostics),
      timeline: mergedTimeline,
      executionInfo: buildRecoveredExecutionInfoFromSnapshot(snapshot),
    };

    return {
      ...recoveredSnapshot,
      summary: this.buildSummary(recoveredSnapshot),
      recoveryStatus: 'recovered_snapshot',
      recoveredFromSnapshotAt: snapshot.capturedAt,
    };
  }

  async getCachedSnapshot(teamId: string): Promise<TeamRuntimeSnapshot | null> {
    return this.params.snapshotStore.get(teamId);
  }

  async clear(teamId: string): Promise<void> {
    await this.params.eventStore.clear(teamId);
    await this.params.snapshotStore.clear(teamId);
  }

  createProtocolEventSink(teamId: string): ProtocolEventSink {
    return {
      emit: async (type, payload) => {
        await this.recordEvent(teamId, this.buildProtocolRuntimeEvent(type, payload));
      },
    };
  }

  createGatewayEventSink(teamId: string): GatewayEventSink {
    return {
      emit: async (type, payload) => {
        await this.recordEvent(teamId, this.buildGatewayRuntimeEvent(type, payload));
      },
    };
  }

  private buildDegradedMembers(agents: TeamAgent[], executionInfo: TeamExecutionInfo) {
    const reason =
      executionInfo.diagnostics?.fallbackReason ??
      (executionInfo.state === 'failed' ? 'execution_failed' : undefined);
    if (!reason) return [];

    return agents
      .filter((agent) => agent.role !== 'leader')
      .map((agent) => ({
        slotId: agent.slotId,
        agentName: agent.agentName,
        reason,
      }));
  }

  private buildTaskDiagnostics(
    tasks: Array<{
      id: string;
      subject: string;
      owner?: string;
      status: 'pending' | 'in_progress' | 'completed' | 'deleted';
      blockedBy: string[];
    }>
  ) {
    const waiting = tasks
      .filter((task) => task.status === 'pending' && task.blockedBy.length > 0)
      .map((task) => ({
        taskId: task.id,
        subject: task.subject,
        blockedBy: task.blockedBy,
        owner: task.owner,
      }));

    return {
      pending: tasks.filter((task) => task.status === 'pending').length,
      inProgress: tasks.filter((task) => task.status === 'in_progress').length,
      completed: tasks.filter((task) => task.status === 'completed').length,
      waiting,
    };
  }

  private mergeTaskDiagnostics(stored: TeamRuntimeSnapshot['taskDiagnostics'], rebuilt: TeamRuntimeSnapshot['taskDiagnostics']) {
    const rebuiltHasSignals =
      rebuilt.pending > 0 || rebuilt.inProgress > 0 || rebuilt.completed > 0 || rebuilt.waiting.length > 0;
    return rebuiltHasSignals ? rebuilt : stored;
  }

  private buildSummary(snapshot: TeamRuntimeSnapshot): string[] {
    const protocolDiagnostics = this.normalizeProtocolDiagnostics(snapshot.protocolDiagnostics);
    const gatewayDiagnostics = this.normalizeGatewayDiagnostics(snapshot.gatewayDiagnostics);
    const summary = [
      `execution_kind:${snapshot.executionInfo.executionKind}`,
      `orchestration_mode:${snapshot.executionInfo.orchestrationMode}`,
      `execution_state:${snapshot.executionInfo.state}`,
      `degraded_members:${snapshot.degradedMembers.length}`,
      `pending_tasks:${snapshot.taskDiagnostics.pending}`,
      `waiting_tasks:${snapshot.taskDiagnostics.waiting.length}`,
    ];

    if (snapshot.executionInfo.executionKind === 'protocol') {
      summary.push(`protocol_active_owners:${protocolDiagnostics.activeOwners.length}`);
      summary.push(`protocol_recovery_hints:${protocolDiagnostics.recentRecovery.length}`);
    }
    if (snapshot.executionInfo.executionKind === 'gateway') {
      summary.push(`gateway_active_sessions:${gatewayDiagnostics.activeSessions.length}`);
      summary.push(
        `gateway_degraded_members:${gatewayDiagnostics.lifecycle.filter((item) => item.lifecycleState === 'degraded').length}`
      );
    }

    if (snapshot.executionInfo.diagnostics?.fallbackReason) {
      summary.push(`fallback_reason:${snapshot.executionInfo.diagnostics.fallbackReason}`);
    }
    if (snapshot.executionInfo.recovery) {
      summary.push(`recovery_source:${snapshot.executionInfo.recovery.source}`);
      summary.push(`recovery_preferred_mode:${snapshot.executionInfo.recovery.preferredMode}`);
      summary.push(`recovery_replay_ready:${String(snapshot.executionInfo.recovery.replayReady)}`);
      summary.push(`recovery_resume_ready:${String(snapshot.executionInfo.recovery.resumeReady)}`);
    }
    if (snapshot.executionInfo.recoveryPlan) {
      summary.push(`recovery_plan_status:${snapshot.executionInfo.recoveryPlan.status}`);
      summary.push(`recovery_plan_mode:${snapshot.executionInfo.recoveryPlan.mode}`);
    }

    return summary;
  }

  private buildProtocolDiagnostics(
    tasks: Array<{
      id: string;
      subject: string;
      owner?: string;
      status: 'pending' | 'in_progress' | 'completed' | 'deleted';
      updatedAt: number;
      metadata: Record<string, unknown>;
    }>,
    timeline: TeamRuntimeEvent[]
  ): TeamProtocolDiagnostics {
    const ownershipByTask = new Map<string, TeamProtocolOwnershipRecord>();
    const recentRecovery: TeamProtocolRecoveryHint[] = [];
    const leaderSummaries: TeamProtocolDiagnostics['leaderSummaries'] = [];

    for (const task of tasks) {
      ownershipByTask.set(task.id, {
        taskId: task.id,
        subject: task.subject,
        owner: task.owner,
        previousOwner:
          typeof task.metadata.reassignedFromOwner === 'string' ? String(task.metadata.reassignedFromOwner) : undefined,
        ownershipStatus:
          task.owner && task.metadata.reassignedFromOwner
            ? 'reassigned'
            : task.owner
              ? 'assigned'
              : 'unassigned',
        taskStatus: task.status,
        updatedAt: task.updatedAt,
      });
    }

    for (const event of timeline) {
      if (!event.type.startsWith('protocol_')) {
        continue;
      }

      const details = (event.details ?? {}) as Record<string, unknown>;
      const taskId = typeof details.taskId === 'string' ? details.taskId : undefined;
      const subject = typeof details.subject === 'string' ? details.subject : undefined;
      const owner = typeof details.owner === 'string' ? details.owner : undefined;
      const previousOwner = typeof details.fromOwnerId === 'string' ? details.fromOwnerId : undefined;
      const workerBackend = typeof details.workerBackend === 'string' ? details.workerBackend : undefined;
      const leaderSummary = typeof details.leaderSummary === 'string' ? details.leaderSummary : undefined;
      const recoveryHint = typeof details.recoveryHint === 'string' ? details.recoveryHint : undefined;
      const recoveryAction = typeof details.recoveryAction === 'string' ? details.recoveryAction : undefined;
      const recoveryMode = typeof details.recoveryMode === 'string' ? details.recoveryMode : undefined;
      const ownershipStatus = this.resolveOwnershipStatus(event.type, details);
      const taskStatus = this.resolveTaskStatus(event.type, details);

      if (taskId && subject) {
        const existing = ownershipByTask.get(taskId);
        ownershipByTask.set(taskId, {
          ...existing,
          taskId,
          subject,
          owner: owner ?? existing?.owner,
          previousOwner: previousOwner ?? existing?.previousOwner,
          ownershipStatus,
          taskStatus: taskStatus ?? existing?.taskStatus,
          updatedAt: event.at,
          workerBackend: workerBackend ?? existing?.workerBackend,
          leaderSummary: leaderSummary ?? existing?.leaderSummary,
          recoveryHint: recoveryHint ?? existing?.recoveryHint,
          recoveryAction: recoveryAction ?? existing?.recoveryAction,
          recoveryMode: recoveryMode ?? existing?.recoveryMode,
        });
      }

      if (leaderSummary) {
        leaderSummaries.push({
          eventId: event.id,
          at: event.at,
          slotId: typeof details.slotId === 'string' ? details.slotId : undefined,
          taskId,
          summary: leaderSummary,
        });
      }

      if (recoveryHint || recoveryAction || recoveryMode) {
        recentRecovery.push({
          taskId,
          slotId: typeof details.slotId === 'string' ? details.slotId : undefined,
          owner,
          workerBackend,
          recoveryAction,
          recoveryMode,
          leaderSummary: leaderSummary ?? event.message,
          recoveryHint,
          updatedAt: event.at,
          sourceEventType: event.type,
        });
      }
    }

    const ownership = [...ownershipByTask.values()].sort((left, right) => right.updatedAt - left.updatedAt);
    const activeOwnersMap = new Map<string, { ownerId: string; taskCount: number; taskIds: string[] }>();
    for (const record of ownership) {
      if (!record.owner || record.taskStatus === 'completed' || record.taskStatus === 'deleted') {
        continue;
      }
      const existing = activeOwnersMap.get(record.owner) ?? {
        ownerId: record.owner,
        taskCount: 0,
        taskIds: [],
      };
      existing.taskCount += 1;
      existing.taskIds.push(record.taskId);
      activeOwnersMap.set(record.owner, existing);
    }

    return {
      activeOwners: [...activeOwnersMap.values()].sort((left, right) => right.taskCount - left.taskCount),
      ownership: ownership.slice(0, 12),
      recentRecovery: recentRecovery.sort((left, right) => right.updatedAt - left.updatedAt).slice(0, 8),
      leaderSummaries: leaderSummaries.sort((left, right) => right.at - left.at).slice(0, 8),
    };
  }

  private normalizeProtocolDiagnostics(protocolDiagnostics: TeamProtocolDiagnostics | undefined): TeamProtocolDiagnostics {
    return {
      activeOwners: protocolDiagnostics?.activeOwners ?? [],
      ownership: protocolDiagnostics?.ownership ?? [],
      recentRecovery: protocolDiagnostics?.recentRecovery ?? [],
      leaderSummaries: protocolDiagnostics?.leaderSummaries ?? [],
    };
  }

  private mergeProtocolDiagnostics(
    stored: TeamProtocolDiagnostics,
    rebuilt: TeamProtocolDiagnostics
  ): TeamProtocolDiagnostics {
    const activeOwnersById = new Map(stored.activeOwners.map((owner) => [owner.ownerId, owner]));
    for (const owner of rebuilt.activeOwners) {
      const existing = activeOwnersById.get(owner.ownerId);
      if (!existing) {
        activeOwnersById.set(owner.ownerId, owner);
        continue;
      }
      activeOwnersById.set(owner.ownerId, {
        ownerId: owner.ownerId,
        taskCount: Math.max(existing.taskCount, owner.taskCount),
        taskIds: [...new Set([...existing.taskIds, ...owner.taskIds])],
      });
    }

    const ownershipByTaskId = new Map(stored.ownership.map((record) => [record.taskId, record]));
    for (const record of rebuilt.ownership) {
      const existing = ownershipByTaskId.get(record.taskId);
      if (!existing || record.updatedAt >= existing.updatedAt) {
        ownershipByTaskId.set(record.taskId, { ...existing, ...record });
      }
    }

    const recoveryKey = (record: TeamProtocolDiagnostics['recentRecovery'][number]) =>
      `${record.taskId ?? 'none'}:${record.slotId ?? 'none'}:${record.sourceEventType}:${record.updatedAt}`;
    const summaryKey = (record: TeamProtocolDiagnostics['leaderSummaries'][number]) =>
      `${record.eventId}:${record.slotId ?? 'none'}:${record.taskId ?? 'none'}`;

    return {
      activeOwners: [...activeOwnersById.values()].sort((left, right) => right.taskCount - left.taskCount),
      ownership: [...ownershipByTaskId.values()].sort((left, right) => right.updatedAt - left.updatedAt).slice(0, 12),
      recentRecovery: [...stored.recentRecovery, ...rebuilt.recentRecovery]
        .filter((record, index, list) => list.findIndex((item) => recoveryKey(item) === recoveryKey(record)) === index)
        .sort((left, right) => right.updatedAt - left.updatedAt)
        .slice(0, 8),
      leaderSummaries: [...stored.leaderSummaries, ...rebuilt.leaderSummaries]
        .filter((record, index, list) => list.findIndex((item) => summaryKey(item) === summaryKey(record)) === index)
        .sort((left, right) => right.at - left.at)
        .slice(0, 8),
    };
  }

  private buildGatewayDiagnostics(
    tasks: Array<{
      id: string;
      subject: string;
      owner?: string;
      status: 'pending' | 'in_progress' | 'completed' | 'deleted';
      updatedAt: number;
      metadata: Record<string, unknown>;
    }>,
    timeline: TeamRuntimeEvent[]
  ): TeamGatewayDiagnostics {
    const lifecycleBySlot = new Map<string, TeamGatewayLifecycleRecord>();
    const ownershipByTask = new Map<string, TeamGatewayTaskOwnershipRecord>();

    for (const task of tasks) {
      ownershipByTask.set(task.id, {
        taskId: task.id,
        subject: task.subject,
        owner: task.owner,
        taskStatus: task.status,
        updatedAt: task.updatedAt,
      });
    }

    for (const event of timeline) {
      if (!event.type.startsWith('gateway_')) {
        continue;
      }

      const details = (event.details ?? {}) as Record<string, unknown>;
      const slotId = typeof details.slotId === 'string' ? details.slotId : undefined;
      const taskId = typeof details.taskId === 'string' ? details.taskId : undefined;
      const subject = typeof details.subject === 'string' ? details.subject : undefined;
      const owner = typeof details.owner === 'string' ? details.owner : undefined;
      const workerBackend = typeof details.workerBackend === 'string' ? details.workerBackend : undefined;
      const gatewaySessionId = typeof details.gatewaySessionId === 'string' ? details.gatewaySessionId : undefined;
      const lifecycleState = this.resolveGatewayLifecycleState(event.type, details);
      const runtimeStatus = this.resolveGatewayRuntimeStatus(details.runtimeStatus);
      const degradedReason = typeof details.degradedReason === 'string' ? details.degradedReason : undefined;
      const recoveryHint = typeof details.recoveryHint === 'string' ? details.recoveryHint : undefined;
      const recoveryAction = typeof details.recoveryAction === 'string' ? details.recoveryAction : undefined;
      const recoveryMode = typeof details.recoveryMode === 'string' ? details.recoveryMode : undefined;
      const taskStatus = this.resolveGatewayTaskStatus(event.type, details);

      if (slotId && lifecycleState) {
        lifecycleBySlot.set(slotId, {
          slotId,
          workerBackend,
          gatewaySessionId,
          lifecycleState,
          runtimeStatus,
          degradedReason,
          recoveryHint,
          recoveryAction,
          recoveryMode,
          updatedAt: event.at,
          sourceEventType: event.type,
        });
      }

      if (taskId && subject) {
        const existing = ownershipByTask.get(taskId);
        ownershipByTask.set(taskId, {
          ...existing,
          taskId,
          subject,
          owner: owner ?? existing?.owner,
          workerBackend: workerBackend ?? existing?.workerBackend,
          gatewaySessionId: gatewaySessionId ?? existing?.gatewaySessionId,
          taskStatus: taskStatus ?? existing?.taskStatus,
          updatedAt: event.at,
          lifecycleState: lifecycleState ?? existing?.lifecycleState,
          degradedReason: degradedReason ?? existing?.degradedReason,
          recoveryHint: recoveryHint ?? existing?.recoveryHint,
          recoveryAction: recoveryAction ?? existing?.recoveryAction,
          recoveryMode: recoveryMode ?? existing?.recoveryMode,
        });
      }
    }

    const lifecycle = [...lifecycleBySlot.values()].sort((left, right) => right.updatedAt - left.updatedAt);
    const taskOwnership = [...ownershipByTask.values()].sort((left, right) => right.updatedAt - left.updatedAt).slice(0, 12);
    const activeSessions = lifecycle.map((record) => ({
      slotId: record.slotId,
      gatewaySessionId: record.gatewaySessionId,
      lifecycleState: record.lifecycleState,
      taskCount: taskOwnership.filter(
        (task) => task.owner === record.slotId && task.taskStatus !== 'completed' && task.taskStatus !== 'deleted'
      ).length,
    }));

    return {
      activeSessions,
      lifecycle,
      taskOwnership,
    };
  }

  private normalizeGatewayDiagnostics(gatewayDiagnostics: TeamGatewayDiagnostics | undefined): TeamGatewayDiagnostics {
    return {
      activeSessions: gatewayDiagnostics?.activeSessions ?? [],
      lifecycle: gatewayDiagnostics?.lifecycle ?? [],
      taskOwnership: gatewayDiagnostics?.taskOwnership ?? [],
    };
  }

  private mergeGatewayDiagnostics(stored: TeamGatewayDiagnostics, rebuilt: TeamGatewayDiagnostics): TeamGatewayDiagnostics {
    const lifecycleBySlot = new Map(stored.lifecycle.map((record) => [record.slotId, record]));
    for (const record of rebuilt.lifecycle) {
      const existing = lifecycleBySlot.get(record.slotId);
      if (!existing || record.updatedAt >= existing.updatedAt) {
        lifecycleBySlot.set(record.slotId, { ...existing, ...record });
      }
    }

    const taskOwnershipById = new Map(stored.taskOwnership.map((record) => [record.taskId, record]));
    for (const record of rebuilt.taskOwnership) {
      const existing = taskOwnershipById.get(record.taskId);
      if (!existing || record.updatedAt >= existing.updatedAt) {
        taskOwnershipById.set(record.taskId, { ...existing, ...record });
      }
    }

    const activeSessionsBySlot = new Map(stored.activeSessions.map((record) => [record.slotId, record]));
    for (const record of rebuilt.activeSessions) {
      const existing = activeSessionsBySlot.get(record.slotId);
      if (!existing || record.taskCount >= existing.taskCount) {
        activeSessionsBySlot.set(record.slotId, record);
      }
    }

    return {
      activeSessions: [...activeSessionsBySlot.values()].sort((left, right) => right.taskCount - left.taskCount),
      lifecycle: [...lifecycleBySlot.values()].sort((left, right) => right.updatedAt - left.updatedAt),
      taskOwnership: [...taskOwnershipById.values()].sort((left, right) => right.updatedAt - left.updatedAt).slice(0, 12),
    };
  }

  private resolveOwnershipStatus(
    eventType: TeamRuntimeEvent['type'],
    details: Record<string, unknown>
  ): TeamProtocolOwnershipRecord['ownershipStatus'] {
    const explicitStatus = details.ownershipStatus;
    if (
      explicitStatus === 'assigned' ||
      explicitStatus === 'unassigned' ||
      explicitStatus === 'reassigned' ||
      explicitStatus === 'returned_to_leader' ||
      explicitStatus === 'blocked'
    ) {
      return explicitStatus;
    }

    if (eventType === 'protocol_reassigned') {
      return typeof details.toOwnerId === 'string' ? 'reassigned' : 'unassigned';
    }
    if (eventType === 'protocol_failed') {
      return 'blocked';
    }

    return typeof details.owner === 'string' ? 'assigned' : 'unassigned';
  }

  private resolveTaskStatus(
    eventType: TeamRuntimeEvent['type'],
    details: Record<string, unknown>
  ): TeamProtocolOwnershipRecord['taskStatus'] | undefined {
    const explicitStatus = details.taskStatus;
    if (
      explicitStatus === 'pending' ||
      explicitStatus === 'in_progress' ||
      explicitStatus === 'completed' ||
      explicitStatus === 'deleted' ||
      explicitStatus === 'failed'
    ) {
      return explicitStatus;
    }

    if (eventType === 'protocol_dispatch') return 'pending';
    if (eventType === 'protocol_progress') return 'in_progress';
    if (eventType === 'protocol_completed') return 'completed';
    if (eventType === 'protocol_failed') return 'failed';
    return undefined;
  }

  private buildProtocolRuntimeEvent(
    type: ProtocolWorkerEventType,
    payload: ProtocolWorkerEventPayload
  ): Omit<TeamRuntimeEvent, 'id' | 'teamId'> {
    const runtimeEventType =
      type === 'dispatch'
        ? 'protocol_dispatch'
        : type === 'progress'
          ? 'protocol_progress'
          : type === 'complete'
            ? 'protocol_completed'
            : type === 'fail'
              ? 'protocol_failed'
              : 'protocol_reassigned';

    return {
      at: Date.now(),
      type: runtimeEventType,
      level: payload.level ?? 'info',
      message: payload.message,
      details: {
        slotId: payload.slotId,
        taskId: payload.taskId,
        subject: payload.subject,
        owner: payload.owner,
        fromOwnerId: payload.fromOwnerId,
        toOwnerId: payload.toOwnerId,
        leaderSlotId: payload.leaderSlotId,
        workerBackend: payload.workerBackend,
        leaderSummary: payload.leaderSummary,
        recoveryHint: payload.recoveryHint,
        recoveryAction: payload.recoveryAction,
        recoveryMode: payload.recoveryMode,
        ownershipStatus: payload.ownershipStatus,
        taskStatus: payload.taskStatus,
        ...(payload.details ?? {}),
      },
    };
  }

  private resolveGatewayLifecycleState(
    eventType: TeamRuntimeEvent['type'],
    details: Record<string, unknown>
  ): TeamGatewayLifecycleRecord['lifecycleState'] | undefined {
    const explicitState = details.lifecycleState;
    if (
      explicitState === 'connecting' ||
      explicitState === 'connected' ||
      explicitState === 'session_active' ||
      explicitState === 'reconnecting' ||
      explicitState === 'disconnected' ||
      explicitState === 'degraded' ||
      explicitState === 'recovering' ||
      explicitState === 'completed' ||
      explicitState === 'failed'
    ) {
      return explicitState;
    }

    if (eventType === 'gateway_dispatch') return 'connecting';
    if (eventType === 'gateway_progress') return 'connected';
    if (eventType === 'gateway_completed') return 'completed';
    if (eventType === 'gateway_failed') return 'failed';
    if (eventType === 'gateway_degraded') return 'degraded';
    if (eventType === 'gateway_recovered') return 'recovering';
    return undefined;
  }

  private resolveGatewayRuntimeStatus(detailsValue: unknown) {
    if (
      detailsValue === 'connecting' ||
      detailsValue === 'connected' ||
      detailsValue === 'session_active' ||
      detailsValue === 'reconnecting' ||
      detailsValue === 'disconnected' ||
      detailsValue === 'idle'
    ) {
      return detailsValue;
    }
    return undefined;
  }

  private resolveGatewayTaskStatus(
    eventType: TeamRuntimeEvent['type'],
    details: Record<string, unknown>
  ): TeamGatewayTaskOwnershipRecord['taskStatus'] | undefined {
    const explicitStatus = details.taskStatus;
    if (
      explicitStatus === 'pending' ||
      explicitStatus === 'in_progress' ||
      explicitStatus === 'completed' ||
      explicitStatus === 'deleted' ||
      explicitStatus === 'failed'
    ) {
      return explicitStatus;
    }

    if (eventType === 'gateway_dispatch') return 'pending';
    if (eventType === 'gateway_progress') return 'in_progress';
    if (eventType === 'gateway_completed') return 'completed';
    if (eventType === 'gateway_failed' || eventType === 'gateway_degraded') return 'failed';
    return undefined;
  }

  private buildGatewayRuntimeEvent(
    type: GatewayWorkerEventType,
    payload: GatewayWorkerEventPayload
  ): Omit<TeamRuntimeEvent, 'id' | 'teamId'> {
    const runtimeEventType =
      type === 'dispatch'
        ? 'gateway_dispatch'
        : type === 'progress'
          ? 'gateway_progress'
          : type === 'complete'
            ? 'gateway_completed'
            : type === 'degrade'
              ? 'gateway_degraded'
              : type === 'recover'
                ? 'gateway_recovered'
                : 'gateway_failed';

    return {
      at: Date.now(),
      type: runtimeEventType,
      level: payload.level ?? (type === 'fail' || type === 'degrade' ? 'warning' : 'info'),
      message: payload.message,
      details: {
        slotId: payload.slotId,
        taskId: payload.taskId,
        subject: payload.subject,
        owner: payload.owner,
        workerBackend: payload.workerBackend,
        gatewaySessionId: payload.gatewaySessionId,
        lifecycleState: payload.lifecycleState,
        runtimeStatus: payload.runtimeStatus,
        degradedReason: payload.degradedReason,
        recoveryHint: payload.recoveryHint,
        recoveryAction: payload.recoveryAction,
        recoveryMode: payload.recoveryMode,
        ...(payload.details ?? {}),
      },
    };
  }
}
