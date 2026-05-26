/**
 * @license
 * Copyright 2025 LokSystem (loksystem.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IConversationService } from '@process/services/IConversationService';
import type { IWorkerTaskManager } from '@process/task/IWorkerTaskManager';
import type { TeamSessionService } from '@process/team/TeamSessionService';
import { CoreAcpGatewayService } from './acp';
import {
  CoreSessionInteractionService,
  CoreSessionRuntimeService,
  CoreSessionService,
} from './sessions';
import { CoreTaskRuntimeService } from './tasks';
import { CoreTeamService } from './team';
import { CoreUploadService } from './uploads';
import { CoreWorkspaceService } from './workspaces';

export type CoreBackendDependencies = {
  conversationService: IConversationService;
  workerTaskManager: IWorkerTaskManager;
  teamSessionService?: TeamSessionService;
};

/**
 * M5 preparation: a shared backend service container used by desktop IPC today
 * and future HTTP/client adapters later. It keeps core service instances aligned
 * instead of letting every transport build its own service graph.
 */
export class CoreBackendServices {
  public readonly taskRuntime: CoreTaskRuntimeService;
  public readonly sessions: CoreSessionService;
  public readonly sessionInteractions: CoreSessionInteractionService;
  public readonly sessionRuntime: CoreSessionRuntimeService;
  public readonly workspaces: CoreWorkspaceService;
  public readonly acpGateway: CoreAcpGatewayService;
  public readonly teams: CoreTeamService;
  public readonly uploads: typeof CoreUploadService;

  constructor(deps: CoreBackendDependencies) {
    this.taskRuntime = new CoreTaskRuntimeService(deps.workerTaskManager);
    this.sessions = new CoreSessionService(deps.conversationService, this.taskRuntime);
    this.sessionInteractions = new CoreSessionInteractionService(deps.conversationService);
    this.sessionRuntime = new CoreSessionRuntimeService(this.taskRuntime);
    this.workspaces = new CoreWorkspaceService(deps.conversationService);
    this.acpGateway = new CoreAcpGatewayService(this.taskRuntime);
    this.teams = new CoreTeamService(deps.teamSessionService);
    this.uploads = CoreUploadService;
  }
}
