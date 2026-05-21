/**
 * @license
 * Copyright 2025 LokSystem (loksystem.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IMcpServer } from '@/common/config/storage';
import { ProcessConfig } from '@process/utils/initStorage';
import { AbstractMcpAgent, type McpOperationResult } from '../McpProtocol';

/**
 * LokSystem local MCP agent implementation.
 *
 * This agent manages MCP configuration consumed by the bundled Lok CLI runtime
 * powered by `@office-ai/aioncli-core`.
 */
export class LokSystemMcpAgent extends AbstractMcpAgent {
  constructor() {
    // Use a dedicated backend id so runtime-managed MCP config stays separate
    // from MCP settings that belong to external ACP-compatible CLIs.
    super('loksystem');
  }

  getSupportedTransports(): string[] {
    // @office-ai/aioncli-core supports stdio, sse, http
    // (streamable_http is treated as http).
    return ['stdio', 'sse', 'http', 'streamable_http'];
  }

  /**
   * Read MCP servers managed by the Lok CLI runtime from ProcessConfig.
   */
  async detectMcpServers(_cliPath?: string): Promise<IMcpServer[]> {
    try {
      const mcpConfig = await ProcessConfig.get('mcp.config');
      if (!mcpConfig || !Array.isArray(mcpConfig)) {
        return [];
      }

      return mcpConfig.filter((server: IMcpServer) => {
        const supportedTypes = this.getSupportedTransports();
        return supportedTypes.includes(server.transport.type);
      });
    } catch (error) {
      console.warn('[LokSystemMcpAgent] Failed to detect MCP servers:', error);
      return [];
    }
  }

  /**
   * Merge MCP servers into the runtime-managed LokSystem config.
   */
  async installMcpServers(mcpServers: IMcpServer[]): Promise<McpOperationResult> {
    try {
      const currentConfig = (await ProcessConfig.get('mcp.config')) || [];
      const existingServers = Array.isArray(currentConfig) ? currentConfig : [];
      const serverMap = new Map<string, IMcpServer>();

      existingServers.forEach((server: IMcpServer) => {
        serverMap.set(server.name, server);
      });

      mcpServers.forEach((server) => {
        if (this.getSupportedTransports().includes(server.transport.type)) {
          serverMap.set(server.name, {
            ...server,
            updatedAt: Date.now(),
          });
        } else {
          console.warn(`[LokSystemMcpAgent] Skipping ${server.name}: unsupported transport type ${server.transport.type}`);
        }
      });

      const mergedServers = Array.from(serverMap.values());
      await ProcessConfig.set('mcp.config', mergedServers);

      console.log('[LokSystemMcpAgent] Installed MCP servers:', mcpServers.map((server) => server.name).join(', '));
      return { success: true };
    } catch (error) {
      console.error('[LokSystemMcpAgent] Failed to install MCP servers:', error);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  /**
   * Removal is handled by the renderer-managed config editor, so this method is
   * intentionally a no-op.
   */
  removeMcpServer(mcpServerName: string): Promise<McpOperationResult> {
    console.log(`[LokSystemMcpAgent] Skip removing '${mcpServerName}' - config managed by renderer`);
    return Promise.resolve({ success: true });
  }
}
