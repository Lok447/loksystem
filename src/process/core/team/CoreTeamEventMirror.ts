/**
 * @license
 * Copyright 2025 LokSystem (loksystem.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  ITeamAgentRemovedEvent,
  ITeamAgentRenamedEvent,
  ITeamAgentSpawnedEvent,
  ITeamAgentStatusEvent,
  ITeamListChangedEvent,
  ITeamMcpStatusEvent,
} from '@/common/types/teamTypes';
import { coreEventBus } from '@process/core/shared/CoreEventBus';

export function mirrorTeamListChanged(event: ITeamListChangedEvent): void {
  coreEventBus.emit('team', 'team.list.changed', event);
}

export function mirrorTeamAgentStatusChanged(event: ITeamAgentStatusEvent): void {
  coreEventBus.emit('team', 'team.agent.status.changed', event);
}

export function mirrorTeamAgentSpawned(event: ITeamAgentSpawnedEvent): void {
  coreEventBus.emit('team', 'team.agent.spawned', event);
}

export function mirrorTeamAgentRemoved(event: ITeamAgentRemovedEvent): void {
  coreEventBus.emit('team', 'team.agent.removed', event);
}

export function mirrorTeamAgentRenamed(event: ITeamAgentRenamedEvent): void {
  coreEventBus.emit('team', 'team.agent.renamed', event);
}

export function mirrorTeamMcpStatus(event: ITeamMcpStatusEvent): void {
  coreEventBus.emit('team', 'team.mcp.status', event);
}
