import React from 'react';
import { Robot } from '@icon-park/react';
import { getAgentLogo } from '@renderer/utils/model/agentLogo';
import { CUSTOM_AVATAR_IMAGE_MAP } from '@renderer/pages/guid/constants';
import type { AvailableAgent } from '@renderer/utils/model/agentTypes';
import type { AcpInitializeResult } from '@/common/types/acpTypes';
import type { TeamBackendCapabilities, TeamCapabilityOverrides } from '@/common/types/teamTypes';
import { getTeamBackendCapabilities, isTeamCapableBackend } from '@/common/types/teamTypes';

export type TeamRoleRequirement = 'leader' | 'teammate' | 'any';

export type TeamRoleEligibility = {
  backend: string;
  role: TeamRoleRequirement;
  selectable: boolean;
  capabilities: TeamBackendCapabilities;
};

export function agentKey(agent: AvailableAgent): string {
  return agent.customAgentId ? `preset::${agent.customAgentId}` : `cli::${agent.backend}`;
}

export function agentFromKey(key: string, allAgents: AvailableAgent[]): AvailableAgent | undefined {
  return allAgents.find((a) => agentKey(a) === key);
}

export function resolveTeamAgentType(agent: AvailableAgent | undefined, fallback: string): string {
  return agent?.presetAgentType || agent?.backend || fallback;
}

function getResolvedBackend(agent: AvailableAgent): string {
  return agent.presetAgentType || agent.backend;
}

function isCapabilityEligibleForRole(capabilities: TeamBackendCapabilities, role: TeamRoleRequirement): boolean {
  if (!capabilities.currentlySupported) return false;
  if (role === 'leader') return capabilities.leaderRecommended;
  if (role === 'teammate') return capabilities.workerRecommended;
  return capabilities.currentlySupported;
}

export function getAgentTeamCapabilities(
  agent: AvailableAgent,
  cachedInitResults: Record<string, AcpInitializeResult> | null | undefined,
  overrides?: TeamCapabilityOverrides | null
): TeamBackendCapabilities {
  return getTeamBackendCapabilities(getResolvedBackend(agent), cachedInitResults, overrides);
}

export function getAgentTeamEligibility(
  agent: AvailableAgent,
  cachedInitResults: Record<string, AcpInitializeResult> | null | undefined,
  role: TeamRoleRequirement = 'any',
  overrides?: TeamCapabilityOverrides | null
): TeamRoleEligibility {
  const capabilities = getAgentTeamCapabilities(agent, cachedInitResults, overrides);
  return {
    backend: getResolvedBackend(agent),
    role,
    selectable: isCapabilityEligibleForRole(capabilities, role),
    capabilities,
  };
}

export function filterTeamSupportedAgents(
  agents: AvailableAgent[],
  cachedInitResults: Record<string, AcpInitializeResult> | null | undefined,
  overrides?: TeamCapabilityOverrides | null,
  role: TeamRoleRequirement = 'any'
): AvailableAgent[] {
  if (role === 'any' && !overrides) {
    return agents.filter((agent) => isTeamCapableBackend(getResolvedBackend(agent), cachedInitResults));
  }

  return agents.filter((agent) => getAgentTeamEligibility(agent, cachedInitResults, role, overrides).selectable);
}

export function partitionAgentsByTeamRole(
  agents: AvailableAgent[],
  cachedInitResults: Record<string, AcpInitializeResult> | null | undefined,
  role: TeamRoleRequirement,
  overrides?: TeamCapabilityOverrides | null
): {
  selectable: AvailableAgent[];
  blocked: AvailableAgent[];
} {
  return agents.reduce(
    (result, agent) => {
      if (getAgentTeamEligibility(agent, cachedInitResults, role, overrides).selectable) {
        result.selectable.push(agent);
      } else {
        result.blocked.push(agent);
      }
      return result;
    },
    { selectable: [] as AvailableAgent[], blocked: [] as AvailableAgent[] }
  );
}

export function getAgentTeamCapabilitySummary(
  agent: AvailableAgent,
  cachedInitResults: Record<string, AcpInitializeResult> | null | undefined,
  overrides?: TeamCapabilityOverrides | null
): {
  modeLabel: string;
  recommendationLabel: string;
  caveatLabel?: string;
} {
  const capabilities = getAgentTeamCapabilities(agent, cachedInitResults, overrides);

  const modeLabelMap: Record<string, string> = {
    native_orchestrator: 'Native Team Mode',
    protocol_coordinated: 'Protocol Team Mode',
    gateway_coordinated: 'Gateway Team Mode',
    managed_mailbox: 'Managed Team Mode',
    unsupported: 'Unsupported',
  };

  const recommendationLabel = capabilities.leaderRecommended
    ? 'Leader Recommended'
    : capabilities.workerRecommended
      ? 'Worker Recommended'
      : 'Not Recommended';

  const caveatMap: Record<string, string> = {
    worker_preferred: 'Best used as a worker',
    future_gateway_mode: 'Gateway mode planned',
    managed_mode_not_enabled: 'Managed mode not enabled yet',
    missing_mcp_stdio: 'Requires MCP stdio support',
    disabled_backend: 'Currently disabled in team mode',
  };

  const firstCaveat = capabilities.caveats[0];
  return {
    modeLabel: modeLabelMap[capabilities.recommendedTeamMode] || 'Unsupported',
    recommendationLabel,
    ...(firstCaveat ? { caveatLabel: caveatMap[firstCaveat] || firstCaveat } : {}),
  };
}

export function getLeaderMixedBackendHint(
  agent: AvailableAgent,
  cachedInitResults: Record<string, AcpInitializeResult> | null | undefined,
  overrides?: TeamCapabilityOverrides | null
): string {
  const capabilities = getAgentTeamCapabilities(agent, cachedInitResults, overrides);

  if (!capabilities.currentlySupported) {
    return 'This backend is not enabled for the current team runtime yet.';
  }

  if (!capabilities.leaderRecommended) {
    return 'This backend is worker-capable but not recommended as the team leader.';
  }

  switch (capabilities.recommendedTeamMode) {
    case 'native_orchestrator':
      return 'Hermes-native leaders work best with worker-capable teammates. Unsupported or override-only runtimes will be blocked before startup.';
    case 'protocol_coordinated':
      return 'Protocol-coordinated leaders should pair with worker-capable protocol teammates to avoid runtime fallback.';
    case 'gateway_coordinated':
      return 'Gateway-coordinated leaders should pair with gateway-compatible or override-enabled worker runtimes.';
    case 'managed_mailbox':
      return 'Managed mailbox leaders require teammates that explicitly declare worker capability through overrides.';
    default:
      return 'Only worker-capable teammates can join this team after creation.';
  }
}

export function getTeammateMixedBackendHint(
  agent: AvailableAgent,
  leaderBackend: string | undefined,
  cachedInitResults: Record<string, AcpInitializeResult> | null | undefined,
  overrides?: TeamCapabilityOverrides | null
): string {
  const capabilities = getAgentTeamCapabilities(agent, cachedInitResults, overrides);
  const leaderCapabilities = leaderBackend
    ? getTeamBackendCapabilities(leaderBackend, cachedInitResults, overrides)
    : undefined;

  if (!capabilities.currentlySupported) {
    return 'This runtime cannot join the current team until its worker capability is explicitly enabled.';
  }

  if (!capabilities.workerRecommended) {
    return 'This runtime is not recommended as a teammate worker in the current team runtime.';
  }

  if (!leaderCapabilities) {
    return 'This teammate is worker-capable and can join the current team runtime.';
  }

  if (leaderCapabilities.recommendedTeamMode === 'native_orchestrator') {
    if (capabilities.recommendedTeamMode === 'native_orchestrator') {
      return 'This teammate stays on the native Hermes path and can participate without a compatibility downgrade.';
    }
    return 'This teammate is worker-capable, but will join a Hermes-led team through a compatibility path instead of a fully native lane.';
  }

  if (leaderCapabilities.recommendedTeamMode === 'protocol_coordinated') {
    return capabilities.recommendedTeamMode === 'protocol_coordinated'
      ? 'This teammate matches the protocol-coordinated runtime and should join without extra routing fallback.'
      : 'This teammate is worker-capable, but mixes a different runtime mode than the current protocol leader.';
  }

  if (leaderCapabilities.recommendedTeamMode === 'gateway_coordinated') {
    return capabilities.recommendedTeamMode === 'gateway_coordinated'
      ? 'This teammate matches the gateway-coordinated runtime and can reuse the gateway worker path.'
      : 'This teammate is worker-capable, but differs from the current gateway-oriented team mode.';
  }

  if (leaderCapabilities.recommendedTeamMode === 'managed_mailbox') {
    return 'This teammate can join the managed mailbox path because it declares worker capability explicitly.';
  }

  return 'This teammate is worker-capable and can join the current team runtime.';
}

export function resolveConversationType(
  backend: string
): 'acp' | 'lokcli' | 'codex' | 'openclaw-gateway' | 'nanobot' | 'remote' {
  if (backend === 'gemini') return 'lokcli';
  if (backend === 'hermes') return 'lokcli';
  if (backend === 'aionrs') return 'lokcli';
  if (backend === 'codex') return 'acp';
  if (backend === 'openclaw-gateway') return 'openclaw-gateway';
  if (backend === 'nanobot') return 'nanobot';
  if (backend === 'remote') return 'remote';
  return 'acp';
}

export const AgentOptionLabel: React.FC<{
  agent: AvailableAgent;
  capabilitySummary?: {
    modeLabel: string;
    recommendationLabel: string;
    caveatLabel?: string;
  };
}> = ({ agent, capabilitySummary }) => {
  const logo = getAgentLogo(agent.backend);
  const avatarImage = agent.avatar ? CUSTOM_AVATAR_IMAGE_MAP[agent.avatar] : undefined;
  const isEmoji = agent.avatar && !avatarImage && !agent.avatar.endsWith('.svg');

  return (
    <div className='flex min-w-0 items-start gap-8px'>
      <div className='shrink-0 pt-2px'>
        {avatarImage ? (
          <img src={avatarImage} alt={agent.name} style={{ width: 16, height: 16, objectFit: 'contain' }} />
        ) : isEmoji ? (
          <span style={{ fontSize: 14, lineHeight: '16px' }}>{agent.avatar}</span>
        ) : logo ? (
          <img src={logo} alt={agent.name} style={{ width: 16, height: 16, objectFit: 'contain' }} />
        ) : (
          <Robot size='16' />
        )}
      </div>
      <div className='min-w-0 flex flex-col'>
        <span className='truncate'>{agent.name}</span>
        {capabilitySummary && (
          <span className='truncate text-11px leading-16px text-t-tertiary'>
            {capabilitySummary.recommendationLabel} / {capabilitySummary.modeLabel}
            {capabilitySummary.caveatLabel ? ` / ${capabilitySummary.caveatLabel}` : ''}
          </span>
        )}
      </div>
    </div>
  );
};
