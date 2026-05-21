/**
 * Tests that SystemActions handles 'weixin' platform in all three ternary chains.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getChannelDefaultModel } from '@process/channels/actions/SystemActions';
import { buildChannelConversationExtra, getChannelEnabledSkills } from '@process/channels/utils';

const { mockGet, mockGetDetectedAgents } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockGetDetectedAgents: vi.fn(() => []),
}));

vi.mock('electron', () => ({
  app: { isPackaged: false, getPath: vi.fn(() => '/tmp') },
}));

vi.mock('@process/utils/initStorage', () => ({
  ProcessConfig: { get: mockGet },
}));

vi.mock('@process/channels/pairing/PairingService', () => ({
  getPairingService: vi.fn(() => ({})),
}));

vi.mock('@process/acp/connectors/acpConversationConnector', () => ({}));

vi.mock('@process/model/providerListStore', () => ({
  getProviderList: vi.fn(async () => []),
}));

vi.mock('@process/agent/acp/AcpDetector', () => ({
  acpDetector: {
    getDetectedAgents: mockGetDetectedAgents,
  },
}));

vi.mock('@/process/services/conversationServiceSingleton', () => ({
  conversationServiceSingleton: {
    createConversation: vi.fn(),
  },
}));

vi.mock('@/process/task/workerTaskManagerSingleton', () => ({
  workerTaskManager: {
    kill: vi.fn(),
  },
}));

vi.mock('@process/channels/agent/ChannelMessageService', () => ({
  getChannelMessageService: vi.fn(() => ({
    clearContext: vi.fn(),
  })),
}));

vi.mock('@process/channels/core/ChannelManager', () => ({
  getChannelManager: vi.fn(() => ({
    getSessionManager: vi.fn(),
    isInitialized: vi.fn(() => false),
  })),
}));

vi.mock('@process/channels/plugins/telegram/TelegramKeyboards', () => ({
  createAgentSelectionKeyboard: vi.fn(),
  createHelpKeyboard: vi.fn(),
  createMainMenuKeyboard: vi.fn(),
  createSessionControlKeyboard: vi.fn(),
}));

vi.mock('@process/channels/plugins/lark/LarkCards', () => ({
  createAgentSelectionCard: vi.fn(),
  createFeaturesCard: vi.fn(),
  createHelpCard: vi.fn(),
  createMainMenuCard: vi.fn(),
  createPairingGuideCard: vi.fn(),
  createSessionStatusCard: vi.fn(),
  createSettingsCard: vi.fn(),
  createTipsCard: vi.fn(),
}));

vi.mock('@process/channels/plugins/dingtalk/DingTalkCards', () => ({
  createAgentSelectionCard: vi.fn(),
  createFeaturesCard: vi.fn(),
  createHelpCard: vi.fn(),
  createMainMenuCard: vi.fn(),
  createPairingGuideCard: vi.fn(),
  createSessionStatusCard: vi.fn(),
  createSettingsCard: vi.fn(),
  createTipsCard: vi.fn(),
}));

describe('SystemActions weixin platform handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGet.mockResolvedValue(undefined);
    mockGetDetectedAgents.mockReturnValue([]);
  });

  it('getChannelDefaultModel reads assistant.weixin.defaultModel for weixin platform', async () => {
    mockGet.mockImplementation((key: string) => {
      if (key === 'assistant.weixin.defaultModel') {
        return Promise.resolve({ id: 'p1', useModel: 'gemini-2.0-flash' });
      }
      return Promise.resolve(undefined);
    });

    const callsBefore = mockGet.mock.calls.length;
    await getChannelDefaultModel('weixin');
    const newCalls = mockGet.mock.calls.slice(callsBefore).map(([key]) => key);

    expect(newCalls).toContain('assistant.weixin.defaultModel');
    expect(newCalls).not.toContain('assistant.telegram.defaultModel');
  });

  it('getChannelDefaultModel falls back to the remaining channel config for removed telegram support', async () => {
    mockGet.mockResolvedValue(undefined);

    const callsBefore = mockGet.mock.calls.length;
    await getChannelDefaultModel('telegram');
    const newCalls = mockGet.mock.calls.slice(callsBefore).map(([key]) => key);

    expect(newCalls).toContain('assistant.wecom.defaultModel');
    expect(newCalls).not.toContain('assistant.weixin.defaultModel');
    expect(newCalls).not.toContain('assistant.telegram.defaultModel');
  });

  it('getChannelDefaultModel reads assistant.wecom.defaultModel for wecom platform', async () => {
    mockGet.mockImplementation((key: string) => {
      if (key === 'assistant.wecom.defaultModel') {
        return Promise.resolve({ id: 'p1', useModel: 'gemini-2.0-flash' });
      }
      return Promise.resolve(undefined);
    });

    await getChannelDefaultModel('wecom');

    expect(mockGet).toHaveBeenCalledWith('assistant.wecom.defaultModel');
    expect(mockGet).not.toHaveBeenCalledWith('assistant.telegram.defaultModel');
  });

  it('reuses the saved weixin model when the provider still exists with valid credentials', async () => {
    mockGet.mockImplementation((key: string) => {
      if (key === 'model.config') {
        return Promise.resolve([
          {
            id: 'openai-provider',
            platform: 'openai',
            apiKey: 'sk-test',
            model: ['gpt-4.1', 'gpt-4o-mini'],
          },
        ]);
      }
      if (key === 'assistant.weixin.defaultModel') {
        return Promise.resolve({ id: 'openai-provider', useModel: 'gpt-4o-mini' });
      }
      return Promise.resolve(undefined);
    });

    const result = await getChannelDefaultModel('weixin');

    expect(result.id).toBe('openai-provider');
    expect(result.platform).toBe('openai');
    expect(result.useModel).toBe('gpt-4o-mini');
  });

  it('falls back to the first provider model when the saved weixin model no longer matches any provider', async () => {
    mockGet.mockImplementation((key: string) => {
      if (key === 'model.config') {
        return Promise.resolve([
          {
            id: 'openai-provider',
            platform: 'openai',
            apiKey: 'sk-test',
            model: ['gpt-4.1', 'gpt-4o-mini'],
          },
        ]);
      }
      if (key === 'assistant.weixin.defaultModel') {
        return Promise.resolve({ id: 'missing-provider', useModel: 'gpt-4o-mini' });
      }
      return Promise.resolve(undefined);
    });

    const result = await getChannelDefaultModel('weixin');

    expect(result.id).toBe('openai-provider');
    expect(result.platform).toBe('openai');
    expect(result.useModel).toBe('gpt-4.1');
  });

  it('falls back to channel_default when no provider with valid credentials exists', async () => {
    mockGet.mockImplementation((key: string) => {
      if (key === 'model.config') return Promise.resolve([]);
      return Promise.resolve(undefined);
    });

    const result = await getChannelDefaultModel('weixin');

    expect(result.id).toBe('channel_default');
    expect(result.platform).toBe('custom');
    expect(result.useModel).toBe('default');
  });

  it('enables weixin-file-send only for weixin channel conversations', () => {
    expect(getChannelEnabledSkills('weixin')).toEqual(['weixin-file-send']);
    expect(getChannelEnabledSkills('telegram')).toBeUndefined();
  });

  it('builds channel conversation extra with enabledSkills for weixin across backends', () => {
    expect(buildChannelConversationExtra({ platform: 'weixin', backend: 'aionrs' })).toEqual({
      enabledSkills: ['weixin-file-send'],
    });

    expect(
      buildChannelConversationExtra({
        platform: 'weixin',
        backend: 'claude',
        customAgentId: 'agent-1',
        agentName: 'Claude',
      })
    ).toEqual({
      backend: 'claude',
      customAgentId: 'agent-1',
      agentName: 'Claude',
      enabledSkills: ['weixin-file-send'],
    });
  });
});
