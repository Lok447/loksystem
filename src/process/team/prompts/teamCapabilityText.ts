import type { TeamBackendCapabilities } from '@/common/team/TeamCapabilityResolver';

function humanizeMode(mode: TeamBackendCapabilities['recommendedTeamMode']): string {
  return mode.replace(/_/g, ' ');
}

export function getTeamCapabilityRecommendationLabel(capabilities: TeamBackendCapabilities): string {
  if (capabilities.leaderRecommended) return 'leader recommended';
  if (capabilities.workerRecommended) return 'worker recommended';
  if (capabilities.currentlySupported) return 'supported';
  return 'not currently supported';
}

export function formatTeamCapabilityGuidance(capabilities: TeamBackendCapabilities): string {
  if (capabilities.leaderRecommended) {
    return `\`${capabilities.backend}\` is leader recommended in the current team runtime and is a strong fit for coordination.`;
  }
  if (capabilities.workerRecommended) {
    return `\`${capabilities.backend}\` is supported in the current team runtime and is generally a better fit for specialist teammate work than primary coordination.`;
  }
  if (capabilities.currentlySupported) {
    return `\`${capabilities.backend}\` is supported in the current team runtime.`;
  }
  return `\`${capabilities.backend}\` is modeled for ${humanizeMode(capabilities.recommendedTeamMode)} but is not enabled in the current runtime.`;
}

export function formatTeamCapabilityCatalogNote(capabilities: TeamBackendCapabilities): string {
  const recommendation = getTeamCapabilityRecommendationLabel(capabilities);
  return `${recommendation}; mode: ${humanizeMode(capabilities.recommendedTeamMode)}`;
}
