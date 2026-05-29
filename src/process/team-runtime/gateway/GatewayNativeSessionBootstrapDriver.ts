import { ipcBridge } from '@/common';
import { mirrorTeamMcpStatus } from '@process/core/team';
import type { IConversationService } from '@process/services/IConversationService';
import type { IWorkerTaskManager } from '@process/task/IWorkerTaskManager';
import type { TTeam, TeamAgent } from '@process/team/types';
import type { ITeamExecutionSession } from '../ITeamExecutionSession';
import type { GatewayEventSink } from './GatewayEventSink';
import type { OpenClawGatewayRuntimeAdapter } from './OpenClawGatewayRuntimeAdapter';
import {
  selectGatewayBootstrapEventType,
  type GatewayNativeLifecycleContract,
} from './GatewayNativeContracts';

type GatewayNativeSessionBootstrapDriverParams = {
  conversationService: IConversationService;
  workerTaskManager: IWorkerTaskManager;
  gatewayRuntimeAdapter?: OpenClawGatewayRuntimeAdapter;
};

function isGatewayAgent(agent: TeamAgent): boolean {
  return agent.agentType === 'openclaw-gateway' || agent.conversationType === 'openclaw-gateway';
}

export class GatewayNativeSessionBootstrapDriver {
  constructor(private readonly params: GatewayNativeSessionBootstrapDriverParams) {}

  async startSession(session: ITeamExecutionSession): Promise<void> {
    await session.start();
  }

  async configureAgentMcp(team: TTeam, session: ITeamExecutionSession, agent: TeamAgent): Promise<void> {
    if (!agent.conversationId) return;

    const agentStdioConfig = session.getStdioConfig(agent.slotId);
    const contract = this.buildLifecycleContract(agent);
    await this.params.conversationService.updateConversation(
      agent.conversationId,
      {
        extra: {
          teamMcpStdioConfig: agentStdioConfig,
          gatewayLifecycleBootstrapMode: contract.bootstrapMode,
          gatewayRuntimeSnapshot: contract.gatewaySessionId || contract.runtimeStatus || contract.lifecycleState
            ? {
                sessionKey: contract.gatewaySessionId,
                runtimeStatus: contract.runtimeStatus,
                lifecycleState: contract.lifecycleState,
                statusReason: contract.statusReason,
              }
            : undefined,
          gatewayWorkerRole: isGatewayAgent(agent) ? contract.role : undefined,
          gatewayLifecycleContract: isGatewayAgent(agent) ? contract : undefined,
        },
      } as any,
      true
    );
  }

  async warmAgent(team: TTeam, agent: TeamAgent, gatewayEventSink?: GatewayEventSink): Promise<void> {
    if (!agent.conversationId) return;

    try {
      const contract = this.buildLifecycleContract(agent);
      const shouldSkipCache = contract.bootstrapMode === 'native_driver';
      const shouldUseWarmSession = contract.bootstrapMode === 'native_driver' && agent.role !== 'leader';
      await this.params.workerTaskManager.getOrBuildTask(agent.conversationId, {
        skipCache: shouldSkipCache || shouldUseWarmSession,
      });
      if (isGatewayAgent(agent)) {
        await this.emitLifecycleEvent(agent, contract, gatewayEventSink);
        const mcpEvent = {
          teamId: team.id,
          slotId: agent.slotId,
          phase: 'session_ready' as const,
          error:
            contract.runtimeStatus || contract.lifecycleState
              ? `gateway_runtime:${contract.runtimeStatus ?? 'unknown'}:${contract.lifecycleState ?? 'unknown'}`
              : undefined,
        };
        ipcBridge.team.mcpStatus.emit(mcpEvent);
        mirrorTeamMcpStatus(mcpEvent);
      }
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      console.error(`[GatewayNativeSessionBootstrapDriver] Failed to warm agent ${agent.slotId}:`, error);
      const mcpEvent = {
        teamId: team.id,
        slotId: agent.slotId,
        phase: 'config_write_failed' as const,
        error,
      };
      ipcBridge.team.mcpStatus.emit(mcpEvent);
      mirrorTeamMcpStatus(mcpEvent);
      throw err;
    }
  }

  buildLifecycleContract(agent: TeamAgent): GatewayNativeLifecycleContract {
    const runtime = isGatewayAgent(agent) ? this.params.gatewayRuntimeAdapter?.getWorkerRuntime(agent) : null;
    return {
      slotId: agent.slotId,
      role: agent.role === 'leader' ? 'leader' : 'worker',
      backend: agent.agentType,
      conversationId: agent.conversationId,
      gatewaySessionId: runtime?.gatewaySessionId,
      bootstrapMode: isGatewayAgent(agent) ? 'native_driver' : 'compatibility_bridge',
      warmupStrategy: isGatewayAgent(agent) ? 'skip_cache' : 'reuse_cache',
      runtimeStatus: runtime?.runtimeStatus,
      lifecycleState: runtime?.lifecycleState,
      statusReason: runtime?.statusReason,
      supportsStructuredTasks: isGatewayAgent(agent),
      supportsResume: isGatewayAgent(agent),
      supportsGatewayLifecycle: isGatewayAgent(agent),
    };
  }

  private async emitLifecycleEvent(
    agent: TeamAgent,
    contract: GatewayNativeLifecycleContract,
    gatewayEventSink?: GatewayEventSink
  ): Promise<void> {
    if (!isGatewayAgent(agent)) return;

    await gatewayEventSink?.emit(selectGatewayBootstrapEventType(contract), {
      slotId: contract.slotId,
      owner: contract.slotId,
      workerBackend: contract.backend,
      gatewaySessionId: contract.gatewaySessionId,
      lifecycleState: contract.lifecycleState,
      runtimeStatus: contract.runtimeStatus,
      recoveryAction: contract.supportsResume ? 'replay_gateway_session' : undefined,
      recoveryMode: contract.supportsResume ? 'gateway_replay' : undefined,
      recoveryHint:
        contract.lifecycleState === 'reconnecting' || contract.lifecycleState === 'recovering'
          ? 'Rebuild the gateway session context before redispatching the worker.'
          : undefined,
      message: `Gateway lifecycle bootstrap prepared for ${agent.agentName} (${agent.slotId})`,
      details: {
        bootstrapMode: contract.bootstrapMode,
        warmupStrategy: contract.warmupStrategy,
        statusReason: contract.statusReason,
        supportsResume: contract.supportsResume,
        supportsStructuredTasks: contract.supportsStructuredTasks,
        supportsGatewayLifecycle: contract.supportsGatewayLifecycle,
      },
    });
  }
}
