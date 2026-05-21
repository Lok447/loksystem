/**
 * @license
 * Copyright 2025 LokSystem (loksystem.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { agentRegistry } from '@process/agent/AgentRegistry';
import type { IProvider, TChatConversation, TProviderWithModel } from '@/common/config/storage';
import { ProcessConfig } from '@process/utils/initStorage';
import { conversationServiceSingleton } from '@/process/services/conversationServiceSingleton';
import { workerTaskManager } from '@process/task/workerTaskManagerSingleton';
import { getChannelMessageService } from '../agent/ChannelMessageService';
import { getChannelManager } from '../core/ChannelManager';
import { getChannelConversationName, resolveChannelConvType } from '../types';
import {
  createAgentSelectionCard,
  createFeaturesCard,
  createHelpCard,
  createMainMenuCard,
  createPairingGuideCard,
  createSessionStatusCard,
  createSettingsCard,
  createTipsCard,
} from '../plugins/lark/LarkCards';
import {
  createAgentSelectionCard as createDingTalkAgentSelectionCard,
  createFeaturesCard as createDingTalkFeaturesCard,
  createHelpCard as createDingTalkHelpCard,
  createMainMenuCard as createDingTalkMainMenuCard,
  createPairingGuideCard as createDingTalkPairingGuideCard,
  createSessionStatusCard as createDingTalkSessionStatusCard,
  createSettingsCard as createDingTalkSettingsCard,
  createTipsCard as createDingTalkTipsCard,
} from '../plugins/dingtalk/DingTalkCards';
import type { ChannelAgentType, PluginType } from '../types';
import type { ActionHandler, IRegisteredAction } from './types';
import { SystemActionNames, createErrorResponse, createSuccessResponse } from './types';
import { buildChannelConversationExtra } from '../utils';

type AgentDisplayInfo = {
  type: ChannelAgentType;
  emoji: string;
  name: string;
};

/**
 * Get the default model for Channel assistant (Lark/DingTalk/WeChat/WeCom)
 * Reads from saved config or falls back to the first configured provider model.
 */

export async function getChannelDefaultModel(platform: PluginType): Promise<TProviderWithModel> {
  try {
    const providers = await ProcessConfig.get('model.config');
    const providerList = providers && Array.isArray(providers) ? providers : [];

    // Helper: check whether a provider has valid authentication credentials
    const hasProviderAuth = (provider: IProvider): boolean => {
      if (provider.apiKey) return true;
      // Bedrock uses bedrockConfig (access key or profile) instead of apiKey
      if (provider.bedrockConfig) {
        const bc = provider.bedrockConfig;
        if (bc.authMethod === 'accessKey') return !!(bc.accessKeyId && bc.secretAccessKey && bc.region);
        if (bc.authMethod === 'profile') return !!(bc.profile && bc.region);
      }
      return false;
    };

    // Helper: find a provider with valid credentials and the specified model
    const findProviderWithApiKey = (providerId: string, modelName: string): TProviderWithModel | null => {
      const provider = providerList.find((p) => p.id === providerId);
      if (provider && hasProviderAuth(provider) && provider.model?.includes(modelName)) {
        return { ...provider, useModel: modelName } as TProviderWithModel;
      }
      return null;
    };

    // Try to get saved model selection first.
    const savedModel =
      platform === 'lark'
        ? await ProcessConfig.get('assistant.lark.defaultModel')
        : platform === 'dingtalk'
          ? await ProcessConfig.get('assistant.dingtalk.defaultModel')
          : platform === 'weixin'
            ? await ProcessConfig.get('assistant.weixin.defaultModel')
            : await ProcessConfig.get('assistant.wecom.defaultModel');
    if (savedModel?.id && savedModel?.useModel) {
      const result = findProviderWithApiKey(savedModel.id, savedModel.useModel);
      if (result) return result;
    }

    // Fallback: prefer any configured provider with valid credentials.
    const anyProvider = providerList.find((p) => hasProviderAuth(p) && p.model?.length);
    if (anyProvider) {
      return {
        ...anyProvider,
        useModel: anyProvider.model[0],
      } as TProviderWithModel;
    }
  } catch (error) {
    console.warn('[SystemActions] Failed to get saved model, using default:', error);
  }

  // Default fallback - channel mode still requires the user to configure a provider.
  console.error('[SystemActions] No provider with valid credentials found. Channel messages will fail.');
  return {
    id: 'channel_default',
    platform: 'custom',
    name: 'Channel Default',
    baseUrl: '',
    apiKey: '',
    model: ['default'],
    useModel: 'default',
  };
}

/**
 * SystemActions - Handlers for system-level actions
 *
 * These actions handle session management, help, and settings.
 * They don't require AI processing - just system operations.
 */

/**
 * Handle session.new - Create a new conversation session
 */
export const handleSessionNew: ActionHandler = async (context) => {
  const manager = getChannelManager();
  const sessionManager = manager.getSessionManager();

  if (!sessionManager) {
    return createErrorResponse('Session manager not available');
  }

  if (!context.channelUser) {
    return createErrorResponse('User not authorized');
  }

  // Clear existing session and agent for this user+chat
  const existingSession = sessionManager.getSession(context.channelUser.id, context.chatId);
  if (existingSession) {
    // Clear agent cache in ChannelMessageService
    const messageService = getChannelMessageService();
    await messageService.clearContext(existingSession.id);

    // Kill the worker for the old conversation
    if (existingSession.conversationId) {
      try {
        workerTaskManager.kill(existingSession.conversationId);
      } catch (err) {
        console.warn(`[SystemActions] Failed to kill old conversation:`, err);
      }
    }
  }
  await sessionManager.clearSession(context.channelUser.id, context.chatId);

  const platform = context.platform;
  const source = platform === 'lark' || platform === 'dingtalk' || platform === 'weixin' || platform === 'wecom' ? platform : 'lark';

  // Selected agent (defaults to Lok CLI)
  let savedAgent: unknown = undefined;
  try {
    savedAgent = await (platform === 'lark'
      ? ProcessConfig.get('assistant.lark.agent')
      : platform === 'dingtalk'
        ? ProcessConfig.get('assistant.dingtalk.agent')
        : platform === 'weixin'
          ? ProcessConfig.get('assistant.weixin.agent')
          : ProcessConfig.get('assistant.wecom.agent'));
  } catch {
    // ignore
  }
  const savedBackend = (
    savedAgent && typeof savedAgent === 'object' && typeof (savedAgent as any).backend === 'string'
      ? (savedAgent as any).backend
      : 'aionrs'
  ) as string;
  const backend = savedBackend === 'gemini' ? 'aionrs' : savedBackend;
  const customAgentId =
    savedAgent && typeof savedAgent === 'object'
      ? ((savedAgent as any).customAgentId as string | undefined)
      : undefined;
  const agentName =
    savedAgent && typeof savedAgent === 'object' ? ((savedAgent as any).name as string | undefined) : undefined;

  // Provider model is required by typing; ACP/Codex will ignore it.
  const model = await getChannelDefaultModel(platform);

  // Always create a NEW conversation for "session.new" (scoped by chatId)
  const channelChatId = context.chatId;
  const { convType, convBackend } = resolveChannelConvType(backend);
  const name = getChannelConversationName(platform, convType, convBackend, channelChatId);
  const conversationExtra = buildChannelConversationExtra({
    platform,
    backend,
    customAgentId,
    agentName,
  });

  let newConversation: TChatConversation;
  try {
    if (backend === 'aionrs') {
      newConversation = await conversationServiceSingleton.createConversation({
        type: 'aionrs',
        model,
        source,
        name,
        channelChatId,
        extra: conversationExtra,
      });
    } else if (backend === 'codex') {
      newConversation = await conversationServiceSingleton.createConversation({
        type: 'acp',
        model,
        source,
        name,
        channelChatId,
        extra: { ...conversationExtra, backend: 'codex' },
      });
    } else if (backend === 'openclaw-gateway') {
      newConversation = await conversationServiceSingleton.createConversation({
        type: 'openclaw-gateway',
        model,
        source,
        name,
        channelChatId,
        extra: conversationExtra,
      });
    } else {
      newConversation = await conversationServiceSingleton.createConversation({
        type: 'acp',
        model,
        source,
        name,
        channelChatId,
        extra: conversationExtra,
      });
    }
  } catch (error) {
    return createErrorResponse(`Failed to create session: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }

  // Create session with the new conversation ID (scoped by chatId)
  const agentType = convType as ChannelAgentType;
  const session = await sessionManager.createSessionWithConversation(
    context.channelUser,
    newConversation.id,
    agentType,
    undefined,
    channelChatId
  );

  const markup =
    context.platform === 'lark'
      ? createMainMenuCard()
      : context.platform === 'dingtalk'
        ? createDingTalkMainMenuCard()
        : undefined;
  return createSuccessResponse({
    type: 'text',
    text: `🆕 <b>New Session Created</b>\n\nSession ID: <code>${session.id.slice(-8)}</code>\n\nYou can start a new conversation now!`,
    parseMode: 'HTML',
    replyMarkup: markup,
  });
};

/**
 * Handle session.status - Show current session status
 */
export const handleSessionStatus: ActionHandler = async (context) => {
  const manager = getChannelManager();
  const sessionManager = manager.getSessionManager();

  if (!sessionManager) {
    return createErrorResponse('Session manager not available');
  }

  const userId = context.channelUser?.id;
  const session = userId ? sessionManager.getSession(userId, context.chatId) : null;

  // Use platform-specific markup
  if (context.platform === 'lark') {
    const sessionData = session
      ? {
          id: session.id,
          agentType: session.agentType,
          createdAt: session.createdAt,
          lastActivity: session.lastActivity,
        }
      : undefined;
    return createSuccessResponse({
      type: 'text',
      text: '', // Lark card includes the text
      replyMarkup: createSessionStatusCard(sessionData),
    });
  }

  if (context.platform === 'dingtalk') {
    const sessionData = session
      ? {
          id: session.id,
          agentType: session.agentType,
          createdAt: session.createdAt,
          lastActivity: session.lastActivity,
        }
      : undefined;
    return createSuccessResponse({
      type: 'text',
      text: '', // DingTalk card includes the text
      replyMarkup: createDingTalkSessionStatusCard(sessionData),
    });
  }

  if (!session) {
    return createSuccessResponse({
      type: 'text',
      text: '📊 <b>Session Status</b>\n\nNo active session.\n\nSend a message to start a new conversation, or tap the "New Chat" button.',
      parseMode: 'HTML',
      replyMarkup: undefined,
    });
  }

  const duration = Math.floor((Date.now() - session.createdAt) / 1000 / 60);
  const lastActivity = Math.floor((Date.now() - session.lastActivity) / 1000);

  return createSuccessResponse({
    type: 'text',
    text: [
      '📊 <b>Session Status</b>',
      '',
      `🤖 Agent: <code>${session.agentType}</code>`,
      `⏱ Duration: ${duration} min`,
      `📝 Last activity: ${lastActivity} sec ago`,
      `🔖 Session ID: <code>${session.id.slice(-8)}</code>`,
    ].join('\n'),
    parseMode: 'HTML',
    replyMarkup: undefined,
  });
};

/**
 * Handle help.show - Show help menu
 */
export const handleHelpShow: ActionHandler = async (context) => {
  if (context.platform === 'lark') {
    return createSuccessResponse({
      type: 'text',
      text: '', // Lark card includes the text
      replyMarkup: createHelpCard(),
    });
  }
  if (context.platform === 'dingtalk') {
    return createSuccessResponse({
      type: 'text',
      text: '',
      replyMarkup: createDingTalkHelpCard(),
    });
  }
  return createSuccessResponse({
    type: 'text',
    text: [
      '❓ <b>LokSystem Assistant</b>',
      '',
      'A remote assistant to interact with LokSystem via configured channels.',
      '',
      '<b>Common Actions:</b>',
      '• 🆕 New Chat - Start a new session',
      '• 📊 Status - View current session status',
      '• ❓ Help - Show this help message',
      '',
      'Send a message to chat with the AI assistant.',
    ].join('\n'),
    parseMode: 'HTML',
    replyMarkup: undefined,
  });
};

/**
 * Handle help.features - Show feature introduction
 */
export const handleHelpFeatures: ActionHandler = async (context) => {
  if (context.platform === 'lark') {
    return createSuccessResponse({
      type: 'text',
      text: '',
      replyMarkup: createFeaturesCard(),
    });
  }
  if (context.platform === 'dingtalk') {
    return createSuccessResponse({
      type: 'text',
      text: '',
      replyMarkup: createDingTalkFeaturesCard(),
    });
  }
  return createSuccessResponse({
    type: 'text',
    text: [
      '🤖 <b>Features</b>',
      '',
      '<b>AI Chat</b>',
      '• Natural language conversation',
      '• Streaming output, real-time display',
      '• Context memory support',
      '',
      '<b>Session Management</b>',
      '• Single session mode',
      '• Clear context anytime',
      '• View session status',
      '',
      '<b>Message Actions</b>',
      '• Copy reply content',
      '• Regenerate reply',
      '• Continue conversation',
    ].join('\n'),
    parseMode: 'HTML',
    replyMarkup: undefined,
  });
};

/**
 * Handle help.pairing - Show pairing guide
 */
export const handleHelpPairing: ActionHandler = async (context) => {
  if (context.platform === 'lark') {
    return createSuccessResponse({
      type: 'text',
      text: '',
      replyMarkup: createPairingGuideCard(),
    });
  }
  if (context.platform === 'dingtalk') {
    return createSuccessResponse({
      type: 'text',
      text: '',
      replyMarkup: createDingTalkPairingGuideCard(),
    });
  }
  return createSuccessResponse({
    type: 'text',
    text: [
      '🔗 <b>Pairing Guide</b>',
      '',
      '<b>First-time Setup:</b>',
      '1. Send any message to the bot',
      '2. Bot displays pairing code',
      '3. Approve pairing in LokSystem settings',
      '4. Ready to use after pairing',
      '',
      '<b>Notes:</b>',
      '• Pairing code valid for 10 minutes',
      '• LokSystem app must be running',
      '• One channel account can only pair once',
    ].join('\n'),
    parseMode: 'HTML',
    replyMarkup: undefined,
  });
};

/**
 * Handle help.tips - Show usage tips
 */
export const handleHelpTips: ActionHandler = async (context) => {
  if (context.platform === 'lark') {
    return createSuccessResponse({
      type: 'text',
      text: '',
      replyMarkup: createTipsCard(),
    });
  }
  if (context.platform === 'dingtalk') {
    return createSuccessResponse({
      type: 'text',
      text: '',
      replyMarkup: createDingTalkTipsCard(),
    });
  }
  return createSuccessResponse({
    type: 'text',
    text: [
      '💬 <b>Tips</b>',
      '',
      '<b>Effective Conversations:</b>',
      '• Be clear and specific',
      '• Feel free to ask follow-ups',
      '• Regenerate if not satisfied',
      '',
      '<b>Quick Actions:</b>',
      '• Use bottom buttons for quick access',
      '• Tap message buttons for actions',
      '• New chat clears history context',
    ].join('\n'),
    parseMode: 'HTML',
    replyMarkup: undefined,
  });
};

/**
 * Handle settings.show - Show settings info
 */
export const handleSettingsShow: ActionHandler = async (context) => {
  if (context.platform === 'lark') {
    return createSuccessResponse({
      type: 'text',
      text: '',
      replyMarkup: createSettingsCard(),
    });
  }
  if (context.platform === 'dingtalk') {
    return createSuccessResponse({
      type: 'text',
      text: '',
      replyMarkup: createDingTalkSettingsCard(),
    });
  }
  return createSuccessResponse({
    type: 'text',
    text: [
      '⚙️ <b>Settings</b>',
      '',
      'Channel settings need to be configured in the LokSystem app.',
      '',
      'Open LokSystem → WebUI → Channels',
    ].join('\n'),
    parseMode: 'HTML',
    replyMarkup: undefined,
  });
};

/**
 * Handle agent.show - Show agent selection keyboard/card
 */
export const handleAgentShow: ActionHandler = async (context) => {
  const manager = getChannelManager();
  const sessionManager = manager.getSessionManager();

  if (!sessionManager) {
    return createErrorResponse('Session manager not available');
  }

  // Get current agent type from session (scoped by chatId)
  const userId = context.channelUser?.id;
  const session = userId ? sessionManager.getSession(userId, context.chatId) : null;
  const currentAgent = session?.agentType || 'aionrs';

  // Get available agents dynamically
  const availableAgents = getAvailableChannelAgents();

  if (availableAgents.length === 0) {
    return createErrorResponse('No agents available');
  }

  // Use platform-specific markup
  if (context.platform === 'lark') {
    return createSuccessResponse({
      type: 'text',
      text: '', // Lark card includes the text
      replyMarkup: createAgentSelectionCard(availableAgents, currentAgent),
    });
  }

  if (context.platform === 'dingtalk') {
    return createSuccessResponse({
      type: 'text',
      text: '',
      replyMarkup: createDingTalkAgentSelectionCard(availableAgents, currentAgent),
    });
  }

  return createSuccessResponse({
    type: 'text',
    text: [
      '🔄 <b>Switch Agent</b>',
      '',
      'Select an AI agent for your conversations:',
      '',
      `Current: <b>${getAgentDisplayName(currentAgent)}</b>`,
    ].join('\n'),
    parseMode: 'HTML',
    replyMarkup: undefined,
  });
};

/**
 * Handle agent.select - Switch to a different agent
 */
export const handleAgentSelect: ActionHandler = async (context, params) => {
  const manager = getChannelManager();
  const sessionManager = manager.getSessionManager();

  if (!sessionManager) {
    return createErrorResponse('Session manager not available');
  }

  if (!context.channelUser) {
    return createErrorResponse('User not authorized');
  }

  const newAgentType = params?.agentType as ChannelAgentType;

  // Validate agent type is available
  const availableAgents = getAvailableChannelAgents();
  const isValidAgent = availableAgents.some((agent) => agent.type === newAgentType);
  if (!newAgentType || !isValidAgent) {
    return createErrorResponse('Invalid or unavailable agent type');
  }

  // Get current session (scoped by chatId)
  const existingSession = sessionManager.getSession(context.channelUser.id, context.chatId);

  // If same agent, no need to switch
  if (existingSession?.agentType === newAgentType) {
    const markup =
      context.platform === 'lark'
        ? createMainMenuCard()
        : context.platform === 'dingtalk'
          ? createDingTalkMainMenuCard()
          : undefined;
    return createSuccessResponse({
      type: 'text',
      text: `✓ Already using <b>${getAgentDisplayName(newAgentType)}</b>`,
      parseMode: 'HTML',
      replyMarkup: markup,
    });
  }

  // Clear existing session and agent (scoped by chatId)
  if (existingSession) {
    const messageService = getChannelMessageService();
    await messageService.clearContext(existingSession.id);

    if (existingSession.conversationId) {
      try {
        workerTaskManager.kill(existingSession.conversationId);
      } catch (err) {
        console.warn(`[SystemActions] Failed to kill old conversation:`, err);
      }
    }
  }
  await sessionManager.clearSession(context.channelUser.id, context.chatId);

  // Create new session with the selected agent type (scoped by chatId)
  const session = await sessionManager.createSession(context.channelUser, newAgentType, undefined, context.chatId);

  const markup =
    context.platform === 'lark'
      ? createMainMenuCard()
      : context.platform === 'dingtalk'
        ? createDingTalkMainMenuCard()
        : undefined;
  return createSuccessResponse({
    type: 'text',
    text: [
      `✓ <b>Switched to ${getAgentDisplayName(newAgentType)}</b>`,
      '',
      'A new conversation has been started.',
      '',
      'Send a message to begin!',
    ].join('\n'),
    parseMode: 'HTML',
    replyMarkup: markup,
  });
};

/**
 * Get display name for agent type
 */
function getAgentDisplayName(agentType: ChannelAgentType): string {
  if (agentType === 'aionrs') return 'Lok CLI';
  const names: Record<string, string> = {
    gemini: '🤖 Gemini',
    acp: '🧠 Claude',
    codex: '⚡ Codex',
    'openclaw-gateway': '🦞 OpenClaw',
  };
  return names[agentType] || agentType;
}

/**
 * Map backend type to ChannelAgentType
 * Only returns types that are supported by channels
 */
function backendToChannelAgentType(backend: string): ChannelAgentType | null {
  if (backend === 'aionrs' || backend === 'gemini') return 'aionrs';
  if (backend === 'hermes') return 'acp';
  const mapping: Record<string, ChannelAgentType> = {
    gemini: 'gemini',
    claude: 'acp',
    codex: 'codex',
    'openclaw-gateway': 'openclaw-gateway',
  };
  return mapping[backend] || null;
}

/**
 * Get emoji for agent backend
 */
function getAgentEmoji(backend: string): string {
  if (backend === 'aionrs' || backend === 'hermes') return '🧠';
  const emojis: Record<string, string> = {
    gemini: '🤖',
    claude: '🧠',
    codex: '⚡',
    'openclaw-gateway': '🦞',
  };
  return emojis[backend] || '🤖';
}

/**
 * Get available agents for channel selection
 * Filters detected agents to only those supported by channels
 */
function getAvailableChannelAgents(): AgentDisplayInfo[] {
  const detectedAgents = agentRegistry.getDetectedAgents();
  const availableAgents: AgentDisplayInfo[] = [];
  const seenTypes = new Set<ChannelAgentType>();

  // Always include Gemini as it's built-in
  availableAgents.push({ type: 'gemini', emoji: '🤖', name: 'Gemini' });
  availableAgents[0] = { type: 'aionrs', emoji: '🧠', name: 'Lok CLI' };
  seenTypes.add('aionrs');

  // Add detected ACP agents (claude, codex, etc.)
  for (const agent of detectedAgents) {
    const channelType = backendToChannelAgentType(agent.backend);
    if (channelType && !seenTypes.has(channelType)) {
      availableAgents.push({
        type: channelType,
        emoji: getAgentEmoji(agent.backend),
        name: agent.name,
      });
      seenTypes.add(channelType);
    }
  }

  return availableAgents;
}

/**
 * All system actions
 */
export const systemActions: IRegisteredAction[] = [
  {
    name: SystemActionNames.SESSION_NEW,
    category: 'system',
    description: 'Create a new conversation session',
    handler: handleSessionNew,
  },
  {
    name: SystemActionNames.SESSION_STATUS,
    category: 'system',
    description: 'Show current session status',
    handler: handleSessionStatus,
  },
  {
    name: SystemActionNames.HELP_SHOW,
    category: 'system',
    description: 'Show help menu',
    handler: handleHelpShow,
  },
  {
    name: SystemActionNames.HELP_FEATURES,
    category: 'system',
    description: 'Show feature introduction',
    handler: handleHelpFeatures,
  },
  {
    name: SystemActionNames.HELP_PAIRING,
    category: 'system',
    description: 'Show pairing guide',
    handler: handleHelpPairing,
  },
  {
    name: SystemActionNames.HELP_TIPS,
    category: 'system',
    description: 'Show usage tips',
    handler: handleHelpTips,
  },
  {
    name: SystemActionNames.SETTINGS_SHOW,
    category: 'system',
    description: 'Show settings info',
    handler: handleSettingsShow,
  },
  {
    name: SystemActionNames.AGENT_SHOW,
    category: 'system',
    description: 'Show agent selection',
    handler: handleAgentShow,
  },
  {
    name: SystemActionNames.AGENT_SELECT,
    category: 'system',
    description: 'Switch to a different agent',
    handler: handleAgentSelect,
  },
];
