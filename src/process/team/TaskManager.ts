// src/process/team/TaskManager.ts
import type { ITeamRepository } from './repository/ITeamRepository';
import type { TeamTask } from './types';
import type { ProtocolEventSink } from '@process/team-runtime/protocol';
import type { GatewayEventSink, GatewayWorkerEventType } from '@process/team-runtime/gateway';
import type { GatewayRuntimeSnapshot } from '@process/team-runtime/gateway';

/** Parameters for creating a new task */
type CreateTaskParams = {
  teamId: string;
  subject: string;
  description?: string;
  owner?: string;
  blockedBy?: string[];
};

/** Parameters for updating an existing task */
type UpdateTaskParams = {
  status?: TeamTask['status'];
  owner?: string;
  description?: string;
  metadata?: TeamTask['metadata'];
};

/**
 * Service layer for task CRUD with dependency graph resolution.
 * Maintains bidirectional links between tasks via `blockedBy` / `blocks`.
 */
export class TaskManager {
  constructor(
    private readonly repo: ITeamRepository,
    private readonly protocolEventSink?: ProtocolEventSink,
    private readonly gatewayEventSink?: GatewayEventSink,
    private readonly resolveWorkerBackend?: (slotId?: string) => string | undefined,
    private readonly resolveGatewayRuntime?: (slotId?: string) => GatewayRuntimeSnapshot | null
  ) {}

  private isGatewayBackend(slotId?: string): boolean {
    return this.resolveWorkerBackend?.(slotId) === 'openclaw-gateway';
  }

  private getGatewayRuntime(slotId?: string): GatewayRuntimeSnapshot | null {
    return this.resolveGatewayRuntime?.(slotId) ?? null;
  }

  private async emitDispatch(task: TeamTask): Promise<void> {
    if (this.isGatewayBackend(task.owner)) {
      const runtime = this.getGatewayRuntime(task.owner);
      await this.gatewayEventSink?.emit('dispatch', {
        slotId: task.owner,
        taskId: task.id,
        subject: task.subject,
        owner: task.owner,
        workerBackend: this.resolveWorkerBackend?.(task.owner),
        gatewaySessionId: runtime?.gatewaySessionId,
        lifecycleState: runtime?.lifecycleState ?? 'connecting',
        runtimeStatus: runtime?.runtimeStatus,
        message: `Gateway task dispatched: ${task.subject}`,
        recoveryHint: task.owner ? 'Wait for gateway worker session to connect and acknowledge the task.' : undefined,
        details: {
          statusReason: runtime?.statusReason,
        },
      });
      return;
    }

    await this.protocolEventSink?.emit('dispatch', {
      slotId: task.owner,
      taskId: task.id,
      subject: task.subject,
      owner: task.owner,
      ownershipStatus: task.owner ? 'assigned' : 'unassigned',
      taskStatus: task.status,
      message: `Task dispatched: ${task.subject}`,
      leaderSummary: task.owner
        ? `Leader assigned "${task.subject}" to ${task.owner}.`
        : `Leader created unassigned task "${task.subject}".`,
      details: {
        owner: task.owner,
        blockedBy: task.blockedBy,
      },
    });
  }

  private async emitProgress(task: TeamTask): Promise<void> {
    if (this.isGatewayBackend(task.owner)) {
      const runtime = this.getGatewayRuntime(task.owner);
      await this.gatewayEventSink?.emit('progress', {
        slotId: task.owner,
        taskId: task.id,
        subject: task.subject,
        owner: task.owner,
        workerBackend: this.resolveWorkerBackend?.(task.owner),
        gatewaySessionId: runtime?.gatewaySessionId,
        lifecycleState: runtime?.lifecycleState ?? (runtime?.hasActiveSession ? 'session_active' : 'connected'),
        runtimeStatus: runtime?.runtimeStatus,
        message: `Gateway task in progress: ${task.subject}`,
        details: {
          statusReason: runtime?.statusReason,
        },
      });
      return;
    }

    await this.protocolEventSink?.emit('progress', {
      slotId: task.owner,
      taskId: task.id,
      subject: task.subject,
      owner: task.owner,
      ownershipStatus: task.owner ? 'assigned' : 'unassigned',
      taskStatus: task.status,
      message: `Task in progress: ${task.subject}`,
      leaderSummary: task.owner
        ? `${task.owner} is actively working on "${task.subject}".`
        : `"${task.subject}" is now in progress.`,
      details: {
        owner: task.owner,
      },
    });
  }

  private async emitComplete(task: TeamTask): Promise<void> {
    if (this.isGatewayBackend(task.owner)) {
      const runtime = this.getGatewayRuntime(task.owner);
      await this.gatewayEventSink?.emit('complete', {
        slotId: task.owner,
        taskId: task.id,
        subject: task.subject,
        owner: task.owner,
        workerBackend: this.resolveWorkerBackend?.(task.owner),
        gatewaySessionId: runtime?.gatewaySessionId,
        lifecycleState: 'completed',
        runtimeStatus: runtime?.runtimeStatus,
        message: `Gateway task completed: ${task.subject}`,
      });
      return;
    }

    await this.protocolEventSink?.emit('complete', {
      slotId: task.owner,
      taskId: task.id,
      subject: task.subject,
      owner: task.owner,
      ownershipStatus: task.owner ? 'assigned' : 'unassigned',
      taskStatus: task.status,
      message: `Task completed: ${task.subject}`,
      leaderSummary: task.owner
        ? `${task.owner} completed "${task.subject}".`
        : `"${task.subject}" was completed.`,
      details: {
        owner: task.owner,
      },
    });
  }

  private async emitFailure(task: TeamTask, message: string): Promise<void> {
    if (this.isGatewayBackend(task.owner)) {
      const runtime = this.getGatewayRuntime(task.owner);
      await this.gatewayEventSink?.emit('fail', {
        slotId: task.owner,
        taskId: task.id,
        subject: task.subject,
        owner: task.owner,
        workerBackend: this.resolveWorkerBackend?.(task.owner),
        gatewaySessionId: runtime?.gatewaySessionId,
        lifecycleState: runtime?.lifecycleState ?? 'failed',
        runtimeStatus: runtime?.runtimeStatus,
        recoveryAction: 'replay_gateway_session',
        recoveryMode: 'gateway_replay',
        recoveryHint: 'Gateway worker should reconnect before the task is redispatched.',
        message,
        level: 'warning',
        details: {
          statusReason: runtime?.statusReason,
        },
      });
      return;
    }

    await this.protocolEventSink?.emit('fail', {
      slotId: task.owner,
      taskId: task.id,
      subject: task.subject,
      owner: task.owner,
      ownershipStatus: task.owner ? 'assigned' : 'unassigned',
      taskStatus: task.status,
      recoveryAction: 'restart_runtime',
      message,
      leaderSummary: `"${task.subject}" was removed from the active task graph.`,
      recoveryHint: 'Leader should review whether the task needs to be recreated or reassigned.',
      details: {
        owner: task.owner,
      },
      level: 'warning',
    });
  }

  /**
   * Create a new task. Auto-generates ID and timestamps.
   * When `blockedBy` is provided, also updates the `blocks` array of each
   * upstream task to maintain bidirectional links.
   */
  async create(params: CreateTaskParams): Promise<TeamTask> {
    const now = Date.now();
    const task: TeamTask = {
      id: crypto.randomUUID(),
      teamId: params.teamId,
      subject: params.subject,
      description: params.description,
      status: 'pending',
      owner: params.owner,
      blockedBy: params.blockedBy ?? [],
      blocks: [],
      metadata: {},
      createdAt: now,
      updatedAt: now,
    };

    const created = await this.repo.createTask(task);

    // Atomically append to `blocks` on each upstream task (bidirectional link)
    if (created.blockedBy.length > 0) {
      await Promise.all(created.blockedBy.map((upstreamId) => this.repo.appendToBlocks(upstreamId, created.id)));
    }

    await this.emitDispatch(created);

    return created;
  }

  /**
   * Update a task. Auto-updates `updatedAt`. Returns the merged task.
   */
  async update(taskId: string, updates: UpdateTaskParams): Promise<TeamTask> {
    const updated = await this.repo.updateTask(taskId, {
      ...updates,
      updatedAt: Date.now(),
    });

    if (updates.status === 'in_progress') {
      await this.emitProgress(updated);
    } else if (updates.status === 'completed') {
      await this.emitComplete(updated);
    } else if (updates.status === 'deleted') {
      await this.emitFailure(updated, `Task removed: ${updated.subject}`);
    }

    return updated;
  }

  /**
   * List all tasks for a team.
   */
  async list(teamId: string): Promise<TeamTask[]> {
    return this.repo.findTasksByTeam(teamId);
  }

  /**
   * Get tasks assigned to a specific agent.
   */
  async getByOwner(teamId: string, ownerId: string): Promise<TeamTask[]> {
    return this.repo.findTasksByOwner(teamId, ownerId);
  }

  /**
   * Reassign open tasks owned by a teammate who failed or was removed.
   * `in_progress` tasks are reset to `pending` so the new owner can review
   * and explicitly pick them up again.
   */
  async reassignOpenTasks(
    teamId: string,
    fromOwnerId: string,
    toOwnerId?: string,
    reason: 'member_crashed' | 'member_inactive' | 'manual' = 'manual'
  ): Promise<TeamTask[]> {
    if (toOwnerId && toOwnerId === fromOwnerId) {
      return [];
    }

    const ownedTasks = await this.repo.findTasksByOwner(teamId, fromOwnerId);
    const reassignableTasks = ownedTasks.filter((task) => task.status === 'pending' || task.status === 'in_progress');

    if (reassignableTasks.length === 0) {
      return [];
    }

    const reassignedAt = Date.now();
    const reassigned = await Promise.all(
      reassignableTasks.map((task) =>
        this.repo.updateTask(task.id, {
          owner: toOwnerId,
          status: task.status === 'in_progress' ? 'pending' : task.status,
          metadata: {
            ...task.metadata,
            reassignedAt,
            reassignedFromOwner: fromOwnerId,
            reassignedReason: reason,
          },
          updatedAt: reassignedAt,
        })
      )
    );

    await Promise.all(
      reassigned.map(async (task) => {
        if (this.isGatewayBackend(task.owner ?? toOwnerId ?? fromOwnerId)) {
          const runtime = this.getGatewayRuntime(task.owner ?? toOwnerId);
          await this.gatewayEventSink?.emit('recover', {
            slotId: task.owner ?? toOwnerId,
            taskId: task.id,
            subject: task.subject,
            owner: task.owner,
            workerBackend: this.resolveWorkerBackend?.(task.owner ?? toOwnerId),
            gatewaySessionId: runtime?.gatewaySessionId,
            lifecycleState: runtime?.lifecycleState ?? 'recovering',
            runtimeStatus: runtime?.runtimeStatus,
            recoveryAction: 'replay_gateway_session',
            recoveryMode: 'gateway_replay',
            recoveryHint: 'Leader should rebuild gateway session state before redispatching the task.',
            message: `Gateway task reassigned: ${task.subject}`,
            level: 'warning',
            details: {
              fromOwnerId,
              toOwnerId,
              reason,
              statusReason: runtime?.statusReason,
            },
          });
          return;
        }

        await this.protocolEventSink?.emit('reassign', {
          slotId: task.owner,
          taskId: task.id,
          subject: task.subject,
          owner: task.owner,
          fromOwnerId,
          toOwnerId,
          ownershipStatus: toOwnerId
            ? toOwnerId === task.owner && toOwnerId !== fromOwnerId
              ? 'reassigned'
              : 'assigned'
            : 'unassigned',
          taskStatus: task.status,
          recoveryAction:
            reason === 'member_crashed' || reason === 'member_inactive' ? 'replay_protocol_coordination' : undefined,
          recoveryMode: reason === 'member_crashed' || reason === 'member_inactive' ? 'protocol_replay' : undefined,
          message: `Task reassigned: ${task.subject}`,
          leaderSummary: toOwnerId
            ? `Leader reassigned "${task.subject}" from ${fromOwnerId} to ${toOwnerId}.`
            : `Leader unassigned "${task.subject}" from ${fromOwnerId}.`,
          recoveryHint:
            reason === 'member_crashed' || reason === 'member_inactive'
              ? 'Leader should review the reassigned task and decide whether to retry or replace the worker.'
              : undefined,
          details: {
            owner: task.owner,
            fromOwnerId,
            toOwnerId,
            reason,
          },
          level: 'warning',
        });
      })
    );

    return reassigned;
  }

  /**
   * Check if completing a task unblocks other tasks.
   * Removes the given taskId from the `blockedBy` array of every task that
   * depends on it. Returns only those tasks whose `blockedBy` became empty
   * (i.e. tasks that are now fully unblocked).
   */
  async checkUnblocks(taskId: string): Promise<TeamTask[]> {
    // Locate the completed task to get its teamId
    const completedTask = await this.repo.findTaskById(taskId);
    if (!completedTask) return [];

    const allTasks = await this.repo.findTasksByTeam(completedTask.teamId);
    const dependents = allTasks.filter((t) => t.blockedBy.includes(taskId));

    if (dependents.length === 0) return [];

    // Atomically remove taskId from each dependent's blockedBy array
    const updated = await Promise.all(dependents.map((t) => this.repo.removeFromBlockedBy(t.id, taskId)));

    // Clear the completed task's stale blocks pointer (Bug #5)
    await this.repo.updateTask(taskId, { blocks: [], updatedAt: Date.now() });

    return updated.filter((t) => t.blockedBy.length === 0);
  }
}
