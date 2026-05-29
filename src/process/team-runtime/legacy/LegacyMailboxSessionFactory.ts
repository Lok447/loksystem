import type { IConversationService } from '@process/services/IConversationService';
import type { IWorkerTaskManager } from '@process/task/IWorkerTaskManager';
import type { AgentType } from '@process/task/agentTypes';
import { TeamSession } from '@process/team/TeamSession';
import type { ITeamRepository } from '@process/team/repository/ITeamRepository';
import type { TeamAgent, TTeam } from '@process/team/types';
import type { TeamExecutionEngineKind } from '../ITeamOrchestrationEngine';
import type { TeamOrchestrationMode } from '@/common/types/teamTypes';
import type { TeamExecutionContext, TeamExecutionDiagnostics } from '../ITeamExecutionSession';
import { LegacyExecutionSession } from './LegacyExecutionSession';
import type { ProtocolEventSink } from '../protocol';
import type { GatewayEventSink } from '../gateway';

type LegacyMailboxSessionFactoryParams = {
  repo: ITeamRepository;
  workerTaskManager: IWorkerTaskManager;
  conversationService: IConversationService;
  addAgent: (teamId: string, agent: Omit<TeamAgent, 'slotId'>) => Promise<TeamAgent>;
  resolveWorkerBackend: (agentType: string | undefined, agents: TeamAgent[]) => Promise<string>;
  resolveConversationType: (agentType: string) => AgentType;
  createProtocolEventSink?: (teamId: string) => ProtocolEventSink;
  createGatewayEventSink?: (teamId: string) => GatewayEventSink;
};

type LegacyMailboxSessionCreateOptions = {
  executionKind?: TeamExecutionEngineKind;
  orchestrationMode?: TeamOrchestrationMode;
  context?: TeamExecutionContext;
  diagnostics?: TeamExecutionDiagnostics;
};

export class LegacyMailboxSessionFactory {
  constructor(private readonly params: LegacyMailboxSessionFactoryParams) {}

  async create(team: TTeam, options: LegacyMailboxSessionCreateOptions = {}): Promise<LegacyExecutionSession> {
    let session!: TeamSession;

    const spawnAgent = async (agentName: string, agentType?: string, model?: string, customAgentId?: string) => {
      const resolvedType = await this.params.resolveWorkerBackend(agentType, team.agents);
      const newAgent = await this.params.addAgent(team.id, {
        conversationId: '',
        role: 'teammate',
        agentType: resolvedType,
        agentName,
        status: 'pending',
        conversationType: this.params.resolveConversationType(resolvedType) as TeamAgent['conversationType'],
        model,
        customAgentId,
      });

      const stdioConfig = session.getStdioConfig(newAgent.slotId);
      if (stdioConfig && newAgent.conversationId) {
        await this.params.conversationService.updateConversation(
          newAgent.conversationId,
          { extra: { teamMcpStdioConfig: stdioConfig } } as any,
          true
        );
      }

      return newAgent;
    };

    session = new TeamSession(
      team,
      this.params.repo,
      this.params.workerTaskManager,
      spawnAgent,
      this.params.createProtocolEventSink?.(team.id),
      this.params.createGatewayEventSink?.(team.id)
    );
    return new LegacyExecutionSession(session, options);
  }
}
