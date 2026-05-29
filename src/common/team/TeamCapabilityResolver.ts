import type { AcpInitializeResult } from '@/common/types/acpTypes';

const NATIVE_TEAM_BACKENDS = new Set(['hermes']);
const PROTOCOL_TEAM_BACKENDS = new Set(['codex']);
const GATEWAY_BACKENDS = new Set(['openclaw-gateway']);
const MANAGED_BACKENDS = new Set(['remote', 'nanobot', 'custom']);
const DISABLED_TEAM_BACKENDS = new Set(['aionrs', 'claude', 'gemini']);

export type TeamExecutionKind = 'hermes' | 'acp' | 'gateway' | 'remote' | 'custom';
export type TeamRecommendedMode =
  | 'native_orchestrator'
  | 'protocol_coordinated'
  | 'gateway_coordinated'
  | 'managed_mailbox'
  | 'unsupported';
export type TeamBackendMaturity = 'high' | 'medium' | 'low' | 'experimental';

export type TeamBackendCapabilities = {
  backend: string;
  executionKind: TeamExecutionKind;
  supportsMcpStdio: boolean;
  supportsSessionFork: boolean;
  supportsNativeDelegation: boolean;
  supportsSharedWorkspace: boolean;
  supportsStructuredTasks: boolean;
  supportsDirectPeerMessaging: boolean;
  supportsInterrupt: boolean;
  supportsResume: boolean;
  supportsModelSelection: boolean;
  recommendedTeamMode: TeamRecommendedMode;
  maturity: TeamBackendMaturity;
  leaderRecommended: boolean;
  workerRecommended: boolean;
  currentlySupported: boolean;
  caveats: string[];
};

export type TeamCapabilityOverride = Partial<
  Pick<
    TeamBackendCapabilities,
    | 'executionKind'
    | 'supportsMcpStdio'
    | 'supportsSessionFork'
    | 'supportsNativeDelegation'
    | 'supportsSharedWorkspace'
    | 'supportsStructuredTasks'
    | 'supportsDirectPeerMessaging'
    | 'supportsInterrupt'
    | 'supportsResume'
    | 'supportsModelSelection'
    | 'recommendedTeamMode'
    | 'maturity'
    | 'leaderRecommended'
    | 'workerRecommended'
    | 'currentlySupported'
  >
> & {
  caveats?: string[];
};

export type TeamCapabilityOverrides = Record<string, TeamCapabilityOverride>;

function getExecutionKind(backend: string): TeamExecutionKind {
  if (backend === 'hermes') return 'hermes';
  if (GATEWAY_BACKENDS.has(backend)) return 'gateway';
  if (backend === 'remote') return 'remote';
  if (backend === 'custom' || MANAGED_BACKENDS.has(backend)) return 'custom';
  return 'acp';
}

function getCachedCapabilities(
  backend: string,
  cachedInitResults: Record<string, AcpInitializeResult> | null | undefined
): AcpInitializeResult['capabilities'] | null {
  return cachedInitResults?.[backend]?.capabilities ?? null;
}

function applyOverride(
  base: TeamBackendCapabilities,
  overrides: TeamCapabilityOverrides | null | undefined
): TeamBackendCapabilities {
  const override = overrides?.[base.backend];
  if (!override) return base;

  return {
    ...base,
    ...override,
    caveats: override.caveats ? [...new Set(override.caveats)] : base.caveats,
  };
}

export class TeamCapabilityResolver {
  private static normalizeRequestedBackend(backend: string | undefined): string | undefined {
    if (!backend) return undefined;
    const trimmed = backend.trim();
    if (!trimmed || trimmed === 'acp') return undefined;
    return trimmed;
  }

  static resolve(
    backend: string,
    cachedInitResults: Record<string, AcpInitializeResult> | null | undefined,
    overrides?: TeamCapabilityOverrides | null
  ): TeamBackendCapabilities {
    const cachedCaps = getCachedCapabilities(backend, cachedInitResults);
    const supportsMcpStdio = cachedCaps?.mcpCapabilities.stdio === true;
    const supportsSessionFork = cachedCaps?.sessionCapabilities.fork !== null;
    const supportsResume = cachedCaps?.sessionCapabilities.resume !== null;

    if (DISABLED_TEAM_BACKENDS.has(backend)) {
      return applyOverride({
        backend,
        executionKind: getExecutionKind(backend),
        supportsMcpStdio,
        supportsSessionFork,
        supportsNativeDelegation: false,
        supportsSharedWorkspace: false,
        supportsStructuredTasks: false,
        supportsDirectPeerMessaging: false,
        supportsInterrupt: false,
        supportsResume,
        supportsModelSelection: false,
        recommendedTeamMode: 'unsupported',
        maturity: 'low',
        leaderRecommended: false,
        workerRecommended: false,
        currentlySupported: false,
        caveats: ['disabled_backend'],
      }, overrides);
    }

    if (NATIVE_TEAM_BACKENDS.has(backend)) {
      return applyOverride({
        backend,
        executionKind: 'hermes',
        supportsMcpStdio: true,
        supportsSessionFork,
        supportsNativeDelegation: true,
        supportsSharedWorkspace: true,
        supportsStructuredTasks: true,
        supportsDirectPeerMessaging: true,
        supportsInterrupt: true,
        supportsResume: supportsResume || supportsSessionFork,
        supportsModelSelection: true,
        recommendedTeamMode: 'native_orchestrator',
        maturity: 'high',
        leaderRecommended: true,
        workerRecommended: true,
        currentlySupported: true,
        caveats: [],
      }, overrides);
    }

    if (PROTOCOL_TEAM_BACKENDS.has(backend)) {
      return applyOverride({
        backend,
        executionKind: 'acp',
        supportsMcpStdio: true,
        supportsSessionFork,
        supportsNativeDelegation: false,
        supportsSharedWorkspace: true,
        supportsStructuredTasks: true,
        supportsDirectPeerMessaging: true,
        supportsInterrupt: true,
        supportsResume,
        supportsModelSelection: true,
        recommendedTeamMode: 'protocol_coordinated',
        maturity: 'high',
        leaderRecommended: false,
        workerRecommended: true,
        currentlySupported: true,
        caveats: ['worker_preferred'],
      }, overrides);
    }

    if (GATEWAY_BACKENDS.has(backend)) {
      return applyOverride({
        backend,
        executionKind: 'gateway',
        supportsMcpStdio: false,
        supportsSessionFork: false,
        supportsNativeDelegation: false,
        supportsSharedWorkspace: true,
        supportsStructuredTasks: true,
        supportsDirectPeerMessaging: false,
        supportsInterrupt: true,
        supportsResume: true,
        supportsModelSelection: false,
        recommendedTeamMode: 'gateway_coordinated',
        maturity: 'medium',
        leaderRecommended: false,
        workerRecommended: true,
        currentlySupported: true,
        caveats: ['worker_preferred'],
      }, overrides);
    }

    if (MANAGED_BACKENDS.has(backend)) {
      return applyOverride({
        backend,
        executionKind: getExecutionKind(backend),
        supportsMcpStdio: false,
        supportsSessionFork: false,
        supportsNativeDelegation: false,
        supportsSharedWorkspace: false,
        supportsStructuredTasks: false,
        supportsDirectPeerMessaging: false,
        supportsInterrupt: false,
        supportsResume: false,
        supportsModelSelection: false,
        recommendedTeamMode: 'managed_mailbox',
        maturity: 'experimental',
        leaderRecommended: false,
        workerRecommended: true,
        currentlySupported: false,
        caveats: ['managed_mode_not_enabled'],
      }, overrides);
    }

    const currentlySupported = supportsMcpStdio;
    return applyOverride({
      backend,
      executionKind: 'acp',
      supportsMcpStdio,
      supportsSessionFork,
      supportsNativeDelegation: false,
      supportsSharedWorkspace: supportsMcpStdio,
      supportsStructuredTasks: supportsMcpStdio,
      supportsDirectPeerMessaging: supportsMcpStdio,
      supportsInterrupt: supportsMcpStdio,
      supportsResume,
      supportsModelSelection: supportsMcpStdio,
      recommendedTeamMode: supportsMcpStdio ? 'protocol_coordinated' : 'unsupported',
      maturity: supportsMcpStdio ? 'medium' : 'experimental',
      leaderRecommended: false,
      workerRecommended: supportsMcpStdio,
      currentlySupported,
      caveats: supportsMcpStdio ? ['worker_preferred'] : ['missing_mcp_stdio'],
    }, overrides);
  }

  static isCurrentlySupported(
    backend: string,
    cachedInitResults: Record<string, AcpInitializeResult> | null | undefined,
    overrides?: TeamCapabilityOverrides | null
  ): boolean {
    return TeamCapabilityResolver.resolve(backend, cachedInitResults, overrides).currentlySupported;
  }

  static getCurrentlySupportedBackends(
    detectedBackends: string[],
    cachedInitResults: Record<string, AcpInitializeResult> | null | undefined,
    overrides?: TeamCapabilityOverrides | null
  ): string[] {
    return detectedBackends.filter((backend) => TeamCapabilityResolver.isCurrentlySupported(backend, cachedInitResults, overrides));
  }

  static getCurrentlySupportedBackendCapabilities(
    detectedBackends: string[],
    cachedInitResults: Record<string, AcpInitializeResult> | null | undefined,
    overrides?: TeamCapabilityOverrides | null
  ): TeamBackendCapabilities[] {
    return detectedBackends
      .map((backend) => TeamCapabilityResolver.resolve(backend, cachedInitResults, overrides))
      .filter((capabilities) => capabilities.currentlySupported);
  }

  static pickPreferredLeaderBackend(
    backend: string | undefined,
    cachedInitResults: Record<string, AcpInitializeResult> | null | undefined,
    overrides?: TeamCapabilityOverrides | null,
    fallback = 'hermes'
  ): string {
    const normalizedBackend = TeamCapabilityResolver.normalizeRequestedBackend(backend);
    if (!normalizedBackend) return fallback;
    const capabilities = TeamCapabilityResolver.resolve(normalizedBackend, cachedInitResults, overrides);
    if (capabilities.currentlySupported && capabilities.leaderRecommended) {
      return normalizedBackend;
    }
    return fallback;
  }

  static pickPreferredWorkerBackend(params: {
    backend?: string;
    leaderBackend?: string;
    cachedInitResults: Record<string, AcpInitializeResult> | null | undefined;
    overrides?: TeamCapabilityOverrides | null;
    fallback?: string;
  }): string {
    const { backend, leaderBackend, cachedInitResults, overrides, fallback = 'hermes' } = params;
    const normalizedBackend = TeamCapabilityResolver.normalizeRequestedBackend(backend);
    if (normalizedBackend) {
      const requestedCapabilities = TeamCapabilityResolver.resolve(normalizedBackend, cachedInitResults, overrides);
      if (requestedCapabilities.currentlySupported && requestedCapabilities.workerRecommended) {
        return normalizedBackend;
      }
    }

    const normalizedLeaderBackend = TeamCapabilityResolver.normalizeRequestedBackend(leaderBackend);
    if (normalizedLeaderBackend) {
      const leaderCapabilities = TeamCapabilityResolver.resolve(normalizedLeaderBackend, cachedInitResults, overrides);
      if (
        leaderCapabilities.currentlySupported &&
        leaderCapabilities.workerRecommended
      ) {
        return normalizedLeaderBackend;
      }
    }

    return fallback;
  }

  static formatSupportHint(capabilities: TeamBackendCapabilities): string {
    if (capabilities.currentlySupported) {
      if (capabilities.leaderRecommended) {
        return `${capabilities.backend} is fully supported and recommended as a team leader.`;
      }
      if (capabilities.workerRecommended) {
        return `${capabilities.backend} is supported in the current runtime, but is better suited as a teammate than a leader.`;
      }
      return `${capabilities.backend} is supported in the current team runtime.`;
    }

    switch (capabilities.recommendedTeamMode) {
      case 'gateway_coordinated':
        return `${capabilities.backend} is supported in gateway-coordinated team mode and is recommended as a teammate worker.`;
      case 'managed_mailbox':
        return `${capabilities.backend} is modeled for future managed mailbox mode, but that runtime is not enabled yet.`;
      default:
        if (capabilities.caveats.includes('missing_mcp_stdio')) {
          return `${capabilities.backend} is missing MCP stdio support, so it cannot join the current team runtime yet.`;
        }
        if (capabilities.caveats.includes('disabled_backend')) {
          return `${capabilities.backend} is explicitly disabled for team mode in the current runtime.`;
        }
        return `${capabilities.backend} is not supported by the current team runtime.`;
    }
  }
}
