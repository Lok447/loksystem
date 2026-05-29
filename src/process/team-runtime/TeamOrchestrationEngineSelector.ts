import { TeamCapabilityResolver } from '@/common/team/TeamCapabilityResolver';
import type { AcpInitializeResult } from '@/common/types/acpTypes';
import type { TTeam } from '@process/team/types';
import type { ITeamOrchestrationEngine } from './ITeamOrchestrationEngine';

export type HermesNativeRoutingMode = 'off' | 'shadow' | 'enabled';

export type TeamEngineSelection = {
  engine: ITeamOrchestrationEngine;
  routingMode: HermesNativeRoutingMode;
  requestedEngine?: ITeamOrchestrationEngine['kind'];
  fallbackReason?: string;
};

type TeamOrchestrationEngineSelectorParams = {
  legacyEngine: ITeamOrchestrationEngine;
  hermesNativeEngine: ITeamOrchestrationEngine;
  protocolEngine: ITeamOrchestrationEngine;
  gatewayEngine: ITeamOrchestrationEngine;
};

export class TeamOrchestrationEngineSelector {
  constructor(private readonly params: TeamOrchestrationEngineSelectorParams) {}

  select(input: {
    team: TTeam;
    cachedInitResults: Record<string, AcpInitializeResult> | null | undefined;
    hermesNativeRouting: HermesNativeRoutingMode;
  }): TeamEngineSelection {
    const { team, cachedInitResults, hermesNativeRouting } = input;
    const legacySelection: TeamEngineSelection = {
      engine: this.params.legacyEngine,
      routingMode: hermesNativeRouting,
    };

    const leader = team.agents.find((agent) => agent.role === 'leader');
    if (!leader) {
      return {
        ...legacySelection,
        requestedEngine: this.params.hermesNativeEngine.kind,
        fallbackReason: 'missing_leader',
      };
    }

    const capabilities = TeamCapabilityResolver.resolve(leader.agentType, cachedInitResults);
    const hermesEligible =
      leader.agentType === 'hermes' &&
      capabilities.supportsNativeDelegation &&
      capabilities.recommendedTeamMode === 'native_orchestrator';

    if (
      !hermesEligible &&
      capabilities.currentlySupported &&
      capabilities.recommendedTeamMode === 'protocol_coordinated' &&
      this.params.protocolEngine.readiness === 'ready'
    ) {
      return {
        engine: this.params.protocolEngine,
        routingMode: hermesNativeRouting,
        requestedEngine: this.params.protocolEngine.kind,
      };
    }

    if (
      !hermesEligible &&
      capabilities.currentlySupported &&
      capabilities.recommendedTeamMode === 'gateway_coordinated' &&
      this.params.gatewayEngine.readiness === 'ready'
    ) {
      return {
        engine: this.params.gatewayEngine,
        routingMode: hermesNativeRouting,
        requestedEngine: this.params.gatewayEngine.kind,
      };
    }

    if (!hermesEligible) {
      return {
        ...legacySelection,
        requestedEngine:
          capabilities.recommendedTeamMode === 'protocol_coordinated'
            ? this.params.protocolEngine.kind
            : capabilities.recommendedTeamMode === 'gateway_coordinated'
              ? this.params.gatewayEngine.kind
            : this.params.hermesNativeEngine.kind,
        fallbackReason: 'leader_not_hermes_native_capable',
      };
    }

    if (hermesNativeRouting === 'off') {
      return {
        ...legacySelection,
        requestedEngine: this.params.hermesNativeEngine.kind,
        fallbackReason: 'feature_flag_off',
      };
    }

    if (hermesNativeRouting === 'shadow') {
      return {
        ...legacySelection,
        requestedEngine: this.params.hermesNativeEngine.kind,
        fallbackReason: 'shadow_mode_compatibility_routing',
      };
    }

    if (this.params.hermesNativeEngine.readiness !== 'ready') {
      return {
        ...legacySelection,
        requestedEngine: this.params.hermesNativeEngine.kind,
        fallbackReason: 'engine_not_ready',
      };
    }

    return {
      engine: this.params.hermesNativeEngine,
      routingMode: hermesNativeRouting,
      requestedEngine: this.params.hermesNativeEngine.kind,
    };
  }
}
