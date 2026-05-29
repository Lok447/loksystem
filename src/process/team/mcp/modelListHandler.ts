/**
 * @license
 * Copyright 2025 LokSystem (loksystem.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Shared handler for listing available models.
 * Used by both TeamMcpServer (team_list_models) and TeamGuideMcpServer (aion_list_models).
 */

import { getTeamAvailableModels } from '@/common/utils/teamModelUtils';
import { TeamCapabilityResolver } from '@/common/team/TeamCapabilityResolver';
import { agentRegistry } from '@process/agent/AgentRegistry';
import { getMergedModelProviders } from '@process/bridge/modelBridge';
import { ProcessConfig } from '@process/utils/initStorage';

export async function handleListModels(args: Record<string, unknown>): Promise<string> {
  const agentType = args.agent_type ? String(args.agent_type) : undefined;

  const [cachedModels, providers] = await Promise.all([ProcessConfig.get('acp.cachedModels'), getMergedModelProviders()]);

  if (agentType) {
    const models = getTeamAvailableModels(agentType, cachedModels, providers);
    if (models.length === 0) {
      return `No models available for agent type "${agentType}".`;
    }
    return `## Models for ${agentType}\n${models.map((m) => `- ${m.id}`).join('\n')}`;
  }

  // List models for all team-capable backends
  const cachedInitResults = await ProcessConfig.get('acp.cachedInitializeResult');
  const detectedAgents = agentRegistry
    .getDetectedAgents()
    .map((agent) => ({
      ...agent,
      teamCapabilities: TeamCapabilityResolver.resolve(agent.backend, cachedInitResults),
    }))
    .filter((agent) => agent.teamCapabilities.currentlySupported);

  if (detectedAgents.length === 0) {
    return 'No team-capable agent types detected.';
  }

  const sections = detectedAgents.map((agent) => {
    const models = getTeamAvailableModels(agent.backend, cachedModels, providers);
    const modelLines = models.length > 0 ? models.map((m) => `  - ${m.id}`).join('\n') : '  (no models available)';
    const recommendation = agent.teamCapabilities.leaderRecommended
      ? 'leader recommended'
      : agent.teamCapabilities.workerRecommended
        ? 'worker recommended'
        : 'supported';
    return `### ${agent.name} (\`${agent.backend}\`, ${recommendation})\n${modelLines}`;
  });

  return `## Available Models by Agent Type\n\n${sections.join('\n\n')}`;
}
