import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getSendBoxDraftHook } from '@renderer/hooks/chat/useSendBoxDraft';
import type { TChatConversation } from '@/common/config/storage';

const mockUpdateLocalImage = vi.fn();

vi.mock('@/renderer/hooks/context/ConversationContext', () => ({
  ConversationProvider: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@renderer/components/layout/FlexFullContainer', () => ({
  __esModule: true,
  default: ({ children }: { children?: React.ReactNode }) => <div data-testid='flex-full-container'>{children}</div>,
}));

vi.mock('@renderer/pages/conversation/Messages/MessageList', () => ({
  __esModule: true,
  default: ({ emptySlot }: { emptySlot?: React.ReactNode }) => <div data-testid='message-list'>{emptySlot}</div>,
}));

vi.mock('@renderer/pages/conversation/Messages/hooks', () => ({
  MessageListProvider: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  useMessageLstCache: vi.fn(),
}));

vi.mock('@renderer/utils/ui/HOC', () => ({
  __esModule: true,
  default: {
    Wrapper:
      (..._providers: unknown[]) =>
      <T,>(Component: T) =>
        Component,
  },
}));

vi.mock('@renderer/components/media/LocalImageView', () => ({
  __esModule: true,
  default: {
    Provider: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
    useUpdateLocalImage: () => mockUpdateLocalImage,
  },
}));

vi.mock('@/renderer/pages/conversation/components/ConversationChatConfirm', () => ({
  __esModule: true,
  default: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@/renderer/pages/conversation/platforms/aionrs/AionrsSendBox', () => ({
  __esModule: true,
  default: () => <div data-testid='aionrs-sendbox' />,
}));

vi.mock('@renderer/utils/model/agentLogo', () => ({
  getAgentLogo: () => null,
}));

const mockPresetInfo = vi.hoisted(() => ({ value: null as { name: string; logo: string; isEmoji: boolean } | null }));
vi.mock('@renderer/hooks/agent/usePresetAssistantInfo', () => ({
  usePresetAssistantInfo: () => ({ info: mockPresetInfo.value, isLoading: false }),
}));

const mockConversationStore = vi.hoisted(() => new Map<string, TChatConversation | null>());

vi.mock('@/common', () => ({
  ipcBridge: {
    conversation: {
      get: {
        invoke: vi.fn(async ({ id }: { id: string }) => mockConversationStore.get(id) ?? null),
      },
    },
  },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? key,
    i18n: { language: 'en-US' },
  }),
}));

import LokCliChat from '@/renderer/pages/conversation/platforms/lokcli/LokCliChat';
import type { LokCliModelSelection } from '@/renderer/pages/conversation/platforms/lokcli/useLokCliModelSelection';
import TeamChatEmptyState from '@/renderer/pages/team/components/TeamChatEmptyState';

const useLokCliDraft = getSendBoxDraftHook('lokcli', {
  _type: 'lokcli',
  atPath: [],
  content: '',
  uploadFile: [],
});

const useAcpDraft = getSendBoxDraftHook('acp', {
  _type: 'acp',
  atPath: [],
  content: '',
  uploadFile: [],
});

const DraftProbe: React.FC<{ conversationId: string }> = ({ conversationId }) => {
  const lokcliDraft = useLokCliDraft(conversationId).data;
  const acpDraft = useAcpDraft(conversationId).data;

  return (
    <>
      <div data-testid='lokcli-draft'>{lokcliDraft?.content ?? ''}</div>
      <div data-testid='acp-draft'>{acpDraft?.content ?? ''}</div>
    </>
  );
};

const modelSelection: LokCliModelSelection = {
  currentModel: undefined,
  providers: [],
  getDisplayModelName: (modelName) => modelName ?? '',
  getAvailableModels: () => [],
  handleSelectModel: vi.fn(),
};

const seedLokCliTeamConversation = (id: string, agentName = 'bob', extra: Record<string, unknown> = {}) => {
  mockConversationStore.set(id, {
    createTime: 0,
    modifyTime: 0,
    id,
    type: 'aionrs',
    name: `demo-team - ${agentName}`,
    extra: { workspace: '/tmp/workspace', teamId: 'team-1', ...extra },
    model: { id: 'p', platform: 'openai', useModel: 'gpt-4o-mini' } as unknown as TChatConversation['model'],
  } as TChatConversation);
};

const findInMessageList = async (text: string) => {
  // Team empty state renders via SWR — wait for the re-render
  return await screen.findByText(text);
};

describe('team empty state', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockConversationStore.clear();
    mockPresetInfo.value = null;
  });

  it('renders the team greeting UI for Lok CLI team chats', async () => {
    seedLokCliTeamConversation('conv-gemini-empty', 'bob');

    render(
      <LokCliChat
        conversation_id='conv-gemini-empty'
        workspace='/tmp/workspace'
        modelSelection={modelSelection}
        teamId='team-1'
        emptySlot={<TeamChatEmptyState conversationId='conv-gemini-empty' />}
      />
    );

    expect(await findInMessageList('bob')).toBeTruthy();
    expect(screen.getByText("Describe your goal and I'll get the team working on it")).toBeTruthy();
    expect(mockUpdateLocalImage).toHaveBeenCalledWith({ root: '/tmp/workspace' });
  });

  it('renders nothing when the conversation has no teamId', async () => {
    mockConversationStore.set('conv-solo', {
      createTime: 0,
      modifyTime: 0,
      id: 'conv-solo',
      type: 'aionrs',
      name: 'solo',
      extra: { workspace: '/tmp/workspace' },
      model: { id: 'p', platform: 'openai', useModel: 'gpt-4o-mini' } as unknown as TChatConversation['model'],
    } as TChatConversation);

    const { container } = render(<TeamChatEmptyState conversationId='conv-solo' />);

    // Even after the SWR fetch resolves, the component renders null.
    await Promise.resolve();
    expect(container.textContent).toBe('');
  });

  it('writes suggestion text into the Lok CLI draft store instead of the ACP draft store', async () => {
    seedLokCliTeamConversation('conv-gemini-draft', 'alice');

    render(
      <>
        <TeamChatEmptyState conversationId='conv-gemini-draft' />
        <DraftProbe conversationId='conv-gemini-draft' />
      </>
    );

    fireEvent.click(await findInMessageList('Organize a debate with agents taking different sides'));

    expect(screen.getByTestId('lokcli-draft').textContent).toBe('Organize a debate with agents taking different sides');
    expect(screen.getByTestId('acp-draft').textContent).toBe('');
  });

  it('renders preset emoji avatar when leader is a preset assistant', async () => {
    mockPresetInfo.value = { name: 'Word Creator', logo: '📝', isEmoji: true };
    seedLokCliTeamConversation('conv-preset-emoji', 'Word Creator');

    render(<TeamChatEmptyState conversationId='conv-preset-emoji' />);

    expect(await findInMessageList('📝')).toBeTruthy();
    expect(screen.getByText('Word Creator')).toBeTruthy();
  });

  it('renders preset image avatar when preset info provides an svg url', async () => {
    mockPresetInfo.value = { name: 'Cowork', logo: '/assets/cowork.svg', isEmoji: false };
    seedLokCliTeamConversation('conv-preset-svg', 'Cowork');

    render(<TeamChatEmptyState conversationId='conv-preset-svg' />);

    const avatar = (await screen.findByAltText('Cowork')) as HTMLImageElement;
    expect(avatar.src).toContain('/assets/cowork.svg');
  });
});
