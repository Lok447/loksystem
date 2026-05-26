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
      const enriched = agents.map((agent) => ({
        ...agent,
        supportedTransports: mcpService.getSupportedTransportsForAgent(agent),
      }));

      const data = enriched.map((agent) => ({
        backend: agent.backend,
        name: agent.name,
        kind: agent.kind,
        cliPath: 'cliPath' in agent ? (agent.cliPath as string | undefined) : undefined,
        supportedTransports: agent.supportedTransports,
        isExtension: 'isExtension' in agent ? (agent.isExtension as boolean | undefined) : undefined,
        extensionName: 'extensionName' in agent ? (agent.extensionName as string | undefined) : undefined,
        isPreset: 'isPreset' in agent ? (agent.isPreset as boolean | undefined) : undefined,
        customAgentId: 'customAgentId' in agent ? (agent.customAgentId as string | undefined) : undefined,
      }));

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
  }

  public async checkAgentHealth(backend: string) {
    const startTime = Date.now();
    const agents = agentRegistry.getDetectedAgents();
    const agent = agents.find((item) => isAgentKind(item, 'acp') && item.backend === backend);
    const acpAgent = agent && isAgentKind(agent, 'acp') ? agent : undefined;

    if (!acpAgent?.cliPath && backend !== 'claude' && backend !== 'codebuddy' && backend !== 'codex') {
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
        return {
          success: false as const,
          msg: `${backend} not authenticated`,
          data: { available: false, error: 'Not authenticated' },
        };
      }

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
      return { success: true as const, data: { mode: 'default', initialized: false } };
    }
    return { success: true as const, data: task.getMode() };
  }

  public getModelInfo(conversationId: string) {
    const task = this.taskRuntimeService.getAcpTask(conversationId);
    if (!task) {
      return { success: true as const, data: { modelInfo: null } };
    }
    return { success: true as const, data: { modelInfo: task.getModelInfo() } };
  }

  public async setModel(conversationId: string, modelId: string) {
    try {
      const task = await this.taskRuntimeService.getOrBuildAcpTask(conversationId);
      if (!task) {
        return {
          success: false as const,
          msg: 'Conversation not found or not an ACP agent',
        };
      }
      return {
        success: true as const,
        data: { modelInfo: await task.setModel(modelId) },
      };
    } catch (error) {
      return { success: false as const, msg: error instanceof Error ? error.message : String(error) };
    }
  }

  public async setMode(conversationId: string, mode: string) {
    try {
      const task = await this.taskRuntimeService.getOrBuildAcpLikeTask(conversationId);
      if (!task) {
        return { success: false as const, msg: 'Conversation not found' };
      }
      return await task.setMode(mode);
    } catch (error) {
      return { success: false as const, msg: error instanceof Error ? error.message : String(error) };
    }
  }

  public getConfigOptions(conversationId: string) {
    const task = this.taskRuntimeService.getAcpTask(conversationId);
    if (!task) {
      return { success: true as const, data: { configOptions: [] } };
    }
    return { success: true as const, data: { configOptions: task.getConfigOptions() } };
  }

  public async setConfigOption(conversationId: string, configId: string, value: string) {
    try {
      const task = await this.taskRuntimeService.getOrBuildAcpTask(conversationId);
      if (!task) {
        return {
          success: false as const,
          msg: 'Conversation not found or not an ACP agent',
        };
      }
      const configOptions = await task.setConfigOption(configId, value);
      return { success: true as const, data: { configOptions } };
    } catch (error) {
      return { success: false as const, msg: error instanceof Error ? error.message : String(error) };
    }
  }
}
