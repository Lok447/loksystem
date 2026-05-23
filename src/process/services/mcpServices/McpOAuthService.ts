/**
 * @license
 * Copyright 2025 LokSystem (loksystem.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { MCPOAuthConfig } from '@office-ai/aioncli-core/dist/src/mcp/oauth-provider.js';
import { EventEmitter } from 'node:events';
import type { IMcpServer } from '@/common/config/storage';

export interface OAuthStatus {
  isAuthenticated: boolean;
  needsLogin: boolean;
  error?: string;
}

type StoredToken = {
  expiresAt?: number;
};

type StoredCredentials = {
  token?: StoredToken;
} | null;

type TokenStorageLike = {
  getCredentials(serverName: string): Promise<StoredCredentials>;
  isTokenExpired(token: StoredToken): boolean;
  deleteCredentials(serverName: string): Promise<void>;
  listServers(): Promise<string[]>;
};

type OAuthProviderLike = {
  authenticate(serverName: string, config: MCPOAuthConfig, mcpServerUrl?: string): Promise<unknown>;
  getValidToken(serverName: string, config: MCPOAuthConfig): Promise<string | null>;
};

type OAuthRuntime = {
  oauthProvider: OAuthProviderLike;
  tokenStorage: TokenStorageLike;
};

/**
 * MCP OAuth service
 *
 * Lazily loads the upstream OAuth runtime so packaged desktop startup does not
 * eagerly execute token-storage code before the app window is ready.
 */
export class McpOAuthService {
  private eventEmitter: EventEmitter;
  private oauthRuntimePromise: Promise<OAuthRuntime> | null = null;

  constructor() {
    this.eventEmitter = new EventEmitter();
  }

  private async getRuntime(): Promise<OAuthRuntime> {
    if (!this.oauthRuntimePromise) {
      this.oauthRuntimePromise = Promise.all([
        import('@office-ai/aioncli-core/dist/src/mcp/oauth-provider.js'),
        import('@office-ai/aioncli-core/dist/src/mcp/oauth-token-storage.js'),
      ])
        .then(([oauthProviderModule, tokenStorageModule]) => {
          const tokenStorage = new tokenStorageModule.MCPOAuthTokenStorage();
          const oauthProvider = new oauthProviderModule.MCPOAuthProvider(tokenStorage);
          return { oauthProvider, tokenStorage };
        })
        .catch((error) => {
          this.oauthRuntimePromise = null;
          throw error;
        });
    }

    return this.oauthRuntimePromise;
  }

  async checkOAuthStatus(server: IMcpServer): Promise<OAuthStatus> {
    try {
      if (server.transport.type !== 'http' && server.transport.type !== 'sse') {
        return {
          isAuthenticated: true,
          needsLogin: false,
        };
      }

      const url = server.transport.url;
      if (!url) {
        return {
          isAuthenticated: false,
          needsLogin: false,
          error: 'No URL provided',
        };
      }

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
        },
      });

      if (response.status === 401) {
        const wwwAuthenticate = response.headers.get('WWW-Authenticate');

        if (wwwAuthenticate) {
          const { tokenStorage } = await this.getRuntime();
          const credentials = await tokenStorage.getCredentials(server.name);

          if (credentials?.token) {
            const isExpired = tokenStorage.isTokenExpired(credentials.token);

            return {
              isAuthenticated: !isExpired,
              needsLogin: isExpired,
              error: isExpired ? 'Token expired' : undefined,
            };
          }

          return {
            isAuthenticated: false,
            needsLogin: true,
          };
        }
      }

      return {
        isAuthenticated: true,
        needsLogin: false,
      };
    } catch (error) {
      console.error('[McpOAuthService] Error checking OAuth status:', error);
      return {
        isAuthenticated: false,
        needsLogin: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async login(server: IMcpServer, oauthConfig?: MCPOAuthConfig): Promise<{ success: boolean; error?: string }> {
    try {
      if (server.transport.type !== 'http' && server.transport.type !== 'sse') {
        return {
          success: false,
          error: 'OAuth only supported for HTTP/SSE transport',
        };
      }

      const url = server.transport.url;
      if (!url) {
        return {
          success: false,
          error: 'No URL provided',
        };
      }

      const config = oauthConfig || { enabled: true };
      const { oauthProvider } = await this.getRuntime();
      await oauthProvider.authenticate(server.name, config, url);

      console.log(`[McpOAuthService] OAuth login successful for ${server.name}`);
      return { success: true };
    } catch (error) {
      console.error('[McpOAuthService] OAuth login failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async getValidToken(server: IMcpServer, oauthConfig?: MCPOAuthConfig): Promise<string | null> {
    try {
      const config = oauthConfig || { enabled: true };
      const { oauthProvider } = await this.getRuntime();
      return await oauthProvider.getValidToken(server.name, config);
    } catch (error) {
      console.error('[McpOAuthService] Failed to get valid token:', error);
      return null;
    }
  }

  async logout(serverName: string): Promise<void> {
    try {
      const { tokenStorage } = await this.getRuntime();
      await tokenStorage.deleteCredentials(serverName);
      console.log(`[McpOAuthService] Logged out from ${serverName}`);
    } catch (error) {
      console.error('[McpOAuthService] Failed to logout:', error);
      throw error;
    }
  }

  async getAuthenticatedServers(): Promise<string[]> {
    try {
      const { tokenStorage } = await this.getRuntime();
      return await tokenStorage.listServers();
    } catch (error) {
      console.error('[McpOAuthService] Failed to list servers:', error);
      return [];
    }
  }

  getEventEmitter(): EventEmitter {
    return this.eventEmitter;
  }
}

export const mcpOAuthService = new McpOAuthService();
