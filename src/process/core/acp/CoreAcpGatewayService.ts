/**
 * @license
 * Copyright 2025 LokSystem (loksystem.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import * as os from 'os';
import { agentRegistry } from '@process/agent/AgentRegistry';
import { isAgentKind } from '@/common/types/detectedAgent';
import { mcpService } from '@/process/services/mcpServices/McpService';
import { LegacyConnectorFactory } from '@process/acp/compat/LegacyConnectorFactory';
import { noopProtocolHandlers } from '@process/acp/types';
import { CoreTaskRuntimeService } from '@process/core/tasks/CoreTaskRuntimeService';
import { coreEventBus } from '@process/core/shared/CoreEventBus';
import { CoreAcpSessionRepository } from './CoreAcpSessionRepository';
import type {
  CoreAcpAgentDescriptorDto,
  CoreAcpHealthDto,
  CoreAcpSessionSnapshotDto,
} from '@process/core/shared/CoreContracts';
import type { CoreEventPayloadMap } from '@process/core/shared/CoreEvent';

type CoreAcpSessionUpdatedPayload = CoreEventPayloadMap['acp.session.updated'];
type CoreAcpSessionUpdatedInput = Omit<CoreAcpSessionUpdatedPayload, 'action' | 'conversationId' | 'snapshot'> & {
  snapshot?: CoreAcpSessionSnapshotDto | Promise<CoreAcpSessionSnapshotDto>;
};

export class CoreAcpGatewayService {
  constructor(private readonly taskRuntimeService: CoreTaskRuntimeService) {}

  public getEnvironmentSummary() {
    return {
      env: {
        GEMINI_API_KEY: process.env.GEMINI_API_KEY ? '[SET]' : '[NOT SET]',
        GOOGLE_CLOUD_PROJECT: process.env.GOOGLE_CLOUD_PROJECT ? '[SET]' : '[NOT SET]',
        NODE_ENV: process.env.NODE_ENV || '[NOT SET]',
      },
    };
  }

  public detectCliPath(backend: string) {
    const agents = agentRegistry.getDetectedAgents();
    const agent = agents.find((item) => isAgentKind(item, 'acp') && item.backend === backend);

    if (agent && isAgentKind(agent, 'acp') && agent.cliPath) {
      return { success: true as const, data: { path: agent.cliPath } };
    }

    return {
      success: false as const,
      msg: `${backend} CLI not found. Please install it and ensure it's accessible.`,
    };
  }

  public getAvailableAgents() {
    try {
      const agents = agentRegistry.getDetectedAgents();
      const data: CoreAcpAgentDescriptorDto[] = agents.map((agent) => ({
        ...agent,
        supportedTransports: mcpService.getSupportedTransportsForAgent(agent),
      }));

      this.emitAgentDiscovery('listed', data);
      return { success: true as const, data };
    } catch (error) {
      return {
        success: false as const,
        msg: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  public async refreshCustomAgents(): Promise<void> {
    await agentRegistry.refreshCustomAgents();
    this.emitAgentDiscovery('refreshed');
  }

  public async checkAgentHealth(backend: string) {
    const startTime = Date.now();
    const agents = agentRegistry.getDetectedAgents();
    const agent = agents.find((item) => isAgentKind(item, 'acp') && item.backend === backend);
    const acpAgent = agent && isAgentKind(agent, 'acp') ? agent : undefined;

    if (!acpAgent?.cliPath && backend !== 'claude' && backend !== 'codebuddy' && backend !== 'codex') {
      this.emitHealthChecked({ backend, available: false, error: 'CLI not installed' });
      return {
        success: false as const,
        msg: `${backend} CLI not found`,
        data: { available: false, error: 'CLI not installed' },
      };
    }

    const tempDir = os.tmpdir();
    const cliPath = acpAgent?.cliPath;
    const acpArgs = acpAgent?.acpArgs;
    const factory = new LegacyConnectorFactory();
    const client = factory.create(
      {
        agentBackend: backend,
        agentSource: 'builtin',
        agentId: `health-check-${backend}`,
        cwd: tempDir,
        command: cliPath,
        args: acpArgs,
      },
      noopProtocolHandlers
    );

    try {
      await client.start();
      const session = await client.createSession({ cwd: tempDir });
      await client.prompt(session.sessionId, [{ type: 'text', text: 'hi' }]);

      const latency = Date.now() - startTime;
      await client.close();

      this.emitHealthChecked({ backend, available: true, latency });
      return {
        success: true as const,
        data: { available: true, latency },
      };
    } catch (error) {
      try {
        await client.close();
      } catch {
        // Ignore close errors
      }

      const errorMsg = error instanceof Error ? error.message : String(error);
      const lowerError = errorMsg.toLowerCase();
      if (
        lowerError.includes('auth') ||
        lowerError.includes('login') ||
        lowerError.includes('credential') ||
        lowerError.includes('api key') ||
        lowerError.includes('unauthorized') ||
        lowerError.includes('forbidden')
      ) {
        this.emitHealthChecked({ backend, available: false, error: 'Not authenticated' });
        return {
          success: false as const,
          msg: `${backend} not authenticated`,
          data: { available: false, error: 'Not authenticated' },
        };
      }

      this.emitHealthChecked({ backend, available: false, error: errorMsg });
      return {
        success: false as const,
        msg: `${backend} health check failed: ${errorMsg}`,
        data: { available: false, error: errorMsg },
      };
    }
  }

  public getMode(conversationId: string) {
    const task = this.taskRuntimeService.getAcpLikeTask(conversationId);
    if (!task) {
      void this.emitSessionUpdated('mode_read', conversationId, {
        snapshot: this.buildSessionSnapshot(conversationId),
      });
      return { success: true as const, data: { mode: 'default', initialized: false } };
    }
    const data = task.getMode();
    void this.emitSessionUpdated('mode_read', conversationId, {
      mode: data.mode,
      snapshot: this.buildSessionSnapshot(conversationId),
    });
    return { success: true as const, data };
  }

  public getModelInfo(conversationId: string) {
    const task = this.taskRuntimeService.getAcpTask(conversationId);
    if (!task) {
      void this.emitSessionUpdated('model_read', conversationId, {
        snapshot: this.buildSessionSnapshot(conversationId),
      });
      return { success: true as const, data: { modelInfo: null } };
    }
    const modelInfo = task.getModelInfo();
    void this.emitSessionUpdated('model_read', conversationId, {
      snapshot: this.buildSessionSnapshot(conversationId),
    });
    return { success: true as const, data: { modelInfo } };
  }

  public async setModel(conversationId: string, modelId: string) {
    try {
      const task = await this.taskRuntimeService.getOrBuildAcpTask(conversationId);
      if (!task) {
        void this.persistSessionState(conversationId, {
          status: 'error',
          config: { modelId, error: 'Conversation not found or not an ACP agent' },
        });
        void this.emitSessionUpdated('model_updated', conversationId, {
          modelId,
          success: false,
          msg: 'Conversation not found or not an ACP agent',
          snapshot: this.buildSessionSnapshot(conversationId),
        });
        return {
          success: false as const,
          msg: 'Conversation not found or not an ACP agent',
        };
      }
      const modelInfo = await task.setModel(modelId);
      void this.persistSessionState(conversationId, {
        status: 'active',
        config: { modelId, modelInfo },
      });
      void this.emitSessionUpdated('model_updated', conversationId, {
        modelId,
        success: true,
        snapshot: this.buildSessionSnapshot(conversationId),
      });
      return {
        success: true as const,
        data: { modelInfo },
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      void this.persistSessionState(conversationId, { status: 'error', config: { modelId, error: msg } });
      void this.emitSessionUpdated('model_updated', conversationId, { modelId, success: false, msg });
      return { success: false as const, msg };
    }
  }

  public async setMode(conversationId: string, mode: string) {
    try {
      const task = await this.taskRuntimeService.getOrBuildAcpLikeTask(conversationId);
      if (!task) {
        void this.persistSessionState(conversationId, {
          status: 'error',
          config: { mode, error: 'Conversation not found' },
        });
        void this.emitSessionUpdated('mode_updated', conversationId, {
          mode,
          success: false,
          msg: 'Conversation not found',
          snapshot: this.buildSessionSnapshot(conversationId),
        });
        return { success: false as const, msg: 'Conversation not found' };
      }
      const result = await task.setMode(mode);
      void this.persistSessionState(conversationId, {
        status: result.success ? 'active' : 'error',
        config: { mode, error: this.extractMessage(result) },
      });
      void this.emitSessionUpdated('mode_updated', conversationId, {
        mode,
        success: result.success,
        msg: this.extractMessage(result),
        snapshot: this.buildSessionSnapshot(conversationId),
      });
      return result;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      void this.persistSessionState(conversationId, { status: 'error', config: { mode, error: msg } });
      void this.emitSessionUpdated('mode_updated', conversationId, { mode, success: false, msg });
      return { success: false as const, msg };
    }
  }

  public getConfigOptions(conversationId: string) {
    const task = this.taskRuntimeService.getAcpTask(conversationId);
    if (!task) {
      void this.emitSessionUpdated('config_read', conversationId, {
        snapshot: this.buildSessionSnapshot(conversationId),
      });
      return { success: true as const, data: { configOptions: [] } };
    }
    const configOptions = task.getConfigOptions();
    void this.emitSessionUpdated('config_read', conversationId, {
      snapshot: this.buildSessionSnapshot(conversationId),
    });
    return { success: true as const, data: { configOptions } };
  }

  public async setConfigOption(conversationId: string, configId: string, value: string) {
    try {
      const task = await this.taskRuntimeService.getOrBuildAcpTask(conversationId);
      if (!task) {
        void this.persistSessionState(conversationId, {
          status: 'error',
          config: { [configId]: value, error: 'Conversation not found or not an ACP agent' },
        });
        void this.emitSessionUpdated('config_updated', conversationId, {
          configId,
          value,
          success: false,
          msg: 'Conversation not found or not an ACP agent',
          snapshot: this.buildSessionSnapshot(conversationId),
        });
        return {
          success: false as const,
          msg: 'Conversation not found or not an ACP agent',
        };
      }
      const configOptions = await task.setConfigOption(configId, value);
      void this.persistSessionState(conversationId, {
        status: 'active',
        config: { [configId]: value, configOptions },
      });
      void this.emitSessionUpdated('config_updated', conversationId, {
        configId,
        value,
        success: true,
        snapshot: this.buildSessionSnapshot(conversationId),
      });
      return { success: true as const, data: { configOptions } };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      void this.persistSessionState(conversationId, { status: 'error', config: { [configId]: value, error: msg } });
      void this.emitSessionUpdated('config_updated', conversationId, { configId, value, success: false, msg });
      return { success: false as const, msg };
    }
  }

  public async getSessionSnapshot(conversationId: string): Promise<CoreAcpSessionSnapshotDto> {
    return this.buildSessionSnapshot(conversationId);
  }

  private async buildSessionSnapshot(conversationId: string): Promise<CoreAcpSessionSnapshotDto> {
    const runtime = this.taskRuntimeService.getRuntimeState(conversationId);
    const acpLikeTask = this.taskRuntimeService.getAcpLikeTask(conversationId);
    const acpTask = this.taskRuntimeService.getAcpTask(conversationId);
    return {
      conversationId,
      exists: Boolean(acpLikeTask),
      runtime,
      persisted: await CoreAcpSessionRepository.get(conversationId),
      mode: acpLikeTask?.getMode() ?? { mode: 'default', initialized: false },
      modelInfo: acpTask?.getModelInfo() ?? null,
      configOptions: acpTask?.getConfigOptions() ?? [],
    };
  }

  private async persistSessionState(
    conversationId: string,
    params: {
      status?: 'idle' | 'active' | 'suspended' | 'error';
      config?: Record<string, unknown>;
    }
  ): Promise<void> {
    const runtime = this.taskRuntimeService.getRuntimeState(conversationId);
    await CoreAcpSessionRepository.upsert({
      conversationId,
      backend: runtime?.type,
      agentId: conversationId,
      status: params.status,
      config: params.config,
    });
  }

  private emitAgentDiscovery(action: 'listed' | 'refreshed', agents?: CoreAcpAgentDescriptorDto[]): void {
    coreEventBus.emit('acp', 'acp.agent.discovery.updated', {
      action,
      agents,
      count: agents?.length,
    });
  }

  private emitHealthChecked(data: CoreAcpHealthDto): void {
    coreEventBus.emit('acp', 'acp.agent.health.checked', data);
  }

  private async emitSessionUpdated(
    action: CoreAcpSessionUpdatedPayload['action'],
    conversationId: string,
    data: CoreAcpSessionUpdatedInput = {}
  ): Promise<void> {
    const snapshot = await Promise.resolve(data.snapshot ?? this.buildSessionSnapshot(conversationId));
    coreEventBus.emit('acp', 'acp.session.updated', {
      action,
      conversationId,
      ...data,
      snapshot,
    });
  }

  private extractMessage(result: unknown): string | undefined {
    if (result && typeof result === 'object' && 'msg' in result && typeof result.msg === 'string') {
      return result.msg;
    }
    return undefined;
  }
}
