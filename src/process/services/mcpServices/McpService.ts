/**
 * @license
 * Copyright 2025 LokSystem (loksystem.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IMcpServer } from '@/common/config/storage';
import { AionrsMcpAgent } from './agents/AionrsMcpAgent';
import { LokSystemMcpAgent } from './agents/LokSystemMcpAgent';
import { CodebuddyMcpAgent } from './agents/CodebuddyMcpAgent';
import { CodexMcpAgent } from './agents/CodexMcpAgent';
import { OpencodeMcpAgent } from './agents/OpencodeMcpAgent';
import { QwenMcpAgent } from './agents/QwenMcpAgent';
import type { DetectedMcpServer, IMcpProtocol, McpConnectionTestResult, McpSource, McpSyncResult } from './McpProtocol';

type AgentConfig = {
  backend: string;
  name: string;
  cliPath?: string;
};

type DetectionTarget = {
  agentInstance: IMcpProtocol | undefined;
  source: McpSource;
  cliPath?: string;
};

export class McpService {
  private agents: Map<McpSource, IMcpProtocol>;
  private readonly blockedAgentBackends = new Set(['claude', 'anthropic']);
  private readonly blockedAgentNamePatterns = [/claude/i, /anthropic/i, /aion\s*cli/i];

  /**
   * Service-level operation lock to serialize heavy MCP operations.
   * Prevents concurrent MCP scans from spawning too many child processes.
   */
  private operationQueue: Promise<unknown> = Promise.resolve();

  private withServiceLock<T>(operation: () => Promise<T>): Promise<T> {
    const queued = this.operationQueue.then(operation, () => operation());
    this.operationQueue = queued.catch(() => {});
    return queued;
  }

  constructor() {
    this.agents = new Map([
      ['codebuddy', new CodebuddyMcpAgent()],
      ['qwen', new QwenMcpAgent()],
      ['loksystem', new LokSystemMcpAgent()],
      ['codex', new CodexMcpAgent()],
      ['opencode', new OpencodeMcpAgent()],
      ['aionrs', new AionrsMcpAgent()],
    ]);
  }

  private getAgentForConfig(agent: { backend: string; cliPath?: string }): IMcpProtocol | undefined {
    return this.agents.get(agent.backend as McpSource);
  }

  private filterAllowedAgents<T extends { backend: string; name?: string }>(agents: T[]): T[] {
    return agents.filter((agent) => {
      if (this.blockedAgentBackends.has(agent.backend.toLowerCase())) {
        return false;
      }

      return !this.blockedAgentNamePatterns.some((pattern) => pattern.test(agent.name ?? ''));
    });
  }

  private getDetectionTargets(agent: { backend: string; cliPath?: string }): DetectionTarget[] {
    return [
      {
        agentInstance: this.getAgentForConfig(agent),
        source: agent.backend as McpSource,
        cliPath: agent.cliPath,
      },
    ];
  }

  getAgentMcpConfigs(agents: AgentConfig[]): Promise<DetectedMcpServer[]> {
    return this.withServiceLock(async () => {
      const allAgentsToCheck = this.filterAllowedAgents(agents);

      const promises = allAgentsToCheck.flatMap((agent) =>
        this.getDetectionTargets(agent).map(async ({ agentInstance, source, cliPath }) => {
          try {
            if (!agentInstance) {
              console.warn(`[McpService] No agent instance for backend: ${agent.backend}`);
              return null;
            }

            const servers = await agentInstance.detectMcpServers(cliPath);
            console.log(
              `[McpService] Detected ${servers.length} MCP servers for ${agent.backend} (cliPath: ${cliPath || 'default'})`
            );

            if (servers.length === 0) {
              return null;
            }

            return { source, servers };
          } catch (error) {
            console.warn(`[McpService] Failed to detect MCP servers for ${agent.backend}:`, error);
            return null;
          }
        })
      );

      const results = await Promise.all(promises);
      return results.filter((result): result is DetectedMcpServer => result !== null);
    });
  }

  getSupportedTransportsForAgent(agent: { backend: string; cliPath?: string }): string[] {
    const agentInstance = this.getAgentForConfig(agent);
    return agentInstance ? agentInstance.getSupportedTransports() : [];
  }

  async testMcpConnection(server: IMcpServer): Promise<McpConnectionTestResult> {
    const firstAgent = this.agents.values().next().value;
    if (firstAgent) {
      return await firstAgent.testMcpConnection(server);
    }

    return {
      success: false,
      error: 'No agent available for connection testing',
    };
  }

  syncMcpToAgents(mcpServers: IMcpServer[], agents: AgentConfig[]): Promise<McpSyncResult> {
    const enabledServers = mcpServers.filter((server) => server.enabled);

    if (enabledServers.length === 0) {
      return Promise.resolve({ success: true, results: [] });
    }

    return this.withServiceLock(async () => {
      const allAgents = this.filterAllowedAgents(agents);

      const promises = allAgents.map(async (agent) => {
        try {
          const agentInstance = this.getAgentForConfig(agent);
          if (!agentInstance) {
            console.warn(`[McpService] Skipping MCP sync for unsupported backend: ${agent.backend}`);
            return {
              agent: agent.name,
              success: true,
            };
          }

          const result = await agentInstance.installMcpServers(enabledServers);
          return {
            agent: agent.name,
            success: result.success,
            error: result.error,
          };
        } catch (error) {
          return {
            agent: agent.name,
            success: false,
            error: error instanceof Error ? error.message : String(error),
          };
        }
      });

      const results = await Promise.all(promises);
      return { success: results.every((result) => result.success), results };
    });
  }

  removeMcpFromAgents(mcpServerName: string, agents: AgentConfig[]): Promise<McpSyncResult> {
    return this.withServiceLock(async () => {
      const allAgents = this.filterAllowedAgents(agents);

      const promises = allAgents.map(async (agent) => {
        try {
          const agentInstance = this.getAgentForConfig(agent);
          if (!agentInstance) {
            console.warn(`[McpService] Skipping MCP removal for unsupported backend: ${agent.backend}`);
            return {
              agent: `${agent.backend}:${agent.name}`,
              success: true,
            };
          }

          const result = await agentInstance.removeMcpServer(mcpServerName);
          return {
            agent: `${agent.backend}:${agent.name}`,
            success: result.success,
            error: result.error,
          };
        } catch (error) {
          return {
            agent: `${agent.backend}:${agent.name}`,
            success: false,
            error: error instanceof Error ? error.message : String(error),
          };
        }
      });

      const results = await Promise.all(promises);
      return { success: true, results };
    });
  }
}

export const mcpService = new McpService();
