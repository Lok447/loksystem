import type { CreateTeamExecutionSessionParams, TeamExecutionSessionMetadata } from '../ITeamOrchestrationEngine';
import { ProtocolExecutionSession } from './ProtocolExecutionSession';
import type { ITeamExecutionSession } from '../ITeamExecutionSession';
import { AcpMemberAdapter } from './AcpMemberAdapter';

type ProtocolSessionFactoryParams = {
  createCompatibilitySession: (params: CreateTeamExecutionSessionParams) => ITeamExecutionSession | Promise<ITeamExecutionSession>;
  acpAdapter?: AcpMemberAdapter;
};

export class ProtocolSessionFactory {
  private readonly acpAdapter: AcpMemberAdapter;

  constructor(private readonly params: ProtocolSessionFactoryParams) {
    this.acpAdapter = params.acpAdapter ?? new AcpMemberAdapter();
  }

  async create(params: CreateTeamExecutionSessionParams): Promise<ProtocolExecutionSession> {
    const compatibilitySession = await this.params.createCompatibilitySession(params);
    const metadata = params.executionMetadata;

    return new ProtocolExecutionSession(compatibilitySession, {
      acpAdapter: this.acpAdapter,
      team: {
        leaderAgentId: params.team.leaderAgentId,
        agents: params.team.agents,
      },
      context: this.buildContext(params, metadata),
      diagnostics: this.buildDiagnostics(metadata),
    });
  }

  private buildContext(
    params: CreateTeamExecutionSessionParams,
    metadata: TeamExecutionSessionMetadata | undefined
  ) {
    return {
      compatibilityMode: 'legacy_mailbox' as const,
      ...metadata?.context,
      leaderBackend:
        metadata?.context?.leaderBackend ?? params.team.agents.find((agent) => agent.role === 'leader')?.agentType,
      memberCount: metadata?.context?.memberCount ?? params.team.agents.length,
    };
  }

  private buildDiagnostics(metadata: TeamExecutionSessionMetadata | undefined) {
    if (!metadata?.diagnostics && !metadata?.fallbackReason) {
      return undefined;
    }

    return {
      summary: metadata.diagnostics?.summary ?? [],
      fallbackReason: metadata.diagnostics?.fallbackReason ?? metadata.fallbackReason,
    };
  }
}
