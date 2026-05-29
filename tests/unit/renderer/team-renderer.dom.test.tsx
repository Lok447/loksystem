// tests/unit/renderer/team-renderer.dom.test.tsx
//
// DOM tests for the team close/remove-agent feature covering:
//   - TeamTabsContext.tsx  (removeAgent prop passthrough)
//   - TeamTabs.tsx         (close button render + click)
//   - TeamPage.tsx         (doRemoveAgent / handleRemoveAgent)

import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks — hoisted so they resolve before any import
// ---------------------------------------------------------------------------

const mockRemoveAgentInvoke = vi.fn();
const mockConversationGetInvoke = vi.fn();
const mockConversationUpdateInvoke = vi.fn();
const mockRenameTeamInvoke = vi.fn();
const coreClientMock = vi.hoisted(() => ({
  teams: {
    get: vi.fn().mockResolvedValue({ id: 'team-1' }),
    ensureSession: vi.fn().mockResolvedValue({ success: true }),
    renameTeam: vi.fn((...args: unknown[]) => mockRenameTeamInvoke(...args)),
    removeAgent: vi.fn((...args: unknown[]) => mockRemoveAgentInvoke({ teamId: args[0], slotId: args[1] })),
    getRuntimeDiagnostics: vi.fn().mockResolvedValue({
      success: true,
      data: {
        teamId: 'team-1',
        capturedAt: 1,
        executionInfo: {
          teamId: 'team-1',
          executionKind: 'legacy_mailbox',
          orchestrationMode: 'legacy_mailbox',
          state: 'stopped',
          context: {
            leaderBackend: 'acp',
            memberCount: 2,
          },
          recovery: {
            source: 'persisted_snapshot',
            snapshotAvailable: true,
            replayReady: true,
            resumeReady: false,
            preferredMode: 'mailbox_replay',
          },
          recoveryPlan: {
            status: 'ready_for_replay',
            mode: 'mailbox_replay',
            steps: [],
            blockers: [],
            summary: ['recovery_plan:mailbox_replay'],
          },
        },
        degradedMembers: [],
        taskDiagnostics: {
          pending: 0,
          inProgress: 0,
          completed: 0,
          waiting: [
            {
              taskId: 'task-1',
              subject: 'Review worker output',
              blockedBy: ['task-upstream'],
              owner: 'slot-member',
            },
          ],
        },
        timeline: [
          {
            id: 'event-1',
            teamId: 'team-1',
            at: 1000,
            type: 'routing_selected',
            level: 'info',
            message: 'Runtime routing selected legacy_mailbox',
            details: {
              requestedEngine: 'legacy_mailbox',
              routingMode: 'off',
            },
          },
          {
            id: 'event-2',
            teamId: 'team-1',
            at: 2000,
            type: 'session_started',
            level: 'info',
            message: 'Execution session started in legacy_mailbox',
            details: {
              executionKind: 'legacy_mailbox',
              orchestrationMode: 'legacy_mailbox',
            },
          },
        ],
        summary: ['execution_kind:legacy_mailbox'],
      },
    }),
    prepareRecoverySession: vi.fn().mockResolvedValue({
      success: true,
      data: {
        teamId: 'team-1',
        executionInfo: {
          teamId: 'team-1',
          executionKind: 'legacy_mailbox',
          orchestrationMode: 'legacy_mailbox',
          state: 'stopped',
        },
        recoveryPlan: {
          status: 'ready_for_replay',
          mode: 'mailbox_replay',
          steps: [],
          blockers: [],
          summary: ['recovery_plan:mailbox_replay'],
        },
        diagnostics: null,
      },
    }),
    executeRecoveryPlan: vi.fn().mockResolvedValue({
      success: true,
      data: {
        teamId: 'team-1',
        status: 'executed',
        executionInfo: {
          teamId: 'team-1',
          executionKind: 'legacy_mailbox',
          orchestrationMode: 'legacy_mailbox',
          state: 'running',
        },
        recoveryPlan: {
          status: 'ready_for_replay',
          mode: 'mailbox_replay',
          steps: [],
          blockers: [],
          summary: ['recovery_plan:mailbox_replay'],
        },
        diagnostics: null,
        actionsApplied: ['rebuild_mailbox_runtime', 'replay_mailbox_messages'],
      },
    }),
  },
  conversations: {
    get: vi.fn((...args: unknown[]) => mockConversationGetInvoke(...args)),
  },
  events: {
    subscribe: vi.fn(() => vi.fn()),
  },
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    team: {
      removeAgent: { invoke: (...args: unknown[]) => mockRemoveAgentInvoke(...args) },
      renameTeam: { invoke: (...args: unknown[]) => mockRenameTeamInvoke(...args) },
      agentSpawned: { on: vi.fn(() => vi.fn()), emit: vi.fn() },
      agentStatusChanged: { on: vi.fn(() => vi.fn()), emit: vi.fn() },
      agentRemoved: { on: vi.fn(() => vi.fn()), emit: vi.fn() },
      agentRenamed: { on: vi.fn(() => vi.fn()), emit: vi.fn() },
    },
    conversation: {
      get: { invoke: (...args: unknown[]) => mockConversationGetInvoke(...args) },
      update: { invoke: (...args: unknown[]) => mockConversationUpdateInvoke(...args) },
      stop: { invoke: vi.fn() },
      responseStream: { on: vi.fn(() => vi.fn()), emit: vi.fn() },
      confirmation: {
        list: { invoke: vi.fn().mockResolvedValue([]) },
        add: { on: vi.fn(() => vi.fn()) },
        remove: { on: vi.fn(() => vi.fn()) },
        update: { on: vi.fn(() => vi.fn()) },
        confirm: { invoke: vi.fn() },
      },
    },
    acpConversation: {
      responseStream: { on: vi.fn(() => vi.fn()), emit: vi.fn() },
    },
  },
}));

vi.mock('electron', () => ({ app: { getPath: vi.fn(() => '/tmp') } }));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en', changeLanguage: vi.fn() },
  }),
}));

vi.mock('swr', () => {
  const useSWR = (_key: unknown, _fetcher?: () => Promise<unknown>) => ({
    data: undefined,
    error: undefined,
    isLoading: false,
    mutate: vi.fn(),
  });
  return {
    default: useSWR,
    useSWRConfig: () => ({ mutate: vi.fn() }),
  };
});

vi.mock('@arco-design/web-react', () => {
  const Message = {
    success: vi.fn(),
    error: vi.fn(),
    useMessage: () => [vi.fn(), null],
  };
  const Modal = {
    confirm: vi.fn(),
  };
  const Spin = ({ loading }: { loading?: boolean }) =>
    loading ? React.createElement('div', { 'data-testid': 'spin' }) : null;
  const Button = ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) =>
    React.createElement('button', { 'data-testid': 'arco-button', onClick }, children);
  const FormItem = ({ children }: { children?: React.ReactNode }) => React.createElement('div', null, children);
  const Form = Object.assign(({ children }: { children?: React.ReactNode }) => React.createElement('form', null, children), {
    Item: FormItem,
  });
  const Input = React.forwardRef<HTMLInputElement, { value?: string; onChange?: (value: string) => void; placeholder?: string }>(
    ({ value, onChange, placeholder }, ref) =>
      React.createElement('input', {
        ref,
        value,
        placeholder,
        onChange: (event: React.ChangeEvent<HTMLInputElement>) => onChange?.(event.target.value),
      })
  );
  const SelectOption = ({ children, value }: { children?: React.ReactNode; value?: string }) =>
    React.createElement('option', { value }, children);
  const SelectOptGroup = ({ children, label }: { children?: React.ReactNode; label?: string }) =>
    React.createElement('optgroup', { label }, children);
  const Select = Object.assign(
    ({
      children,
      value,
      onChange,
    }: {
      children?: React.ReactNode;
      value?: string;
      onChange?: (value: string | undefined) => void;
    }) =>
      React.createElement(
        'select',
        {
          value: value ?? '',
          onChange: (event: React.ChangeEvent<HTMLSelectElement>) => onChange?.(event.target.value || undefined),
        },
        children
      ),
    {
      Option: SelectOption,
      OptGroup: SelectOptGroup,
    }
  );
  return { Button, Form, Input, Message, Modal, Select, Spin };
});

vi.mock('@icon-park/react', () => ({
  Close: (props: Record<string, unknown>) => React.createElement('span', { 'data-testid': 'close-modal-icon', ...props }),
  CloseSmall: (props: Record<string, unknown>) =>
    React.createElement('span', { 'data-testid': 'close-icon', ...props }),
  CloseOne: (props: Record<string, unknown>) =>
    React.createElement('span', { 'data-testid': 'close-one-icon', ...props }),
  Edit: (props: Record<string, unknown>) => React.createElement('span', { 'data-testid': 'edit-icon', ...props }),
  Plus: (props: Record<string, unknown>) => React.createElement('span', { 'data-testid': 'plus-icon', ...props }),
  FullScreen: (props: Record<string, unknown>) =>
    React.createElement('span', { 'data-testid': 'fullscreen-icon', ...props }),
  OffScreen: (props: Record<string, unknown>) =>
    React.createElement('span', { 'data-testid': 'offscreen-icon', ...props }),
  Left: (props: Record<string, unknown>) => React.createElement('span', { 'data-testid': 'left-icon', ...props }),
  Right: (props: Record<string, unknown>) => React.createElement('span', { 'data-testid': 'right-icon', ...props }),
  Down: (props: Record<string, unknown>) => React.createElement('span', { 'data-testid': 'down-icon', ...props }),
  Up: (props: Record<string, unknown>) => React.createElement('span', { 'data-testid': 'up-icon', ...props }),
}));

vi.mock('@/renderer/styles/colors', () => ({
  iconColors: { primary: '#000' },
}));

// Stub child components not under test
vi.mock('@/renderer/pages/team/components/AgentStatusBadge', () => ({
  default: ({ status }: { status: string }) => React.createElement('span', { 'data-testid': 'status-badge' }, status),
}));

vi.mock('@/renderer/pages/team/components/TeamAgentIdentity', () => ({
  default: ({ agentName }: { agentName: string }) =>
    React.createElement('span', { 'data-testid': 'agent-identity' }, agentName),
}));

// TeamPage-specific heavy mocks
vi.mock('@renderer/hooks/context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}));

vi.mock('@/renderer/pages/conversation/hooks/useConversationAgents', () => ({
  useConversationAgents: () => ({ cliAgents: [], presetAssistants: [] }),
}));

vi.mock('@/renderer/pages/conversation/components/ChatLayout', () => ({
  default: ({
    children,
    tabsSlot,
    headerExtra,
  }: {
    children: React.ReactNode;
    tabsSlot?: React.ReactNode;
    headerExtra?: React.ReactNode;
  }) => React.createElement('div', { 'data-testid': 'chat-layout' }, headerExtra, tabsSlot, children),
}));

vi.mock('@/renderer/pages/conversation/components/ChatSider', () => ({
  default: () => React.createElement('div', { 'data-testid': 'chat-sider' }),
}));

vi.mock('@renderer/components/base/LokModal', () => ({
  default: ({
    visible,
    children,
    header,
    footer,
  }: {
    visible?: boolean;
    children?: React.ReactNode;
    header?: { render?: () => React.ReactNode };
    footer?: React.ReactNode;
  }) =>
    visible
      ? React.createElement(
          'div',
          { 'data-testid': 'lok-modal' },
          header?.render ? header.render() : null,
          children,
          footer
        )
      : null,
}));

vi.mock('@/renderer/pages/team/components/TeamChatView', () => ({
  default: () => React.createElement('div', { 'data-testid': 'team-chat-view' }),
}));

vi.mock('@/renderer/components/agent/AcpModelSelector', () => ({
  default: () => null,
}));

vi.mock('@/renderer/pages/conversation/platforms/lokcli/LokCliModelSelector', () => ({
  default: () => null,
}));

vi.mock('@/renderer/pages/conversation/platforms/lokcli/useLokCliModelSelection', () => ({
  useLokCliModelSelection: () => ({}),
}));

vi.mock('@/renderer/pages/team/components/agentSelectUtils', () => ({
  agentKey: (agent: { customAgentId?: string; backend: string }) =>
    agent.customAgentId ? `preset::${agent.customAgentId}` : `cli::${agent.backend}`,
  agentFromKey: (key: string, agents: Array<{ customAgentId?: string; backend: string }>) =>
    agents.find((agent) => (agent.customAgentId ? `preset::${agent.customAgentId}` : `cli::${agent.backend}`) === key),
  resolveConversationType: () => 'acp',
  resolveTeamAgentType: (agent: { presetAgentType?: string; backend?: string } | undefined, fallback: string) =>
    agent?.presetAgentType || agent?.backend || fallback,
  partitionAgentsByTeamRole: (agents: unknown[]) => ({ selectable: agents, blocked: [] }),
  getAgentTeamCapabilitySummary: () => ({
    modeLabel: 'Protocol Team Mode',
    recommendationLabel: 'Worker Recommended',
  }),
  getLeaderMixedBackendHint: () => 'leader hint',
  getTeammateMixedBackendHint: () => 'teammate hint',
  AgentOptionLabel: ({ agent }: { agent: { name: string } }) => React.createElement('span', null, agent.name),
}));

vi.mock('@/renderer/utils/workspace/workspaceEvents', () => ({
  dispatchWorkspaceHasFilesEvent: vi.fn(),
}));

vi.mock('@/renderer/pages/team/hooks/TeamPermissionContext', () => ({
  TeamPermissionProvider: ({ children }: { children: React.ReactNode }) => children,
}));

// Mock useTeamSession to return controllable statusMap and removeAgent
const mockUseTeamSessionReturn = {
  statusMap: new Map<string, { slotId: string; status: string }>(),
  addAgent: vi.fn().mockResolvedValue(undefined),
  renameAgent: vi.fn().mockResolvedValue(undefined),
  removeAgent: vi.fn().mockResolvedValue(undefined),
  mutateTeam: vi.fn().mockResolvedValue(undefined),
};

vi.mock('@/renderer/pages/team/hooks/useTeamSession', () => ({
  useTeamSession: () => mockUseTeamSessionReturn,
}));

vi.mock('@/common/coreClient', () => ({
  getRendererCoreClient: vi.fn(() => coreClientMock),
}));

// ---------------------------------------------------------------------------
// Imports under test
// ---------------------------------------------------------------------------

import { TeamTabsProvider, useTeamTabs } from '@renderer/pages/team/hooks/TeamTabsContext';
import type { TeamAgent, TTeam } from '@/common/types/teamTypes';
import { getRendererCoreClient } from '@/common/coreClient';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeAgents(): TeamAgent[] {
  return [
    {
      slotId: 'slot-lead',
      conversationId: 'conv-lead',
      role: 'leader',
      agentType: 'acp',
      agentName: 'Leader',
      conversationType: 'acp',
      status: 'idle',
    },
    {
      slotId: 'slot-member',
      conversationId: 'conv-member',
      role: 'teammate',
      agentType: 'acp',
      agentName: 'Worker',
      conversationType: 'acp',
      status: 'idle',
    },
  ];
}

function makeTeam(): TTeam {
  return {
    id: 'team-1',
    name: 'Test Team',
    leaderAgentId: 'slot-lead',
    agents: makeAgents(),
    createdAt: 1,
    updatedAt: 1,
  } as TTeam;
}

function makeSingleLeaderTeam(): TTeam {
  return {
    id: 'team-1',
    name: 'Test Team',
    leaderAgentId: 'slot-lead',
    agents: [makeAgents()[0]],
    createdAt: 1,
    updatedAt: 1,
  } as TTeam;
}

// ---------------------------------------------------------------------------
// 1. TeamTabsContext — removeAgent passthrough
// ---------------------------------------------------------------------------

describe('TeamTabsContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('exposes removeAgent through context when provided', () => {
    const mockRemove = vi.fn().mockResolvedValue(undefined);
    let contextValue: ReturnType<typeof useTeamTabs> | null = null;

    const Consumer = () => {
      contextValue = useTeamTabs();
      return null;
    };

    render(
      React.createElement(
        TeamTabsProvider,
        {
          agents: makeAgents(),
          statusMap: new Map(),
          defaultActiveSlotId: 'slot-lead',
          teamId: 'team-1',
          removeAgent: mockRemove,
        },
        React.createElement(Consumer)
      )
    );

    expect(contextValue).not.toBeNull();
    expect(contextValue!.removeAgent).toBe(mockRemove);
  });

  it('exposes removeAgent as undefined when not provided', () => {
    let contextValue: ReturnType<typeof useTeamTabs> | null = null;

    const Consumer = () => {
      contextValue = useTeamTabs();
      return null;
    };

    render(
      React.createElement(
        TeamTabsProvider,
        {
          agents: makeAgents(),
          statusMap: new Map(),
          defaultActiveSlotId: 'slot-lead',
          teamId: 'team-1',
        },
        React.createElement(Consumer)
      )
    );

    expect(contextValue).not.toBeNull();
    expect(contextValue!.removeAgent).toBeUndefined();
  });

  it('restores teammate tab order from localStorage while keeping the leader first', async () => {
    localStorage.setItem('team-agent-order-team-1', JSON.stringify(['slot-member-2', 'slot-member']));

    const agents: TeamAgent[] = [
      ...makeAgents(),
      {
        slotId: 'slot-member-2',
        conversationId: 'conv-member-2',
        role: 'teammate',
        agentType: 'acp',
        agentName: 'Worker 2',
        conversationType: 'acp',
        status: 'idle',
      },
    ];

    const TeamTabs = (await import('@renderer/pages/team/components/TeamTabs')).default;

    render(
      React.createElement(
        TeamTabsProvider,
        {
          agents,
          statusMap: new Map(),
          defaultActiveSlotId: 'slot-lead',
          teamId: 'team-1',
        },
        React.createElement(TeamTabs, {})
      )
    );

    expect(screen.getAllByTestId('agent-identity').map((element) => element.textContent)).toEqual([
      'Leader',
      'Worker 2',
      'Worker',
    ]);
  });

  it('persists reordered teammate tabs to localStorage', () => {
    let contextValue: ReturnType<typeof useTeamTabs> | null = null;

    const Consumer = () => {
      contextValue = useTeamTabs();
      return null;
    };

    render(
      React.createElement(
        TeamTabsProvider,
        {
          agents: [
            ...makeAgents(),
            {
              slotId: 'slot-member-2',
              conversationId: 'conv-member-2',
              role: 'teammate',
              agentType: 'acp',
              agentName: 'Worker 2',
              conversationType: 'acp',
              status: 'idle',
            },
          ],
          statusMap: new Map(),
          defaultActiveSlotId: 'slot-lead',
          teamId: 'team-1',
        },
        React.createElement(Consumer)
      )
    );

    act(() => {
      contextValue!.reorderAgents('slot-member-2', 'slot-member');
    });

    expect(JSON.parse(localStorage.getItem('team-agent-order-team-1') ?? '[]')).toEqual([
      'slot-member-2',
      'slot-member',
    ]);
  });
});

// ---------------------------------------------------------------------------
// 2. TeamTabs — close button
// ---------------------------------------------------------------------------

describe('TeamTabs close button', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders close button for non-leader agents when removeAgent is provided', async () => {
    const mockRemove = vi.fn().mockResolvedValue(undefined);
    const TeamTabs = (await import('@renderer/pages/team/components/TeamTabs')).default;

    render(
      React.createElement(
        TeamTabsProvider,
        {
          agents: makeAgents(),
          statusMap: new Map(),
          defaultActiveSlotId: 'slot-lead',
          teamId: 'team-1',
          removeAgent: mockRemove,
        },
        React.createElement(TeamTabs, {})
      )
    );

    const closeIcons = screen.getAllByTestId('close-icon');
    expect(closeIcons.length).toBeGreaterThanOrEqual(1);
  });

  it('does not render close button for leader agent', async () => {
    const mockRemove = vi.fn().mockResolvedValue(undefined);
    const TeamTabs = (await import('@renderer/pages/team/components/TeamTabs')).default;

    render(
      React.createElement(
        TeamTabsProvider,
        {
          agents: makeAgents(),
          statusMap: new Map(),
          defaultActiveSlotId: 'slot-lead',
          teamId: 'team-1',
          removeAgent: mockRemove,
        },
        React.createElement(TeamTabs, {})
      )
    );

    const identities = screen.getAllByTestId('agent-identity');
    expect(identities.length).toBe(2);

    const closeIcons = screen.getAllByTestId('close-icon');
    expect(closeIcons.length).toBe(1); // only the non-leader member
  });

  it('calls removeAgent when close button is clicked', async () => {
    const mockRemove = vi.fn().mockResolvedValue(undefined);
    const TeamTabs = (await import('@renderer/pages/team/components/TeamTabs')).default;

    render(
      React.createElement(
        TeamTabsProvider,
        {
          agents: makeAgents(),
          statusMap: new Map(),
          defaultActiveSlotId: 'slot-lead',
          teamId: 'team-1',
          removeAgent: mockRemove,
        },
        React.createElement(TeamTabs, {})
      )
    );

    const closeIcon = screen.getByTestId('close-icon');
    fireEvent.click(closeIcon.closest('span[class]') || closeIcon);

    await waitFor(() => {
      expect(mockRemove).toHaveBeenCalledWith('slot-member');
    });
  });

  it('does not render close button when removeAgent is not provided', async () => {
    const TeamTabs = (await import('@renderer/pages/team/components/TeamTabs')).default;

    render(
      React.createElement(
        TeamTabsProvider,
        {
          agents: makeAgents(),
          statusMap: new Map(),
          defaultActiveSlotId: 'slot-lead',
          teamId: 'team-1',
        },
        React.createElement(TeamTabs, {})
      )
    );

    const closeIcons = screen.queryAllByTestId('close-icon');
    expect(closeIcons.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 3. TeamPage — doRemoveAgent / handleRemoveAgent via full render
// ---------------------------------------------------------------------------

describe('TeamPage remove agent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockRemoveAgentInvoke.mockResolvedValue(undefined);
    coreClientMock.teams.ensureSession.mockResolvedValue({ success: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders remove button for non-leader agent in chat header', async () => {
    const TeamPage = (await import('@renderer/pages/team/TeamPage')).default;

    render(React.createElement(TeamPage, { team: makeTeam() }));

    // The AgentChatSlot renders CloseSmall for non-leader agents
    const closeIcons = screen.getAllByTestId('close-icon');
    expect(closeIcons.length).toBeGreaterThanOrEqual(1);
  });

  it('calls ipcBridge.team.removeAgent when remove is triggered on idle agent', async () => {
    const TeamPage = (await import('@renderer/pages/team/TeamPage')).default;

    render(React.createElement(TeamPage, { team: makeTeam() }));

    // Click all close icons to trigger the remove handler
    const closeIcons = screen.getAllByTestId('close-icon');
    for (const icon of closeIcons) {
      fireEvent.click(icon.parentElement || icon);
    }

    await waitFor(() => {
      expect(mockRemoveAgentInvoke).toHaveBeenCalledWith({
        teamId: 'team-1',
        slotId: 'slot-member',
      });
    });
  });

  it('shows confirm modal when removing an active agent', async () => {
    mockUseTeamSessionReturn.statusMap = new Map([['slot-member', { slotId: 'slot-member', status: 'active' }]]);

    const TeamPage = (await import('@renderer/pages/team/TeamPage')).default;
    const { Modal } = await import('@arco-design/web-react');

    render(React.createElement(TeamPage, { team: makeTeam() }));

    const closeIcons = screen.getAllByTestId('close-icon');
    for (const icon of closeIcons) {
      fireEvent.click(icon.parentElement || icon);
    }

    await waitFor(() => {
      expect(Modal.confirm).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'team.removeAgent.confirmTitle',
          content: 'team.removeAgent.confirmContent',
        })
      );
    });

    mockUseTeamSessionReturn.statusMap = new Map();
  });

  it('shows error message when remove fails', async () => {
    mockRemoveAgentInvoke.mockRejectedValue(new Error('Remove failed'));

    const TeamPage = (await import('@renderer/pages/team/TeamPage')).default;
    const { Message } = await import('@arco-design/web-react');

    render(React.createElement(TeamPage, { team: makeTeam() }));

    const closeIcons = screen.getAllByTestId('close-icon');
    for (const icon of closeIcons) {
      fireEvent.click(icon.parentElement || icon);
    }

    await waitFor(() => {
      expect(Message.error).toHaveBeenCalled();
    });
  });

  it('shows success message after successful remove', async () => {
    mockRemoveAgentInvoke.mockResolvedValue(undefined);

    const TeamPage = (await import('@renderer/pages/team/TeamPage')).default;
    const { Message } = await import('@arco-design/web-react');

    render(React.createElement(TeamPage, { team: makeTeam() }));

    const closeIcons = screen.getAllByTestId('close-icon');
    for (const icon of closeIcons) {
      fireEvent.click(icon.parentElement || icon);
    }

    await waitFor(() => {
      expect(Message.success).toHaveBeenCalled();
    });
  });

  it('renders runtime diagnostics actions and triggers recovery flow', async () => {
    const TeamPage = (await import('@renderer/pages/team/TeamPage')).default;

    render(React.createElement(TeamPage, { team: makeTeam() }));

    expect(screen.getByText('team.runtime.executionOverviewToggle')).toBeTruthy();

    fireEvent.click(screen.getByTestId('team-execution-overview-toggle'));

    expect(screen.getByText('team.runtime.executionOverviewTitle')).toBeTruthy();
    expect(screen.getByTestId('team-execution-overview')).toBeTruthy();
    expect(screen.getByText('team.runtime.executionOverviewOwnershipTitle')).toBeTruthy();
    expect(screen.getByText('team.runtime.executionOverviewRecoveryTitle')).toBeTruthy();
    expect(screen.queryByText('team.runtime.statusStripTitle')).toBeNull();
    expect(screen.queryByTestId('team-execution-lane-leader-slot-lead')).toBeNull();
    expect(screen.queryByTestId('team-execution-lane-worker-slot-member')).toBeNull();
  });

  it('opens add member modal from the team header', async () => {
    const TeamPage = (await import('@renderer/pages/team/TeamPage')).default;

    render(React.createElement(TeamPage, { team: makeTeam() }));

    fireEvent.click(screen.getByTestId('team-add-member-toggle'));

    expect(screen.getByText('team.memberAdd.title')).toBeTruthy();
  });

  it('hides team tabs when the team only has a leader', async () => {
    const TeamPage = (await import('@renderer/pages/team/TeamPage')).default;

    render(React.createElement(TeamPage, { team: makeSingleLeaderTeam() }));

    expect(screen.queryByTestId('team-tab-bar')).toBeNull();
    expect(screen.getAllByTestId('agent-identity').length).toBe(1);
  });
});
