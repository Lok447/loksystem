/**
 * @license
 * Copyright 2025 LokSystem (loksystem.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { TeamCapabilityResolver } from '@/common/team/TeamCapabilityResolver';
import { ProcessConfig } from '@process/utils/initStorage.ts';

/**
 * Returns true if the given agent backend should receive the team guide prompt injection.
 * Uses the shared TeamCapabilityResolver so prompt injection follows the same
 * runtime support policy as the rest of team mode.
 *
 * Separated from teamGuidePrompt.ts to avoid pulling ProcessConfig (and its
 * transitive database dependencies) into the standalone MCP stdio bundle.
 */
export async function shouldInjectTeamGuideMcp(backend: string): Promise<boolean> {
  const cachedInitResults = await ProcessConfig.get('acp.cachedInitializeResult');
  const capabilities = TeamCapabilityResolver.resolve(backend, cachedInitResults);
  return capabilities.currentlySupported;
}
