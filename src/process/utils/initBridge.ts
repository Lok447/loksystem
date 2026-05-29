/**
 * @license
 * Copyright 2025 LokSystem (loksystem.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { logger } from '@office-ai/platform';
import { initAllBridges } from '../bridge';
import { SqliteChannelRepository } from '@process/services/database/SqliteChannelRepository';
import { SqliteConversationRepository } from '@process/services/database/SqliteConversationRepository';
import { ConversationServiceImpl } from '@process/services/ConversationServiceImpl';
import { cronService } from '@process/services/cron/cronServiceSingleton';
import { workerTaskManager } from '@process/task/workerTaskManagerSingleton';
import { TeamSessionService, SqliteTeamRepository } from '@process/team';
import {
  SqliteTeamEventStore,
  SqliteTeamRuntimeSnapshotStore,
  TeamDiagnosticsService,
} from '@process/team-runtime/diagnostics';
import { initTeamGuideService } from '@process/team/mcp/guide/teamGuideSingleton';

logger.config({ print: true });

const repo = new SqliteConversationRepository();
const conversationServiceImpl = new ConversationServiceImpl(repo);
const channelRepo = new SqliteChannelRepository();
const teamRepo = new SqliteTeamRepository();
const teamDiagnosticsService = new TeamDiagnosticsService({
  repo: teamRepo,
  eventStore: new SqliteTeamEventStore(),
  snapshotStore: new SqliteTeamRuntimeSnapshotStore(),
});
const teamSessionService = new TeamSessionService(teamRepo, workerTaskManager, conversationServiceImpl, {
  diagnosticsService: teamDiagnosticsService,
});

void (async () => {
  try {
    const teams = await teamRepo.findAll('system_default_user');
    await Promise.all(
      teams.map(async (team) => {
        try {
          await teamSessionService.warmDiagnosticsRecovery(team.id);
        } catch (error) {
          console.warn(`[initBridge] Failed to warm team diagnostics recovery for ${team.id}:`, error);
        }
      })
    );
  } catch (error) {
    console.warn('[initBridge] Failed to warm persisted team diagnostics recovery:', error);
  }
})();

// Initialize all IPC bridges
initAllBridges({
  conversationService: conversationServiceImpl,
  conversationRepo: repo,
  workerTaskManager,
  channelRepo,
  teamSessionService,
});

// Initialize cron service (load jobs from database and start timers)
void cronService.init().catch((error) => {
  console.error('[initBridge] Failed to initialize CronService:', error);
});

// Start in-process Lok MCP server for team-guide tools (aion_create_team)
void initTeamGuideService(teamSessionService).catch((error) => {
  console.error('[initBridge] Failed to initialize TeamGuideMcpServer:', error);
});
