/**
 * @license
 * Copyright 2025 LokSystem (loksystem.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TeamSessionService } from '@process/team/TeamSessionService';
import { coreEventBus } from '@process/core/shared/CoreEventBus';
import type {
  CoreServiceResponse,
  CoreTeamAddAgentDto,
  CoreTeamAgentDto,
  CoreTeamCreateDto,
  CoreTeamDto,
  CoreTeamRenameAgentDto,
  CoreTeamRenameDto,
  CoreTeamSendMessageDto,
  CoreTeamSendMessageToAgentDto,
  CoreTeamSetSessionModeDto,
  CoreTeamUpdateWorkspaceDto,
} from '../shared/CoreContracts';

export class CoreTeamService {
  constructor(private readonly teamSessionService?: TeamSessionService) {}

  public isAvailable(): boolean {
    return Boolean(this.teamSessionService);
  }

  public async create(params: CoreTeamCreateDto): Promise<CoreServiceResponse<CoreTeamDto>> {
    if (!this.teamSessionService) {
      return { success: false, msg: 'Team service is not available in this runtime' };
    }

    try {
      const team = await this.teamSessionService.createTeam(params);
      this.emitRuntimeUpdate({ action: 'created', teamId: team.id });
      return { success: true, data: team };
    } catch (error) {
      return this.toErrorResponse<CoreTeamDto>(error);
    }
  }

  public async list(userId: string): Promise<CoreTeamDto[]> {
    if (!this.teamSessionService) {
      return [];
    }
    return this.teamSessionService.listTeams(userId);
  }

  public async get(id: string): Promise<CoreTeamDto | null> {
    if (!this.teamSessionService) {
      return null;
    }
    return this.teamSessionService.getTeam(id);
  }

  public async remove(id: string): Promise<CoreServiceResponse> {
    if (!this.teamSessionService) {
      return { success: false, msg: 'Team service is not available in this runtime' };
    }

    try {
      await this.teamSessionService.deleteTeam(id);
      this.emitRuntimeUpdate({ action: 'deleted', teamId: id });
      return { success: true };
    } catch (error) {
      return this.toErrorResponse(error);
    }
  }

  public async addAgent(params: CoreTeamAddAgentDto): Promise<CoreServiceResponse<CoreTeamAgentDto>> {
    if (!this.teamSessionService) {
      return { success: false, msg: 'Team service is not available in this runtime' };
    }

    try {
      const agent = await this.teamSessionService.addAgent(params.teamId, params.agent);
      this.emitRuntimeUpdate({ action: 'agent_added', teamId: params.teamId, slotId: agent.slotId });
      return { success: true, data: agent };
    } catch (error) {
      return this.toErrorResponse<CoreTeamAgentDto>(error);
    }
  }

  public async removeAgent(teamId: string, slotId: string): Promise<CoreServiceResponse> {
    if (!this.teamSessionService) {
      return { success: false, msg: 'Team service is not available in this runtime' };
    }

    try {
      await this.teamSessionService.removeAgent(teamId, slotId);
      this.emitRuntimeUpdate({ action: 'agent_removed', teamId, slotId });
      return { success: true };
    } catch (error) {
      return this.toErrorResponse(error);
    }
  }

  public async renameAgent(params: CoreTeamRenameAgentDto): Promise<CoreServiceResponse> {
    if (!this.teamSessionService) {
      return { success: false, msg: 'Team service is not available in this runtime' };
    }

    try {
      await this.teamSessionService.renameAgent(params.teamId, params.slotId, params.newName);
      this.emitRuntimeUpdate({ action: 'agent_renamed', teamId: params.teamId, slotId: params.slotId });
      return { success: true };
    } catch (error) {
      return this.toErrorResponse(error);
    }
  }

  public async renameTeam(params: CoreTeamRenameDto): Promise<CoreServiceResponse> {
    if (!this.teamSessionService) {
      return { success: false, msg: 'Team service is not available in this runtime' };
    }

    try {
      await this.teamSessionService.renameTeam(params.id, params.name);
      this.emitRuntimeUpdate({ action: 'renamed', teamId: params.id });
      return { success: true };
    } catch (error) {
      return this.toErrorResponse(error);
    }
  }

  public async setSessionMode(params: CoreTeamSetSessionModeDto): Promise<CoreServiceResponse> {
    if (!this.teamSessionService) {
      return { success: false, msg: 'Team service is not available in this runtime' };
    }

    try {
      await this.teamSessionService.setSessionMode(params.teamId, params.sessionMode);
      this.emitRuntimeUpdate({ action: 'session_mode_updated', teamId: params.teamId });
      return { success: true };
    } catch (error) {
      return this.toErrorResponse(error);
    }
  }

  public async updateWorkspace(params: CoreTeamUpdateWorkspaceDto): Promise<CoreServiceResponse> {
    if (!this.teamSessionService) {
      return { success: false, msg: 'Team service is not available in this runtime' };
    }

    try {
      await this.teamSessionService.updateWorkspace(params.teamId, params.workspace);
      this.emitRuntimeUpdate({ action: 'workspace_updated', teamId: params.teamId });
      return { success: true };
    } catch (error) {
      return this.toErrorResponse(error);
    }
  }

  public async sendMessage(params: CoreTeamSendMessageDto): Promise<CoreServiceResponse> {
    if (!this.teamSessionService) {
      return { success: false, msg: 'Team service is not available in this runtime' };
    }

    try {
      const session = await this.teamSessionService.getOrStartSession(params.teamId);
      await session.sendMessage(params.content, params.files);
      this.emitRuntimeUpdate({
        action: 'message_sent',
        teamId: params.teamId,
        fileCount: params.files?.length ?? 0,
      });
      return { success: true };
    } catch (error) {
      return this.toErrorResponse(error);
    }
  }

  public async sendMessageToAgent(params: CoreTeamSendMessageToAgentDto): Promise<CoreServiceResponse> {
    if (!this.teamSessionService) {
      return { success: false, msg: 'Team service is not available in this runtime' };
    }

    try {
      const session = await this.teamSessionService.getOrStartSession(params.teamId);
      await session.sendMessageToAgent(params.slotId, params.content, { files: params.files });
      this.emitRuntimeUpdate({
        action: 'message_sent_to_agent',
        teamId: params.teamId,
        slotId: params.slotId,
        fileCount: params.files?.length ?? 0,
      });
      return { success: true };
    } catch (error) {
      return this.toErrorResponse(error);
    }
  }

  public async stop(teamId: string): Promise<CoreServiceResponse> {
    if (!this.teamSessionService) {
      return { success: false, msg: 'Team service is not available in this runtime' };
    }

    try {
      await this.teamSessionService.stopSession(teamId);
      this.emitRuntimeUpdate({ action: 'stopped', teamId });
      return { success: true };
    } catch (error) {
      return this.toErrorResponse(error);
    }
  }

  public async ensureSession(teamId: string): Promise<CoreServiceResponse> {
    if (!this.teamSessionService) {
      return { success: false, msg: 'Team service is not available in this runtime' };
    }

    try {
      await this.teamSessionService.getOrStartSession(teamId);
      this.emitRuntimeUpdate({ action: 'session_ensured', teamId });
      return { success: true };
    } catch (error) {
      return this.toErrorResponse(error);
    }
  }

  private emitRuntimeUpdate(data: {
    action:
      | 'created'
      | 'deleted'
      | 'agent_added'
      | 'agent_removed'
      | 'agent_renamed'
      | 'renamed'
      | 'session_mode_updated'
      | 'workspace_updated'
      | 'message_sent'
      | 'message_sent_to_agent'
      | 'stopped'
      | 'session_ensured';
    teamId: string;
    slotId?: string;
    fileCount?: number;
  }): void {
    coreEventBus.emit('team', 'team.runtime.updated', data);
  }

  private toErrorResponse<T = Record<string, never>>(error: unknown): CoreServiceResponse<T> {
    return {
      success: false,
      msg: error instanceof Error ? error.message : String(error),
    };
  }
}
