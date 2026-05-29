import type { CreateTeamExecutionSessionParams, TeamExecutionSessionMetadata } from '../ITeamOrchestrationEngine';
import type { ITeamExecutionSession } from '../ITeamExecutionSession';
import { GatewayExecutionSession } from './GatewayExecutionSession';
import { OpenClawMemberAdapter } from './OpenClawMemberAdapter';
import type { OpenClawGatewayRuntimeAdapter } from './OpenClawGatewayRuntimeAdapter';

type GatewaySessionFactoryParams = {
  createCompatibilitySession: (params: CreateTeamExecutionSessionParams) => ITeamExecutionSession | Promise<ITeamExecutionSession>;
  gatewayAdapter?: OpenClawMemberAdapter;
  gatewayRuntimeAdapter?: OpenClawGatewayRuntimeAdapter;
};

export class GatewaySessionFactory {
  private readonly gatewayAdapter: OpenClawMemberAdapter;
  private readonly gatewayRuntimeAdapter?: OpenClawGatewayRuntimeAdapter;

  constructor(private readonly params: GatewaySessionFactoryParams) {
    this.gatewayAdapter = params.gatewayAdapter ?? new OpenClawMemberAdapter();
    this.gatewayRuntimeAdapter = params.gatewayRuntimeAdapter;
  }

  async create(params: CreateTeamExecutionSessionParams): Promise<GatewayExecutionSession> {
    const compatibilitySession = await this.params.createCompatibilitySession(params);
    const metadata = params.executionMetadata;

    return new GatewayExecutionSession(compatibilitySession, {
      gatewayAdapter: this.gatewayAdapter,
      gatewayRuntimeAdapter: this.gatewayRuntimeAdapter,
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
      runtimeVersion: metadata?.context?.runtimeVersion ?? 'phase4-gateway-bridge',
      ...metadata?.context,
      gatewayBootstrapMode: 'compatibility_bridge',
      gatewayLifecycleContract: 'native_shell',
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
