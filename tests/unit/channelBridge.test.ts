/**
 * @license
 * Copyright 2025 LokSystem (loksystem.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import path from 'node:path';

vi.mock('electron', () => ({ app: { isPackaged: false, getPath: vi.fn(() => '/tmp') } }));

type MockHandler = (...args: unknown[]) => unknown;
const handlers: Record<string, MockHandler> = {};

function makeChannel(name: string) {
  return {
    provider: vi.fn((fn: MockHandler) => {
      handlers[name] = fn;
    }),
    emit: vi.fn(),
    invoke: vi.fn(),
  };
}

vi.mock('../../src/common/adapter/ipcBridge', () => ({
  channel: {
    getPluginStatus: makeChannel('getPluginStatus'),
    enablePlugin: makeChannel('enablePlugin'),
    disablePlugin: makeChannel('disablePlugin'),
    testPlugin: makeChannel('testPlugin'),
    getPendingPairings: makeChannel('getPendingPairings'),
    approvePairing: makeChannel('approvePairing'),
    rejectPairing: makeChannel('rejectPairing'),
    getAuthorizedUsers: makeChannel('getAuthorizedUsers'),
    revokeUser: makeChannel('revokeUser'),
    getActiveSessions: makeChannel('getActiveSessions'),
    syncChannelSettings: makeChannel('syncChannelSettings'),
  },
}));

vi.mock('@process/channels/core/ChannelManager', () => ({
  getChannelManager: vi.fn(() => ({
    enablePlugin: vi.fn(async () => ({ success: true })),
    disablePlugin: vi.fn(async () => ({ success: true })),
    testPlugin: vi.fn(async () => ({ success: true })),
    syncChannelSettings: vi.fn(async () => ({ success: true })),
  })),
}));

vi.mock('@process/channels/pairing/PairingService', () => ({
  getPairingService: vi.fn(() => ({
    approvePairing: vi.fn(async () => ({ success: true })),
    rejectPairing: vi.fn(async () => ({ success: true })),
  })),
}));

const mockGetLoadedExtensions = vi.fn(() => []);
const mockGetChannelPluginMeta = vi.fn(() => undefined);
const mockGetChannelPlugins = vi.fn(() => new Map());

vi.mock('@process/extensions', () => ({
  ExtensionRegistry: {
    getInstance: vi.fn(() => ({
      getLoadedExtensions: mockGetLoadedExtensions,
      getChannelPluginMeta: mockGetChannelPluginMeta,
      getChannelPlugins: mockGetChannelPlugins,
    })),
  },
}));

vi.mock('@process/extensions/protocol/assetProtocol', () => ({
  toAssetUrl: vi.fn((value: string) => `asset://${value}`),
}));

import { initChannelBridge } from '../../src/process/bridge/channelBridge';
import type { IChannelRepository } from '../../src/process/services/database/IChannelRepository';
import type {
  IChannelPairingRequest,
  IChannelPluginConfig,
  IChannelSession,
  IChannelUser,
} from '../../src/process/channels/types';

function makeRepo(overrides?: Partial<IChannelRepository>): IChannelRepository {
  return {
    getChannelPlugins: vi.fn(() => []),
    getPendingPairingRequests: vi.fn(() => []),
    getChannelUsers: vi.fn(() => []),
    deleteChannelUser: vi.fn(),
    getChannelSessions: vi.fn(() => []),
    ...overrides,
  };
}

function makePlugin(type = 'weixin'): IChannelPluginConfig {
  return {
    id: type,
    type,
    name: type,
    enabled: true,
    status: 'running',
    createdAt: 1000,
    updatedAt: 1000,
  };
}

describe('channelBridge', () => {
  let repo: IChannelRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetLoadedExtensions.mockReturnValue([]);
    mockGetChannelPluginMeta.mockReturnValue(undefined);
    mockGetChannelPlugins.mockReturnValue(new Map());

    repo = makeRepo();
    initChannelBridge(repo);
  });

  describe('getPluginStatus', () => {
    it('returns builtin plugin data from the repo', async () => {
      const plugin = makePlugin('weixin');
      vi.mocked(repo.getChannelPlugins).mockResolvedValue([plugin]);

      const result = await handlers['getPluginStatus']();

      expect(result.success).toBe(true);
      expect(result.data).toEqual(expect.arrayContaining([expect.objectContaining({ type: 'weixin' })]));
    });

    it('includes unloaded extension plugins only when the extension is enabled', async () => {
      vi.mocked(repo.getChannelPlugins).mockResolvedValue([]);
      mockGetLoadedExtensions.mockReturnValue([
        {
          directory: '/tmp/ext',
          manifest: {
            name: 'demo-ext',
            displayName: 'Demo Extension',
            contributes: {
              channelPlugins: [{ type: 'custom-channel' }],
            },
          },
        },
      ]);
      mockGetChannelPlugins.mockReturnValue(
        new Map([
          [
            'custom-channel',
            {
              meta: {
                name: 'Custom Channel',
                icon: 'icon.svg',
                description: 'Demo extension channel',
              },
            },
          ],
        ])
      );
      mockGetChannelPluginMeta.mockReturnValue({
        description: 'Demo extension channel',
        icon: 'icon.svg',
      });

      const result = await handlers['getPluginStatus']();

      expect(result.success).toBe(true);
      expect(result.data).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'custom-channel',
            isExtension: true,
            extensionMeta: expect.objectContaining({
              extensionName: 'Demo Extension',
              description: 'Demo extension channel',
              icon: `asset://${path.resolve('/tmp/ext', 'icon.svg')}`,
            }),
          }),
        ])
      );
    });

    it('proceeds with builtin channels when the repo throws', async () => {
      vi.mocked(repo.getChannelPlugins).mockRejectedValue(new Error('db unavailable'));

      const result = await handlers['getPluginStatus']();

      expect(result.success).toBe(true);
      expect(Array.isArray(result.data)).toBe(true);
      expect(result.data.map((plugin: { type: string }) => plugin.type)).toEqual(
        expect.arrayContaining(['lark', 'dingtalk', 'weixin', 'wecom'])
      );
    });

    it('does not expose removed channel types such as telegram', async () => {
      vi.mocked(repo.getChannelPlugins).mockResolvedValue([makePlugin('telegram'), makePlugin('weixin')]);

      const result = await handlers['getPluginStatus']();
      const types = result.data.map((plugin: { type: string }) => plugin.type);

      expect(types).toContain('weixin');
      expect(types).not.toContain('telegram');
    });
  });

  describe('getAuthorizedUsers', () => {
    it('returns users from the repo', async () => {
      const user: IChannelUser = {
        id: 'u1',
        platformUserId: 'wx-123',
        platformType: 'weixin',
        authorizedAt: 1000,
      };
      vi.mocked(repo.getChannelUsers).mockResolvedValue([user]);

      const result = await handlers['getAuthorizedUsers']();

      expect(result.success).toBe(true);
      expect(result.data).toEqual([user]);
    });

    it('returns an error when the repo throws', async () => {
      vi.mocked(repo.getChannelUsers).mockRejectedValue(new Error('query failed'));

      const result = await handlers['getAuthorizedUsers']();

      expect(result.success).toBe(false);
      expect(result.msg).toBe('query failed');
    });
  });

  describe('revokeUser', () => {
    it('calls repo.deleteChannelUser with the given userId', async () => {
      const result = await handlers['revokeUser']({ userId: 'u1' });

      expect(repo.deleteChannelUser).toHaveBeenCalledWith('u1');
      expect(result.success).toBe(true);
    });

    it('returns an error when repo.deleteChannelUser throws', async () => {
      vi.mocked(repo.deleteChannelUser).mockRejectedValue(new Error('foreign key constraint'));

      const result = await handlers['revokeUser']({ userId: 'u1' });

      expect(result.success).toBe(false);
      expect(result.msg).toBe('foreign key constraint');
    });
  });

  describe('getPendingPairings', () => {
    it('returns pending pairing requests from the repo', async () => {
      const request: IChannelPairingRequest = {
        id: 'r1',
        code: 'ABC123',
        platformType: 'weixin',
        platformUserId: 'wx-456',
        requestedAt: 1000,
        expiresAt: 2000,
        status: 'pending',
      };
      vi.mocked(repo.getPendingPairingRequests).mockResolvedValue([request]);

      const result = await handlers['getPendingPairings']();

      expect(result.success).toBe(true);
      expect(result.data).toEqual([request]);
    });

    it('returns an error when the repo throws', async () => {
      vi.mocked(repo.getPendingPairingRequests).mockRejectedValue(new Error('pairing table missing'));

      const result = await handlers['getPendingPairings']();

      expect(result.success).toBe(false);
      expect(result.msg).toBe('pairing table missing');
    });
  });

  describe('getActiveSessions', () => {
    it('returns active sessions from the repo', async () => {
      const session: IChannelSession = {
        id: 's1',
        userId: 'u1',
        agentType: 'gemini',
        createdAt: 1000,
        lastActivity: 2000,
      };
      vi.mocked(repo.getChannelSessions).mockResolvedValue([session]);

      const result = await handlers['getActiveSessions']();

      expect(result.success).toBe(true);
      expect(result.data).toEqual([session]);
    });

    it('returns an error when the repo throws', async () => {
      vi.mocked(repo.getChannelSessions).mockRejectedValue(new Error('sessions unavailable'));

      const result = await handlers['getActiveSessions']();

      expect(result.success).toBe(false);
      expect(result.msg).toBe('sessions unavailable');
    });
  });
});
