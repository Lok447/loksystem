/**
 * @license
 * Copyright 2025 LokSystem (loksystem.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TChatConversation } from '../../../src/common/config/storage';
import type { IConversationService } from '../../../src/process/services/IConversationService';
import type { ITeamRepository } from '../../../src/process/team/repository/ITeamRepository';
import type { TTeam, TeamAgent } from '../../../src/common/types/teamTypes';
import {
  TeamDiagnosticsService,
  TeamEventStore,
  TeamRuntimeSnapshotStore,
  type TeamRuntimeSnapshot,
} from '../../../src/process/team-runtime/diagnostics';
import { GatewayRecoveryShell } from '../../../src/process/team-runtime/gateway';

const { mockConfigGet, mockReadFile } = vi.hoisted(() => ({
  mockConfigGet: vi.fn(),
  mockReadFile: vi.fn(),
}));

vi.mock('../../../src/process/utils/initStorage', () => ({
  ProcessConfig: {
    get: mockConfigGet,
  },
  getAssistantsDir: () => '/assistants',
}));

vi.mock('fs/promises', () => ({
  default: {
    readFile: mockReadFile,
    access: mockReadFile,
  },
  readFile: mockReadFile,
  access: mockReadFile,
}));

import { TeamSessionService } from '../../../src/process/team/TeamSessionService';

function makeRepo(overrides: Partial<ITeamRepository> = {}): ITeamRepository {
  return {
    create: vi.fn(),
    findById: vi.fn(),
    findAll: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    deleteMailboxByTeam: vi.fn(),
    deleteTasksByTeam: vi.fn(),
    writeMessage: vi.fn(),
    readUnread: vi.fn(),
    readUnreadAndMark: vi.fn(),
    markRead: vi.fn(),
    getMailboxHistory: vi.fn(),
    createTask: vi.fn(),
    findTaskById: vi.fn(),
    updateTask: vi.fn(),
    findTasksByTeam: vi.fn(),
    findTasksByOwner: vi.fn(),
    deleteTask: vi.fn(),
    appendToBlocks: vi.fn(),
    removeFromBlockedBy: vi.fn(),
    ...overrides,
  };
}

function makeConversationService(overrides: Partial<IConversationService> = {}): IConversationService {
  return {
    createConversation: vi.fn(),
    deleteConversation: vi.fn(),
    updateConversation: vi.fn(),
    getConversation: vi.fn(),
    createWithMigration: vi.fn(),
    listAllConversations: vi.fn(),
    ...overrides,
  };
}

function makeWorkerTaskManager() {
  return {
    getOrBuildTask: vi.fn(),
  };
}

function makeAgent(overrides: Partial<TeamAgent> = {}): TeamAgent {
  return {
    slotId: '',
    conversationId: '',
    role: 'leader',
    agentType: 'gemini',
    agentName: 'Gemini',
    conversationType: 'gemini',
    status: 'pending',
    ...overrides,
  };
}

describe('TeamSessionService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('requires a real provider when migrating legacy gemini teams to Lok CLI', async () => {
    mockConfigGet.mockImplementation(async () => undefined);

    const repo = makeRepo();
    const conversationService = makeConversationService({
      createConversation: vi.fn().mockResolvedValue({ id: 'conv-gemini', extra: {} }),
    });
    const service = new TeamSessionService(repo, makeWorkerTaskManager() as any, conversationService);

    await expect(
      service.createTeam({
        userId: 'user-1',
        name: 'Team Gemini',
        workspace: '/workspace',
        workspaceMode: 'shared',
        agents: [makeAgent()],
      })
    ).rejects.toThrow('No enabled model provider for LokCLI');
  });

  it('uses configured provider model when migrating gemini teams to Lok CLI', async () => {
    mockConfigGet.mockImplementation(async (key: string) => {
      if (key === 'model.config') {
        return [
          {
            id: 'provider-gemini',
            platform: 'gemini',
            name: 'Gemini API',
            apiKey: 'test-key',
            baseUrl: 'https://generativelanguage.googleapis.com',
            model: ['gemini-2.5-pro'],
            enabled: true,
          },
        ];
      }
      return undefined;
    });
    mockReadFile.mockRejectedValue(new Error('ENOENT'));

    const repo = makeRepo();
    const conversationService = makeConversationService({
      createConversation: vi.fn().mockResolvedValue({ id: 'conv-gemini-api', extra: {} }),
    });
    const service = new TeamSessionService(repo, makeWorkerTaskManager() as any, conversationService);

    await service.createTeam({
      userId: 'user-1',
      name: 'Team Gemini API',
      workspace: '/workspace',
      workspaceMode: 'shared',
      agents: [makeAgent()],
    });

    expect(conversationService.createConversation).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'lokcli',
        model: expect.objectContaining({
          id: 'provider-gemini',
          platform: 'gemini',
          apiKey: 'test-key',
          useModel: 'gemini-2.5-pro',
        }),
      })
    );
  });

  it('uses preferred ACP model when creating qwen team conversations with an override-enabled worker backend', async () => {
    mockConfigGet.mockImplementation(async (key: string) => {
      if (key === 'gemini.defaultModel') {
        return undefined;
      }
      if (key === 'model.config') {
        return [
          {
            id: 'provider-1',
            platform: 'gemini',
            name: 'Gemini API',
            apiKey: 'key',
            baseUrl: 'https://example.com',
            model: ['gemini-2.0-flash'],
            enabled: true,
          },
        ];
      }
      if (key === 'acp.config') {
        return {
          qwen: {
            preferredModelId: 'qwen3-coder-plus',
          },
        };
      }
      if (key === 'acp.cachedModels') {
        return undefined;
      }
      if (key === 'team.capabilityOverrides') {
        return {
          qwen: {
            currentlySupported: true,
            workerRecommended: true,
            leaderRecommended: true,
            recommendedTeamMode: 'protocol_coordinated',
          },
        };
      }
      return undefined;
    });

    const repo = makeRepo();
    const conversationService = makeConversationService({
      createConversation: vi.fn().mockResolvedValue({ id: 'conv-qwen', extra: {} }),
    });
    const service = new TeamSessionService(repo, makeWorkerTaskManager() as any, conversationService);

    await service.createTeam({
      userId: 'user-1',
      name: 'Team Qwen',
      workspace: '/workspace',
      workspaceMode: 'shared',
      agents: [makeAgent({ agentType: 'qwen', agentName: 'Qwen', conversationType: 'acp' })],
    });

    expect(conversationService.createConversation).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'acp',
        extra: expect.objectContaining({
          backend: 'qwen',
          currentModelId: 'qwen3-coder-plus',
        }),
      })
    );
  });

  it('creates remote team conversations with the remote agent id when override enables managed worker mode', async () => {
    mockConfigGet.mockImplementation(async (key: string) => {
      if (key === 'team.capabilityOverrides') {
        return {
          remote: {
            currentlySupported: true,
            workerRecommended: true,
            leaderRecommended: true,
            recommendedTeamMode: 'managed_mailbox',
          },
        };
      }
      return undefined;
    });

    const repo = makeRepo();
    const conversationService = makeConversationService({
      createConversation: vi.fn().mockResolvedValue({ id: 'conv-remote', extra: {} }),
    });
    const service = new TeamSessionService(repo, makeWorkerTaskManager() as any, conversationService);

    await service.createTeam({
      userId: 'user-1',
      name: 'Team Remote',
      workspace: '/workspace',
      workspaceMode: 'shared',
      agents: [
        makeAgent({
          agentType: 'remote',
          agentName: 'Remote Agent',
          conversationType: 'remote',
          customAgentId: 'remote-agent-id',
        }),
      ],
    });

    expect(conversationService.createConversation).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'remote',
        extra: expect.objectContaining({
          remoteAgentId: 'remote-agent-id',
          teamId: expect.any(String),
        }),
      })
    );
  });

  it('creates preset gemini team conversations as Lok CLI with preset rules and enabled skills', async () => {
    mockConfigGet.mockImplementation(async (key: string) => {
      if (key === 'language') {
        return 'en-US';
      }
      if (key === 'model.config') {
        return [
          {
            id: 'provider-1',
            platform: 'gemini',
            name: 'Gemini API',
            apiKey: 'key',
            baseUrl: 'https://example.com',
            model: ['gemini-2.0-flash'],
            enabled: true,
          },
        ];
      }
      if (key === 'assistants') {
        return [{ id: 'assistant-1', enabledSkills: ['skill-a'] }];
      }
      return undefined;
    });
    mockReadFile.mockImplementation(async (targetPath: string) => {
      if (targetPath.includes('assistant-1.en-US.md')) {
        return 'PRESET RULES';
      }
      if (targetPath.includes('assistant-1-skills.en-US.md')) {
        return 'PRESET SKILLS';
      }
      throw new Error('not found');
    });

    const repo = makeRepo();
    const conversationService = makeConversationService({
      createConversation: vi.fn().mockResolvedValue({ id: 'conv-preset-gemini', extra: {} }),
    });
    const service = new TeamSessionService(repo, makeWorkerTaskManager() as any, conversationService);

    await service.createTeam({
      userId: 'user-1',
      name: 'Team Preset Gemini',
      workspace: '/workspace',
      workspaceMode: 'shared',
      agents: [
        makeAgent({
          agentType: 'gemini',
          agentName: 'Preset Gemini',
          conversationType: 'gemini',
          customAgentId: 'assistant-1',
        }),
      ],
    });

    expect(conversationService.createConversation).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'lokcli',
        model: expect.objectContaining({
          id: 'provider-1',
          useModel: 'gemini-2.0-flash',
        }),
        extra: expect.objectContaining({
          presetAssistantId: 'assistant-1',
          presetRules: 'PRESET RULES',
          enabledSkills: ['skill-a'],
        }),
      })
    );
  });

  it('preserves preset assistant identity and only inherits session mode when adding teammates', async () => {
    mockConfigGet.mockImplementation(async (key: string) => {
      if (key === 'gemini.defaultModel') {
        return undefined;
      }
      if (key === 'model.config') {
        return [
          {
            id: 'provider-1',
            platform: 'gemini',
            name: 'Gemini API',
            apiKey: 'key',
            baseUrl: 'https://example.com',
            model: ['gemini-2.0-flash'],
            enabled: true,
          },
        ];
      }
      if (key === 'acp.config') {
        return {
          qwen: {
            preferredModelId: 'qwen3-coder-next',
          },
        };
      }
      if (key === 'acp.cachedModels') {
        return undefined;
      }
      if (key === 'team.capabilityOverrides') {
        return {
          qwen: {
            currentlySupported: true,
            workerRecommended: true,
            leaderRecommended: false,
            recommendedTeamMode: 'protocol_coordinated',
          },
        };
      }
      return undefined;
    });

    const team: TTeam = {
      id: 'team-1',
      userId: 'user-1',
      name: 'Preset Team',
      workspace: '/workspace',
      workspaceMode: 'shared',
      leaderAgentId: 'slot-lead',
      agents: [
        {
          slotId: 'slot-lead',
          conversationId: 'conv-lead',
          role: 'leader',
          agentType: 'hermes',
          agentName: 'Lead Hermes',
          conversationType: 'lokcli',
          status: 'idle',
        },
      ],
      createdAt: 1,
      updatedAt: 1,
    };
    const repo = makeRepo({
      findById: vi.fn().mockResolvedValue(team),
      update: vi.fn().mockImplementation(async (_id, updates) => ({ ...team, ...updates })),
    });
    const conversationService = makeConversationService({
      createConversation: vi.fn().mockResolvedValue({ id: 'conv-new', extra: {} }),
      getConversation: vi.fn().mockResolvedValue({
        id: 'conv-lead',
        extra: {
          backend: 'hermes',
          sessionMode: 'yolo',
        },
      }),
    });
    const service = new TeamSessionService(repo, makeWorkerTaskManager() as any, conversationService);

    await service.addAgent('team-1', {
      conversationId: '',
      role: 'teammate',
      agentType: 'qwen',
      agentName: 'Preset Qwen',
      conversationType: 'acp',
      status: 'pending',
      customAgentId: 'builtin-preset-qwen',
    });

    expect(conversationService.createConversation).toHaveBeenCalledWith(
      expect.objectContaining({
        extra: expect.objectContaining({
          backend: 'qwen',
          presetAssistantId: 'builtin-preset-qwen',
          sessionMode: 'yolo',
          currentModelId: 'qwen3-coder-next',
        }),
      })
    );
  });

  it('repairs legacy teams whose agents array was lost but conversations still exist', async () => {
    const legacyTeam: TTeam = {
      id: 'team-legacy',
      userId: 'user-1',
      name: 'Legacy Team',
      workspace: '',
      workspaceMode: 'shared',
      leaderAgentId: 'slot-lead',
      agents: [],
      createdAt: 1,
      updatedAt: 1,
    };
    const legacyConversation: TChatConversation = {
      id: 'conv-legacy',
      name: 'Legacy Team - Leader',
      type: 'acp',
      status: 'pending',
      createTime: 1,
      modifyTime: 2,
      extra: {
        backend: 'codex',
        cliPath: 'codex',
        agentName: 'Leader',
        teamId: 'team-legacy',
        teamMcpStdioConfig: {
          env: [{ name: 'TEAM_AGENT_SLOT_ID', value: 'slot-lead' }],
        },
      },
    };

    const repo = makeRepo({
      findById: vi.fn().mockResolvedValue(legacyTeam),
    });
    const conversationService = makeConversationService({
      listAllConversations: vi.fn().mockResolvedValue([legacyConversation]),
    });
    const service = new TeamSessionService(repo, makeWorkerTaskManager() as any, conversationService);

    const repairedTeam = await service.getTeam('team-legacy');

    expect(repairedTeam).toEqual(
      expect.objectContaining({
        leaderAgentId: 'slot-lead',
        agents: [
          expect.objectContaining({
            slotId: 'slot-lead',
            conversationId: 'conv-legacy',
            role: 'leader',
            agentType: 'codex',
            agentName: 'Leader',
            conversationType: 'acp',
            cliPath: 'codex',
          }),
        ],
      })
    );
    expect(repo.update).toHaveBeenCalledWith(
      'team-legacy',
      expect.objectContaining({
        leaderAgentId: 'slot-lead',
        agents: [
          expect.objectContaining({
            slotId: 'slot-lead',
            conversationId: 'conv-legacy',
          }),
        ],
        updatedAt: expect.any(Number),
      })
    );
  });

  it('normalizes placeholder leader backends to hermes during team creation', async () => {
    mockConfigGet.mockImplementation(async (key: string) => {
      if (key === 'model.config') {
        return [
          {
            id: 'provider-1',
            platform: 'openai',
            name: 'OpenAI',
            apiKey: 'key',
            baseUrl: 'https://example.com',
            model: ['gpt-5'],
            enabled: true,
          },
        ];
      }
      if (key === 'acp.cachedInitializeResult') {
        return {};
      }
      return undefined;
    });

    const repo = makeRepo();
    const conversationService = makeConversationService({
      createConversation: vi.fn().mockResolvedValue({ id: 'conv-hermes', extra: {} }),
    });
    const service = new TeamSessionService(repo, makeWorkerTaskManager() as any, conversationService);

    const team = await service.createTeam({
      userId: 'user-1',
      name: 'Fallback Team',
      workspace: '/workspace',
      workspaceMode: 'shared',
      agents: [makeAgent({ agentType: 'acp', agentName: 'Placeholder Lead', conversationType: 'acp' })],
    });

    expect(conversationService.createConversation).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'lokcli',
        extra: expect.objectContaining({ backend: 'hermes' }),
      })
    );
    expect(team.agents[0]).toEqual(expect.objectContaining({ agentType: 'hermes', conversationType: 'acp' }));
    expect(team).toEqual(
      expect.objectContaining({
        orchestrationMode: 'legacy_mailbox',
        executionEngine: 'legacy_mailbox',
      })
    );
  });

  it('normalizes teammate acp placeholders to the leader backend when it is worker-capable', async () => {
    mockConfigGet.mockImplementation(async (key: string) => {
      if (key === 'acp.cachedInitializeResult') {
        return {
          codex: {
            protocolVersion: 1,
            capabilities: {
              loadSession: false,
              promptCapabilities: { image: false, audio: false, embeddedContext: false },
              mcpCapabilities: { stdio: true, http: false, sse: false },
              sessionCapabilities: { fork: null, resume: null, list: null, close: null },
              _meta: {},
            },
            agentInfo: null,
            authMethods: [],
          },
        };
      }
      return undefined;
    });

    const team: TTeam = {
      id: 'team-codex',
      userId: 'user-1',
      name: 'Codex Team',
      workspace: '/workspace',
      workspaceMode: 'shared',
      leaderAgentId: 'slot-lead',
      agents: [
        {
          slotId: 'slot-lead',
          conversationId: 'conv-lead',
          role: 'leader',
          agentType: 'codex',
          agentName: 'Codex Lead',
          conversationType: 'acp',
          status: 'idle',
        },
      ],
      createdAt: 1,
      updatedAt: 1,
    };
    const repo = makeRepo({
      findById: vi.fn().mockResolvedValue(team),
      update: vi.fn().mockImplementation(async (_id, updates) => ({ ...team, ...updates })),
    });
    const conversationService = makeConversationService({
      createConversation: vi.fn().mockResolvedValue({ id: 'conv-worker', extra: {} }),
      getConversation: vi.fn().mockResolvedValue({
        id: 'conv-lead',
        extra: { backend: 'codex', sessionMode: 'yolo' },
      }),
    });
    const service = new TeamSessionService(repo, makeWorkerTaskManager() as any, conversationService);

    const added = await service.addAgent('team-codex', {
      conversationId: '',
      role: 'teammate',
      agentType: 'acp',
      agentName: 'Worker',
      conversationType: 'acp',
      status: 'pending',
    });

    expect(conversationService.createConversation).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'acp',
        extra: expect.objectContaining({ backend: 'codex', sessionMode: 'yolo' }),
      })
    );
    expect(added).toEqual(expect.objectContaining({ agentType: 'codex' }));
  });

  it('rejects a requested leader backend that is worker-only via override', async () => {
    mockConfigGet.mockImplementation(async (key: string) => {
      if (key === 'model.config') {
        return [
          {
            id: 'provider-1',
            platform: 'openai',
            name: 'OpenAI',
            apiKey: 'key',
            baseUrl: 'https://example.com',
            model: ['gpt-5'],
            enabled: true,
          },
        ];
      }
      if (key === 'acp.cachedInitializeResult') {
        return {};
      }
      if (key === 'team.capabilityOverrides') {
        return {
          custom: {
            currentlySupported: true,
            workerRecommended: true,
            leaderRecommended: false,
            recommendedTeamMode: 'managed_mailbox',
          },
        };
      }
      return undefined;
    });

    const repo = makeRepo();
    const conversationService = makeConversationService({
      createConversation: vi.fn().mockResolvedValue({ id: 'conv-hermes', extra: {} }),
    });
    const service = new TeamSessionService(repo, makeWorkerTaskManager() as any, conversationService);

    await expect(
      service.createTeam({
        userId: 'user-1',
        name: 'Leader Fallback Team',
        workspace: '/workspace',
        workspaceMode: 'shared',
        agents: [makeAgent({ agentType: 'custom', agentName: 'Custom Lead', conversationType: 'acp' })],
      })
    ).rejects.toThrow('cannot act as a team leader');
  });

  it('allows adding a custom teammate when capability override marks it worker-capable', async () => {
    mockConfigGet.mockImplementation(async (key: string) => {
      if (key === 'team.capabilityOverrides') {
        return {
          custom: {
            currentlySupported: true,
            workerRecommended: true,
            leaderRecommended: false,
            recommendedTeamMode: 'managed_mailbox',
          },
        };
      }
      return undefined;
    });

    const team: TTeam = {
      id: 'team-custom',
      userId: 'user-1',
      name: 'Custom Worker Team',
      workspace: '/workspace',
      workspaceMode: 'shared',
      leaderAgentId: 'slot-lead',
      agents: [
        {
          slotId: 'slot-lead',
          conversationId: 'conv-lead',
          role: 'leader',
          agentType: 'hermes',
          agentName: 'Lead Hermes',
          conversationType: 'lokcli',
          status: 'idle',
        },
      ],
      createdAt: 1,
      updatedAt: 1,
    };
    const repo = makeRepo({
      findById: vi.fn().mockResolvedValue(team),
      update: vi.fn().mockImplementation(async (_id, updates) => ({ ...team, ...updates })),
    });
    const conversationService = makeConversationService({
      createConversation: vi.fn().mockResolvedValue({ id: 'conv-custom', extra: {} }),
      getConversation: vi.fn().mockResolvedValue({
        id: 'conv-lead',
        extra: { backend: 'hermes', sessionMode: 'yolo' },
      }),
    });
    const service = new TeamSessionService(repo, makeWorkerTaskManager() as any, conversationService);

    const added = await service.addAgent('team-custom', {
      conversationId: '',
      role: 'teammate',
      agentType: 'custom',
      agentName: 'Custom Worker',
      conversationType: 'acp',
      status: 'pending',
    });

    expect(added).toEqual(expect.objectContaining({ agentType: 'custom' }));
    expect(conversationService.createConversation).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'acp',
        extra: expect.objectContaining({ backend: 'custom', sessionMode: 'yolo' }),
      })
    );
  });

  it('returns persisted execution info before a session is started', async () => {
    const team: TTeam = {
      id: 'team-info',
      userId: 'user-1',
      name: 'Info Team',
      workspace: '/workspace',
      workspaceMode: 'shared',
      leaderAgentId: 'slot-lead',
      agents: [],
      executionEngine: 'legacy_mailbox',
      orchestrationMode: 'legacy_mailbox',
      createdAt: 1,
      updatedAt: 1,
    };
    const repo = makeRepo({
      findById: vi.fn().mockResolvedValue(team),
    });
    const service = new TeamSessionService(
      repo,
      makeWorkerTaskManager() as any,
      makeConversationService({
        listAllConversations: vi.fn().mockResolvedValue([]),
      })
    );

    await expect(service.getExecutionInfo('team-info')).resolves.toEqual({
      teamId: 'team-info',
      executionKind: 'legacy_mailbox',
      orchestrationMode: 'legacy_mailbox',
      state: 'created',
      context: {
        runtimeVersion: 'phase2',
        leaderBackend: undefined,
        memberCount: 0,
        compatibilityMode: 'legacy_mailbox',
      },
      diagnostics: {
        summary: [
          'selected_engine:legacy_mailbox',
          'persisted_orchestration_mode:legacy_mailbox',
          'recovery_source:fresh',
          'recovery_snapshot_available:false',
          'recovery_replay_ready:false',
          'recovery_resume_ready:false',
          'recovery_preferred_mode:mailbox_replay',
          'recovery_last_known_state:created',
          'recovery_plan:not_available',
        ],
        fallbackReason: undefined,
      },
      recovery: {
        source: 'fresh',
        snapshotAvailable: false,
        replayReady: false,
        resumeReady: false,
        preferredMode: 'mailbox_replay',
        snapshotCapturedAt: undefined,
        lastEventAt: undefined,
        lastKnownState: 'created',
        notes: ['No persisted runtime snapshot is available yet.'],
      },
      recoveryPlan: {
        status: 'not_available',
        mode: 'mailbox_replay',
        steps: [
          {
            id: 'inspect-diagnostics',
            title: 'Inspect runtime diagnostics',
            action: 'inspect_diagnostics',
            status: 'blocked',
            detail: 'No persisted runtime snapshot is available for replay or resume.',
          },
        ],
        blockers: ['missing_runtime_snapshot'],
        summary: ['recovery_plan:not_available'],
      },
    });
  });

  it('returns running execution info after a session is started', async () => {
    const team: TTeam = {
      id: 'team-running',
      userId: 'user-1',
      name: 'Running Team',
      workspace: '/workspace',
      workspaceMode: 'shared',
      leaderAgentId: 'slot-lead',
      agents: [
        {
          slotId: 'slot-lead',
          conversationId: 'conv-lead',
          role: 'leader',
          agentType: 'hermes',
          agentName: 'Leader',
          conversationType: 'lokcli',
          status: 'idle',
        },
      ],
      executionEngine: 'legacy_mailbox',
      orchestrationMode: 'legacy_mailbox',
      createdAt: 1,
      updatedAt: 1,
    };
    const repo = makeRepo({
      findById: vi.fn().mockResolvedValue(team),
      update: vi.fn().mockImplementation(async (_id, updates) => ({ ...team, ...updates })),
    });
    const conversationService = makeConversationService({
      updateConversation: vi.fn().mockResolvedValue(undefined),
    });
    const workerTaskManager = {
      getOrBuildTask: vi.fn().mockResolvedValue({}),
      kill: vi.fn(),
    };
    const service = new TeamSessionService(repo, workerTaskManager as any, conversationService);

    const session = await service.getOrStartSession('team-running');
    expect(session.getExecutionInfo().state).toBe('running');
    await expect(service.getExecutionInfo('team-running')).resolves.toEqual({
      teamId: 'team-running',
      executionKind: 'legacy_mailbox',
      orchestrationMode: 'legacy_mailbox',
      state: 'running',
      context: {
        runtimeVersion: 'phase2',
        leaderBackend: 'hermes',
        memberCount: 1,
        engineReadiness: 'ready',
        routingMode: 'off',
        requestedExecutionKind: 'hermes_native',
        compatibilityMode: 'legacy_mailbox',
      },
      diagnostics: {
        summary: [
          'selected_engine:legacy_mailbox',
          'routing_mode:off',
          'engine_readiness:ready',
          'leader_backend:hermes',
          'requested_engine:hermes_native',
          'fallback_reason:feature_flag_off',
          'recovery_source:live_session',
          'recovery_snapshot_available:true',
          'recovery_replay_ready:true',
          'recovery_resume_ready:false',
          'recovery_preferred_mode:mailbox_replay',
          'recovery_last_known_state:running',
          'recovery_plan:mailbox_replay',
          'recovery_plan_status:ready_for_replay',
        ],
        fallbackReason: 'feature_flag_off',
      },
      recovery: expect.objectContaining({
        source: 'live_session',
        snapshotAvailable: true,
        replayReady: true,
        resumeReady: false,
        preferredMode: 'mailbox_replay',
        lastKnownState: 'running',
      }),
      recoveryPlan: {
        status: 'ready_for_replay',
        mode: 'mailbox_replay',
        steps: [
          {
            id: 'rebuild-mailbox-runtime',
            title: 'Rebuild mailbox runtime shell',
            action: 'rebuild_mailbox_runtime',
            status: 'ready',
            detail: undefined,
          },
          {
            id: 'replay-mailbox-messages',
            title: 'Replay mailbox coordination context',
            action: 'replay_mailbox_messages',
            status: 'ready',
            detail: 'Use persisted diagnostics timeline and mailbox-derived checkpoints to rebuild coordination state.',
          },
        ],
        blockers: [],
        summary: ['recovery_plan:mailbox_replay', 'recovery_plan_status:ready_for_replay'],
      },
    });
  });

  it('routes codex-led teams into protocol execution mode', async () => {
    const team: TTeam = {
      id: 'team-protocol',
      userId: 'user-1',
      name: 'Protocol Team',
      workspace: '/workspace',
      workspaceMode: 'shared',
      leaderAgentId: 'slot-lead',
      agents: [
        {
          slotId: 'slot-lead',
          conversationId: 'conv-lead',
          role: 'leader',
          agentType: 'codex',
          agentName: 'Leader',
          conversationType: 'acp',
          status: 'idle',
        },
        {
          slotId: 'slot-worker',
          conversationId: 'conv-worker',
          role: 'teammate',
          agentType: 'qwen',
          agentName: 'Worker',
          conversationType: 'acp',
          status: 'idle',
        },
      ],
      createdAt: 1,
      updatedAt: 1,
    };
    const repo = makeRepo({
      findById: vi.fn().mockResolvedValue(team),
      update: vi.fn().mockImplementation(async (_id, updates) => ({ ...team, ...updates })),
    });
    const conversationService = makeConversationService({
      updateConversation: vi.fn().mockResolvedValue(undefined),
    });
    const workerTaskManager = {
      getOrBuildTask: vi.fn().mockResolvedValue({}),
      kill: vi.fn(),
    };
    const service = new TeamSessionService(repo, workerTaskManager as any, conversationService);

    const session = await service.getOrStartSession('team-protocol');
    expect(session.getExecutionInfo()).toEqual(
      expect.objectContaining({
        executionKind: 'protocol',
        orchestrationMode: 'protocol_coordinated',
        state: 'running',
      })
    );

    const executionInfo = await service.getExecutionInfo('team-protocol');
    expect(executionInfo).toEqual(
      expect.objectContaining({
        executionKind: 'protocol',
        orchestrationMode: 'protocol_coordinated',
        diagnostics: expect.objectContaining({
          summary: expect.arrayContaining(['selected_engine:protocol']),
        }),
      })
    );
  });

  it('persists legacy execution metadata when hermes native routing feature flag is off', async () => {
    mockConfigGet.mockImplementation(async (key: string) => {
      if (key === 'acp.cachedInitializeResult') {
        return null;
      }
      if (key === 'team.runtime.hermesNativeRouting') {
        return 'off';
      }
      return undefined;
    });

    const team: TTeam = {
      id: 'team-routing-off',
      userId: 'user-1',
      name: 'Routing Off Team',
      workspace: '/workspace',
      workspaceMode: 'shared',
      leaderAgentId: 'slot-lead',
      agents: [
        {
          slotId: 'slot-lead',
          conversationId: 'conv-lead',
          role: 'leader',
          agentType: 'hermes',
          agentName: 'Leader',
          conversationType: 'lokcli',
          status: 'idle',
        },
      ],
      createdAt: 1,
      updatedAt: 1,
    };
    const repo = makeRepo({
      findById: vi.fn().mockResolvedValue(team),
      update: vi.fn().mockResolvedValue(undefined),
    });
    const conversationService = makeConversationService({
      updateConversation: vi.fn().mockResolvedValue(undefined),
    });
    const workerTaskManager = {
      getOrBuildTask: vi.fn().mockResolvedValue({}),
      kill: vi.fn(),
    };
    const service = new TeamSessionService(repo, workerTaskManager as any, conversationService);

    await service.getOrStartSession('team-routing-off');

    expect(repo.update).toHaveBeenCalledWith(
      'team-routing-off',
      expect.objectContaining({
        executionEngine: 'legacy_mailbox',
        orchestrationMode: 'legacy_mailbox',
        updatedAt: expect.any(Number),
      })
    );
    await expect(service.getExecutionInfo('team-routing-off')).resolves.toEqual({
      teamId: 'team-routing-off',
      executionKind: 'legacy_mailbox',
      orchestrationMode: 'legacy_mailbox',
      state: 'running',
      context: {
        runtimeVersion: 'phase2',
        leaderBackend: 'hermes',
        memberCount: 1,
        engineReadiness: 'ready',
        routingMode: 'off',
        requestedExecutionKind: 'hermes_native',
        compatibilityMode: 'legacy_mailbox',
      },
      diagnostics: {
        summary: [
          'selected_engine:legacy_mailbox',
          'routing_mode:off',
          'engine_readiness:ready',
          'leader_backend:hermes',
          'requested_engine:hermes_native',
          'fallback_reason:feature_flag_off',
          'recovery_source:live_session',
          'recovery_snapshot_available:true',
          'recovery_replay_ready:true',
          'recovery_resume_ready:false',
          'recovery_preferred_mode:mailbox_replay',
          'recovery_last_known_state:running',
          'recovery_plan:mailbox_replay',
          'recovery_plan_status:ready_for_replay',
        ],
        fallbackReason: 'feature_flag_off',
      },
      recovery: expect.objectContaining({
        source: 'live_session',
        snapshotAvailable: true,
        replayReady: true,
        resumeReady: false,
        preferredMode: 'mailbox_replay',
        lastKnownState: 'running',
      }),
      recoveryPlan: {
        status: 'ready_for_replay',
        mode: 'mailbox_replay',
        steps: [
          {
            id: 'rebuild-mailbox-runtime',
            title: 'Rebuild mailbox runtime shell',
            action: 'rebuild_mailbox_runtime',
            status: 'ready',
            detail: undefined,
          },
          {
            id: 'replay-mailbox-messages',
            title: 'Replay mailbox coordination context',
            action: 'replay_mailbox_messages',
            status: 'ready',
            detail: 'Use persisted diagnostics timeline and mailbox-derived checkpoints to rebuild coordination state.',
          },
        ],
        blockers: [],
        summary: ['recovery_plan:mailbox_replay', 'recovery_plan_status:ready_for_replay'],
      },
    });
  });

  it('persists hermes native metadata when enabled routing selects compatibility-backed native engine', async () => {
    mockConfigGet.mockImplementation(async (key: string) => {
      if (key === 'acp.cachedInitializeResult') {
        return {
          hermes: {
            protocolVersion: 1,
            capabilities: {
              loadSession: false,
              promptCapabilities: { image: false, audio: false, embeddedContext: false },
              mcpCapabilities: { stdio: true, http: false, sse: false },
              sessionCapabilities: { fork: null, resume: null, list: null, close: null },
              _meta: {
                team: {
                  executionKind: 'native',
                },
              },
            },
            agentInfo: null,
            authMethods: [],
          },
        };
      }
      if (key === 'team.runtime.hermesNativeRouting') {
        return 'enabled';
      }
      return undefined;
    });

    const team: TTeam = {
      id: 'team-routing-native',
      userId: 'user-1',
      name: 'Routing Native Team',
      workspace: '/workspace',
      workspaceMode: 'shared',
      leaderAgentId: 'slot-lead',
      agents: [
        {
          slotId: 'slot-lead',
          conversationId: 'conv-lead',
          role: 'leader',
          agentType: 'hermes',
          agentName: 'Leader',
          conversationType: 'lokcli',
          status: 'idle',
        },
      ],
      createdAt: 1,
      updatedAt: 1,
    };
    const repo = makeRepo({
      findById: vi.fn().mockResolvedValue(team),
      update: vi.fn().mockResolvedValue(undefined),
    });
    const conversationService = makeConversationService({
      updateConversation: vi.fn().mockResolvedValue(undefined),
    });
    const workerTaskManager = {
      getOrBuildTask: vi.fn().mockResolvedValue({}),
      kill: vi.fn(),
    };
    const service = new TeamSessionService(repo, workerTaskManager as any, conversationService);
    (service as any).hermesNativeEngine.readiness = 'ready';

    await service.getOrStartSession('team-routing-native');

    expect(repo.update).toHaveBeenCalledWith(
      'team-routing-native',
      expect.objectContaining({
        executionEngine: 'hermes_native',
        orchestrationMode: 'native_orchestrator',
        updatedAt: expect.any(Number),
      })
    );
    await expect(service.getExecutionInfo('team-routing-native')).resolves.toEqual({
      teamId: 'team-routing-native',
      executionKind: 'hermes_native',
      orchestrationMode: 'native_orchestrator',
      state: 'running',
      context: {
        compatibilityMode: 'native_compatibility_bridge',
        runtimeVersion: 'phase2',
        leaderBackend: 'hermes',
        memberCount: 1,
        engineReadiness: 'ready',
        routingMode: 'enabled',
        requestedExecutionKind: 'hermes_native',
      },
      diagnostics: {
        summary: [
          'selected_engine:hermes_native',
          'routing_mode:enabled',
          'engine_readiness:ready',
          'leader_backend:hermes',
          'requested_engine:hermes_native',
          'recovery_source:live_session',
          'recovery_snapshot_available:true',
          'recovery_replay_ready:true',
          'recovery_resume_ready:false',
          'recovery_preferred_mode:native_replay',
          'recovery_last_known_state:running',
          'recovery_plan:native_replay',
          'recovery_plan_status:ready_for_replay',
        ],
        fallbackReason: undefined,
      },
      recovery: expect.objectContaining({
        source: 'live_session',
        snapshotAvailable: true,
        replayReady: true,
        resumeReady: false,
        preferredMode: 'native_replay',
        lastKnownState: 'running',
      }),
      recoveryPlan: {
        status: 'ready_for_replay',
        mode: 'native_replay',
        steps: [
          {
            id: 'rebuild-native-runtime',
            title: 'Rebuild native runtime shell',
            action: 'rebuild_native_runtime',
            status: 'ready',
            detail: undefined,
          },
          {
            id: 'replay-native-context',
            title: 'Replay native orchestration context',
            action: 'replay_native_context',
            status: 'ready',
            detail: 'Rehydrate the compatibility-backed native execution context before enabling true native resume.',
          },
        ],
        blockers: ['native_resume_not_enabled'],
        summary: ['recovery_plan:native_replay', 'recovery_plan_status:ready_for_replay'],
      },
    });
  });

  it('builds runtime diagnostics with waiting tasks, degraded members, and timeline summary', async () => {
    mockConfigGet.mockImplementation(async (key: string) => {
      if (key === 'acp.cachedInitializeResult') {
        return null;
      }
      if (key === 'team.runtime.hermesNativeRouting') {
        return 'off';
      }
      return undefined;
    });

    const team: TTeam = {
      id: 'team-diagnostics',
      userId: 'user-1',
      name: 'Diagnostics Team',
      workspace: '/workspace',
      workspaceMode: 'shared',
      leaderAgentId: 'slot-lead',
      agents: [
        {
          slotId: 'slot-lead',
          conversationId: 'conv-lead',
          role: 'leader',
          agentType: 'hermes',
          agentName: 'Leader',
          conversationType: 'lokcli',
          status: 'idle',
        },
        {
          slotId: 'slot-worker',
          conversationId: 'conv-worker',
          role: 'teammate',
          agentType: 'codex',
          agentName: 'Worker',
          conversationType: 'acp',
          status: 'idle',
        },
      ],
      createdAt: 1,
      updatedAt: 1,
    };
    const repo = makeRepo({
      findById: vi.fn().mockResolvedValue(team),
      findTasksByTeam: vi.fn().mockResolvedValue([
        {
          id: 'task-waiting',
          teamId: 'team-diagnostics',
          subject: 'Blocked task',
          status: 'pending',
          owner: 'slot-worker',
          blockedBy: ['task-upstream'],
          blocks: [],
          metadata: {},
          createdAt: 1,
          updatedAt: 2,
        },
        {
          id: 'task-running',
          teamId: 'team-diagnostics',
          subject: 'Running task',
          status: 'in_progress',
          owner: 'slot-lead',
          blockedBy: [],
          blocks: [],
          metadata: {},
          createdAt: 1,
          updatedAt: 2,
        },
      ]),
      update: vi.fn().mockResolvedValue(undefined),
    });
    const conversationService = makeConversationService({
      updateConversation: vi.fn().mockResolvedValue(undefined),
    });
    const workerTaskManager = {
      getOrBuildTask: vi.fn().mockResolvedValue({}),
      kill: vi.fn(),
    };
    const service = new TeamSessionService(repo, workerTaskManager as any, conversationService);

    await service.getOrStartSession('team-diagnostics');
    const diagnostics = await service.getRuntimeDiagnostics('team-diagnostics');

    expect(diagnostics.executionInfo.executionKind).toBe('legacy_mailbox');
    expect(diagnostics.degradedMembers).toEqual([
      {
        slotId: 'slot-worker',
        agentName: 'Worker',
        reason: 'feature_flag_off',
      },
    ]);
    expect(diagnostics.taskDiagnostics).toEqual({
      pending: 1,
      inProgress: 1,
      completed: 0,
      waiting: [
        {
          taskId: 'task-waiting',
          subject: 'Blocked task',
          blockedBy: ['task-upstream'],
          owner: 'slot-worker',
        },
      ],
    });
    expect(diagnostics.protocolDiagnostics).toEqual(
      expect.objectContaining({
        activeOwners: [
          {
            ownerId: 'slot-worker',
            taskCount: 1,
            taskIds: ['task-waiting'],
          },
          {
            ownerId: 'slot-lead',
            taskCount: 1,
            taskIds: ['task-running'],
          },
        ],
        ownership: expect.arrayContaining([
          expect.objectContaining({
            taskId: 'task-waiting',
            owner: 'slot-worker',
            ownershipStatus: 'assigned',
          }),
          expect.objectContaining({
            taskId: 'task-running',
            owner: 'slot-lead',
            ownershipStatus: 'assigned',
          }),
        ]),
      })
    );
    expect(diagnostics.timeline.some((event) => event.type === 'routing_selected')).toBe(true);
    expect(diagnostics.timeline.some((event) => event.type === 'session_started')).toBe(true);
    expect(diagnostics.summary).toEqual([
      'execution_kind:legacy_mailbox',
      'orchestration_mode:legacy_mailbox',
      'execution_state:running',
      'degraded_members:1',
      'pending_tasks:1',
      'waiting_tasks:1',
      'fallback_reason:feature_flag_off',
      'recovery_source:live_session',
      'recovery_preferred_mode:mailbox_replay',
      'recovery_replay_ready:true',
      'recovery_resume_ready:false',
      'recovery_plan_status:ready_for_replay',
      'recovery_plan_mode:mailbox_replay',
    ]);
    expect(diagnostics.executionInfo.recoveryPlan).toEqual(
      expect.objectContaining({
        status: 'ready_for_replay',
        mode: 'mailbox_replay',
      })
    );
  });

  it('restores execution info from persisted runtime snapshot when no live session exists', async () => {
    const team: TTeam = {
      id: 'team-recovered',
      userId: 'user-1',
      name: 'Recovered Team',
      workspace: '/workspace',
      workspaceMode: 'shared',
      leaderAgentId: 'slot-lead',
      agents: [
        {
          slotId: 'slot-lead',
          conversationId: 'conv-lead',
          role: 'leader',
          agentType: 'hermes',
          agentName: 'Leader',
          conversationType: 'lokcli',
          status: 'idle',
        },
      ],
      executionEngine: 'legacy_mailbox',
      orchestrationMode: 'legacy_mailbox',
      createdAt: 1,
      updatedAt: 1,
    };
    const repo = makeRepo({
      findById: vi.fn().mockResolvedValue(team),
      findTasksByTeam: vi.fn().mockResolvedValue([]),
    });
    const eventStore = new TeamEventStore();
    const snapshotStore = new TeamRuntimeSnapshotStore();
    const diagnosticsService = new TeamDiagnosticsService({
      repo,
      eventStore,
      snapshotStore,
    });
    const snapshot: TeamRuntimeSnapshot = {
      teamId: 'team-recovered',
      capturedAt: 200,
      executionInfo: {
        teamId: 'team-recovered',
        executionKind: 'legacy_mailbox',
        orchestrationMode: 'legacy_mailbox',
        state: 'running',
        diagnostics: {
          summary: ['selected_engine:legacy_mailbox'],
          fallbackReason: 'feature_flag_off',
        },
      },
      degradedMembers: [],
      taskDiagnostics: {
        pending: 0,
        inProgress: 0,
        completed: 0,
        waiting: [],
      },
      timeline: [
        {
          id: 'evt-1',
          teamId: 'team-recovered',
          at: 180,
          type: 'session_started',
          level: 'info',
          message: 'Execution session started in legacy_mailbox',
        },
      ],
    };
    await snapshotStore.set(snapshot);
    const service = new TeamSessionService(
      repo,
      makeWorkerTaskManager() as any,
      makeConversationService({
        listAllConversations: vi.fn().mockResolvedValue([]),
      }),
      {
        diagnosticsService,
      }
    );

    await expect(service.getExecutionInfo('team-recovered')).resolves.toEqual({
      teamId: 'team-recovered',
      executionKind: 'legacy_mailbox',
      orchestrationMode: 'legacy_mailbox',
      state: 'stopped',
      diagnostics: {
        summary: [
          'selected_engine:legacy_mailbox',
          'recovery_source:persisted_snapshot',
          'recovery_snapshot_available:true',
          'recovery_replay_ready:true',
          'recovery_resume_ready:false',
          'recovery_preferred_mode:mailbox_replay',
          'recovery_last_known_state:running',
          'recovery_plan:mailbox_replay',
          'recovery_plan_status:ready_for_replay',
        ],
        fallbackReason: 'feature_flag_off',
      },
      recovery: {
        source: 'persisted_snapshot',
        snapshotAvailable: true,
        replayReady: true,
        resumeReady: false,
        preferredMode: 'mailbox_replay',
        snapshotCapturedAt: 200,
        lastEventAt: 180,
        lastKnownState: 'running',
        notes: [
          'Recovered diagnostics view from persisted mailbox snapshot.',
          'Replay should rebuild the legacy mailbox shell.',
        ],
      },
      recoveryPlan: {
        status: 'ready_for_replay',
        mode: 'mailbox_replay',
        steps: [
          {
            id: 'rebuild-mailbox-runtime',
            title: 'Rebuild mailbox runtime shell',
            action: 'rebuild_mailbox_runtime',
            status: 'ready',
            detail: undefined,
          },
          {
            id: 'replay-mailbox-messages',
            title: 'Replay mailbox coordination context',
            action: 'replay_mailbox_messages',
            status: 'ready',
            detail: 'Use persisted diagnostics timeline and mailbox-derived checkpoints to rebuild coordination state.',
          },
        ],
        blockers: [],
        summary: ['recovery_plan:mailbox_replay', 'recovery_plan_status:ready_for_replay'],
      },
    });
  });

  it('returns recovered diagnostics view and records snapshot recovery warm-up', async () => {
    const team: TTeam = {
      id: 'team-recovery-diagnostics',
      userId: 'user-1',
      name: 'Recovered Diagnostics Team',
      workspace: '/workspace',
      workspaceMode: 'shared',
      leaderAgentId: 'slot-lead',
      agents: [
        {
          slotId: 'slot-lead',
          conversationId: 'conv-lead',
          role: 'leader',
          agentType: 'hermes',
          agentName: 'Leader',
          conversationType: 'lokcli',
          status: 'idle',
        },
      ],
      executionEngine: 'legacy_mailbox',
      orchestrationMode: 'legacy_mailbox',
      createdAt: 1,
      updatedAt: 1,
    };
    const repo = makeRepo({
      findById: vi.fn().mockResolvedValue(team),
      findTasksByTeam: vi.fn().mockResolvedValue([]),
    });
    const eventStore = new TeamEventStore();
    const snapshotStore = new TeamRuntimeSnapshotStore();
    const diagnosticsService = new TeamDiagnosticsService({
      repo,
      eventStore,
      snapshotStore,
    });
    await snapshotStore.set({
      teamId: 'team-recovery-diagnostics',
      capturedAt: 300,
      executionInfo: {
        teamId: 'team-recovery-diagnostics',
        executionKind: 'legacy_mailbox',
        orchestrationMode: 'legacy_mailbox',
        state: 'running',
      },
      degradedMembers: [],
      taskDiagnostics: {
        pending: 0,
        inProgress: 0,
        completed: 0,
        waiting: [],
      },
      timeline: [],
    });
    const service = new TeamSessionService(
      repo,
      makeWorkerTaskManager() as any,
      makeConversationService({
        listAllConversations: vi.fn().mockResolvedValue([]),
      }),
      {
        diagnosticsService,
      }
    );

    const warmed = await service.warmDiagnosticsRecovery('team-recovery-diagnostics');
    expect(warmed).not.toBeNull();
    expect(warmed).toEqual(
      expect.objectContaining({
        recoveryStatus: 'recovered_snapshot',
        recoveredFromSnapshotAt: 300,
      })
    );

    const diagnostics = await service.getRuntimeDiagnostics('team-recovery-diagnostics');
    expect(diagnostics).toEqual(
      expect.objectContaining({
        recoveryStatus: 'recovered_snapshot',
      })
    );

    const events = await eventStore.list('team-recovery-diagnostics');
    expect(events.some((event) => event.type === 'snapshot_recovered')).toBe(true);
  });

  it('prepares and executes legacy mailbox recovery from persisted snapshot', async () => {
    mockConfigGet.mockImplementation(async (key: string) => {
      if (key === 'acp.cachedInitializeResult') {
        return null;
      }
      if (key === 'team.runtime.hermesNativeRouting') {
        return 'off';
      }
      return undefined;
    });

    const team: TTeam = {
      id: 'team-recovery-execute-legacy',
      userId: 'user-1',
      name: 'Recovery Execute Legacy',
      workspace: '/workspace',
      workspaceMode: 'shared',
      leaderAgentId: 'slot-lead',
      agents: [
        {
          slotId: 'slot-lead',
          conversationId: 'conv-lead',
          role: 'leader',
          agentType: 'hermes',
          agentName: 'Leader',
          conversationType: 'lokcli',
          status: 'idle',
        },
      ],
      executionEngine: 'legacy_mailbox',
      orchestrationMode: 'legacy_mailbox',
      createdAt: 1,
      updatedAt: 1,
    };
    const repo = makeRepo({
      findById: vi.fn().mockResolvedValue(team),
      findTasksByTeam: vi.fn().mockResolvedValue([
        {
          id: 'task-waiting',
          teamId: team.id,
          subject: 'Blocked task',
          status: 'pending',
          owner: 'slot-lead',
          blockedBy: ['task-upstream'],
          blocks: [],
          metadata: {},
          createdAt: 1,
          updatedAt: 2,
        },
      ]),
      update: vi.fn().mockResolvedValue(undefined),
      writeMessage: vi.fn(async (message) => message),
    });
    const eventStore = new TeamEventStore();
    const snapshotStore = new TeamRuntimeSnapshotStore();
    const diagnosticsService = new TeamDiagnosticsService({
      repo,
      eventStore,
      snapshotStore,
    });
    await snapshotStore.set({
      teamId: team.id,
      capturedAt: 200,
      executionInfo: {
        teamId: team.id,
        executionKind: 'legacy_mailbox',
        orchestrationMode: 'legacy_mailbox',
        state: 'running',
      },
      degradedMembers: [],
      taskDiagnostics: {
        pending: 1,
        inProgress: 0,
        completed: 0,
        waiting: [
          {
            taskId: 'task-waiting',
            subject: 'Blocked task',
            blockedBy: ['task-upstream'],
            owner: 'slot-lead',
          },
        ],
      },
      timeline: [],
    });
    const conversationService = makeConversationService({
      updateConversation: vi.fn().mockResolvedValue(undefined),
      listAllConversations: vi.fn().mockResolvedValue([]),
    });
    const workerTaskManager = {
      getOrBuildTask: vi.fn().mockResolvedValue({}),
      kill: vi.fn(),
    };
    const service = new TeamSessionService(repo, workerTaskManager as any, conversationService, {
      diagnosticsService,
    });

    const preparation = await service.prepareRecoverySession(team.id);
    expect(preparation.recoveryPlan).toEqual(
      expect.objectContaining({
        status: 'ready_for_replay',
        mode: 'mailbox_replay',
      })
    );
    expect(preparation.diagnostics).toEqual(
      expect.objectContaining({
        recoveryStatus: 'recovered_snapshot',
      })
    );

    const result = await service.executeRecoveryPlan(team.id);
    expect(result.status).toBe('executed');
    expect(result.actionsApplied).toEqual(['rebuild_mailbox_runtime', 'replay_mailbox_messages']);
    expect(result.replayMessage).toContain('Recovered team "Recovery Execute Legacy" using legacy mailbox replay.');
    expect(result.executionInfo).toEqual(
      expect.objectContaining({
        executionKind: 'legacy_mailbox',
        orchestrationMode: 'legacy_mailbox',
        state: 'running',
        recovery: expect.objectContaining({
          source: 'live_session',
          preferredMode: 'mailbox_replay',
        }),
      })
    );
    expect(result.diagnostics).toEqual(
      expect.objectContaining({
        executionInfo: expect.objectContaining({
          state: 'running',
        }),
      })
    );

    const events = await eventStore.list(team.id);
    expect(events.some((event) => event.type === 'recovery_plan_prepared')).toBe(true);
    expect(events.some((event) => event.type === 'recovery_plan_executed')).toBe(true);
    expect(repo.writeMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        teamId: team.id,
        toAgentId: 'slot-lead',
        fromAgentId: 'user',
        content: expect.stringContaining('Recovered team "Recovery Execute Legacy" using legacy mailbox replay.'),
      })
    );
  });

  it('returns already_running when executing recovery against an active session', async () => {
    mockConfigGet.mockImplementation(async (key: string) => {
      if (key === 'acp.cachedInitializeResult') {
        return null;
      }
      if (key === 'team.runtime.hermesNativeRouting') {
        return 'off';
      }
      return undefined;
    });

    const team: TTeam = {
      id: 'team-recovery-running',
      userId: 'user-1',
      name: 'Recovery Running Team',
      workspace: '/workspace',
      workspaceMode: 'shared',
      leaderAgentId: 'slot-lead',
      agents: [
        {
          slotId: 'slot-lead',
          conversationId: 'conv-lead',
          role: 'leader',
          agentType: 'hermes',
          agentName: 'Leader',
          conversationType: 'lokcli',
          status: 'idle',
        },
      ],
      createdAt: 1,
      updatedAt: 1,
    };
    const repo = makeRepo({
      findById: vi.fn().mockResolvedValue(team),
      findTasksByTeam: vi.fn().mockResolvedValue([]),
      update: vi.fn().mockResolvedValue(undefined),
      writeMessage: vi.fn(async (message) => message),
      readUnread: vi.fn().mockResolvedValue([]),
      readUnreadAndMark: vi.fn().mockResolvedValue([]),
    });
    const conversationService = makeConversationService({
      updateConversation: vi.fn().mockResolvedValue(undefined),
    });
    const workerTaskManager = {
      getOrBuildTask: vi.fn().mockResolvedValue({}),
      kill: vi.fn(),
    };
    const service = new TeamSessionService(repo, workerTaskManager as any, conversationService);

    await service.getOrStartSession(team.id);
    const result = await service.executeRecoveryPlan(team.id);

    expect(result.status).toBe('already_running');
    expect(result.actionsApplied).toEqual([]);
    expect(result.executionInfo.state).toBe('running');
    expect(repo.writeMessage).not.toHaveBeenCalled();
  });

  it('returns not_available when no persisted recovery snapshot exists', async () => {
    const team: TTeam = {
      id: 'team-recovery-none',
      userId: 'user-1',
      name: 'Recovery None Team',
      workspace: '/workspace',
      workspaceMode: 'shared',
      leaderAgentId: 'slot-lead',
      agents: [
        {
          slotId: 'slot-lead',
          conversationId: 'conv-lead',
          role: 'leader',
          agentType: 'hermes',
          agentName: 'Leader',
          conversationType: 'lokcli',
          status: 'idle',
        },
      ],
      executionEngine: 'legacy_mailbox',
      orchestrationMode: 'legacy_mailbox',
      createdAt: 1,
      updatedAt: 1,
    };
    const repo = makeRepo({
      findById: vi.fn().mockResolvedValue(team),
      findTasksByTeam: vi.fn().mockResolvedValue([]),
    });
    const eventStore = new TeamEventStore();
    const snapshotStore = new TeamRuntimeSnapshotStore();
    const diagnosticsService = new TeamDiagnosticsService({
      repo,
      eventStore,
      snapshotStore,
    });
    const service = new TeamSessionService(
      repo,
      makeWorkerTaskManager() as any,
      makeConversationService({
        listAllConversations: vi.fn().mockResolvedValue([]),
      }),
      {
        diagnosticsService,
      }
    );

    const preparation = await service.prepareRecoverySession(team.id);
    expect(preparation.recoveryPlan).toEqual({
      status: 'not_available',
      mode: 'mailbox_replay',
      steps: [
        {
          id: 'inspect-diagnostics',
          title: 'Inspect runtime diagnostics',
          action: 'inspect_diagnostics',
          status: 'blocked',
          detail: 'No persisted runtime snapshot is available for replay or resume.',
        },
      ],
      blockers: ['missing_runtime_snapshot'],
      summary: ['recovery_plan:not_available'],
    });

    const result = await service.executeRecoveryPlan(team.id);
    expect(result.status).toBe('not_available');
    expect(result.actionsApplied).toEqual([]);
    expect(result.recoveryPlan.status).toBe('not_available');

    const events = await eventStore.list(team.id);
    expect(events.some((event) => event.type === 'recovery_plan_prepared')).toBe(true);
    expect(events.some((event) => event.type === 'recovery_plan_executed')).toBe(true);
  });

  it('executes native replay shell recovery for hermes native snapshots', async () => {
    mockConfigGet.mockImplementation(async (key: string) => {
      if (key === 'acp.cachedInitializeResult') {
        return {
          hermes: {
            protocolVersion: 1,
            capabilities: {
              loadSession: false,
              promptCapabilities: { image: false, audio: false, embeddedContext: false },
              mcpCapabilities: { stdio: true, http: false, sse: false },
              sessionCapabilities: { fork: null, resume: null, list: null, close: null },
              _meta: {
                team: {
                  executionKind: 'native',
                },
              },
            },
            agentInfo: null,
            authMethods: [],
          },
        };
      }
      if (key === 'team.runtime.hermesNativeRouting') {
        return 'enabled';
      }
      return undefined;
    });

    const team: TTeam = {
      id: 'team-recovery-native',
      userId: 'user-1',
      name: 'Recovery Native Team',
      workspace: '/workspace',
      workspaceMode: 'shared',
      leaderAgentId: 'slot-lead',
      agents: [
        {
          slotId: 'slot-lead',
          conversationId: 'conv-lead',
          role: 'leader',
          agentType: 'hermes',
          agentName: 'Leader',
          conversationType: 'lokcli',
          status: 'idle',
        },
      ],
      executionEngine: 'hermes_native',
      orchestrationMode: 'native_orchestrator',
      createdAt: 1,
      updatedAt: 1,
    };
    const repo = makeRepo({
      findById: vi.fn().mockResolvedValue(team),
      findTasksByTeam: vi.fn().mockResolvedValue([
        {
          id: 'task-1',
          teamId: team.id,
          owner: 'slot-worker',
          subject: 'Recover gateway task',
          description: 'Replay the gateway worker task context',
          status: 'pending',
          blockedBy: [],
          dependsOn: [],
          completionSummary: undefined,
          metadata: {},
          createdAt: 1,
          updatedAt: 1,
        },
      ]),
      update: vi.fn().mockResolvedValue(undefined),
      writeMessage: vi.fn(async (message) => message),
      readUnreadAndMark: vi.fn().mockResolvedValue([]),
    });
    const eventStore = new TeamEventStore();
    const snapshotStore = new TeamRuntimeSnapshotStore();
    const diagnosticsService = new TeamDiagnosticsService({
      repo,
      eventStore,
      snapshotStore,
    });
    await snapshotStore.set({
      teamId: team.id,
      capturedAt: 400,
      executionInfo: {
        teamId: team.id,
        executionKind: 'hermes_native',
        orchestrationMode: 'native_orchestrator',
        state: 'running',
      },
      degradedMembers: [],
      taskDiagnostics: {
        pending: 0,
        inProgress: 0,
        completed: 0,
        waiting: [],
      },
      timeline: [],
    });
    const conversationService = makeConversationService({
      updateConversation: vi.fn().mockResolvedValue(undefined),
      listAllConversations: vi.fn().mockResolvedValue([]),
    });
    const workerTaskManager = {
      getOrBuildTask: vi.fn().mockResolvedValue({}),
      kill: vi.fn(),
    };
    const service = new TeamSessionService(repo, workerTaskManager as any, conversationService, {
      diagnosticsService,
    });
    (service as any).hermesNativeEngine.readiness = 'ready';

    const result = await service.executeRecoveryPlan(team.id);

    expect(result.status).toBe('executed');
    expect(result.actionsApplied).toEqual(['rebuild_native_runtime', 'replay_native_context']);
    expect(result.replayMessage).toContain('Recovered team "Recovery Native Team" using native replay shell.');
    expect(result.executionInfo).toEqual(
      expect.objectContaining({
        executionKind: 'hermes_native',
        orchestrationMode: 'native_orchestrator',
        state: 'running',
        recovery: expect.objectContaining({
          source: 'live_session',
          preferredMode: 'native_replay',
          resumeReady: false,
        }),
      })
    );
    expect(repo.writeMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        teamId: team.id,
        toAgentId: 'slot-lead',
        content: expect.stringContaining('native replay shell'),
      })
    );
  });

  it('executes protocol replay recovery for protocol snapshots', async () => {
    mockConfigGet.mockImplementation(async (key: string) => {
      if (key === 'acp.cachedInitializeResult') {
        return {
          codex: {
            protocolVersion: 1,
            capabilities: {
              loadSession: false,
              promptCapabilities: { image: false, audio: false, embeddedContext: false },
              mcpCapabilities: { stdio: true, http: false, sse: false },
              sessionCapabilities: { fork: null, resume: null, list: null, close: null },
              _meta: {
                team: {
                  executionKind: 'protocol',
                },
              },
            },
            agentInfo: null,
            authMethods: [],
          },
        };
      }
      return undefined;
    });

    const team: TTeam = {
      id: 'team-recovery-protocol',
      userId: 'user-1',
      name: 'Recovery Protocol Team',
      workspace: '/workspace',
      workspaceMode: 'shared',
      leaderAgentId: 'slot-lead',
      agents: [
        {
          slotId: 'slot-lead',
          conversationId: 'conv-lead',
          role: 'leader',
          agentType: 'codex',
          agentName: 'Leader',
          conversationType: 'codex',
          status: 'idle',
        },
      ],
      executionEngine: 'protocol',
      orchestrationMode: 'protocol_coordinated',
      createdAt: 1,
      updatedAt: 1,
    };
    const repo = makeRepo({
      findById: vi.fn().mockResolvedValue(team),
      findTasksByTeam: vi.fn().mockResolvedValue([
        {
          id: 'task-1',
          teamId: team.id,
          owner: 'slot-worker',
          subject: 'Recover gateway task',
          description: 'Replay the gateway worker task context',
          status: 'pending',
          blockedBy: [],
          dependsOn: [],
          completionSummary: undefined,
          metadata: {},
          createdAt: 1,
          updatedAt: 1,
        },
      ]),
      update: vi.fn().mockResolvedValue(undefined),
      writeMessage: vi.fn(async (message) => message),
      readUnreadAndMark: vi.fn().mockResolvedValue([]),
    });
    const eventStore = new TeamEventStore();
    const snapshotStore = new TeamRuntimeSnapshotStore();
    const diagnosticsService = new TeamDiagnosticsService({
      repo,
      eventStore,
      snapshotStore,
    });
    await snapshotStore.set({
      teamId: team.id,
      capturedAt: 500,
      executionInfo: {
        teamId: team.id,
        executionKind: 'protocol',
        orchestrationMode: 'protocol_coordinated',
        state: 'running',
      },
      degradedMembers: [],
      taskDiagnostics: {
        pending: 1,
        inProgress: 0,
        completed: 0,
        waiting: [],
      },
      timeline: [],
    });
    const conversationService = makeConversationService({
      updateConversation: vi.fn().mockResolvedValue(undefined),
      listAllConversations: vi.fn().mockResolvedValue([]),
    });
    const workerTaskManager = {
      getOrBuildTask: vi.fn().mockResolvedValue({}),
      kill: vi.fn(),
    };
    const service = new TeamSessionService(repo, workerTaskManager as any, conversationService, {
      diagnosticsService,
    });

    const result = await service.executeRecoveryPlan(team.id);

    expect(result.status).toBe('executed');
    expect(result.actionsApplied).toEqual(['rebuild_protocol_runtime', 'replay_protocol_coordination']);
    expect(result.replayMessage).toContain('Recovered team "Recovery Protocol Team" using protocol coordination replay.');
    expect(result.protocolReplayContext).toEqual(
      expect.objectContaining({
        kind: 'protocol',
        targets: expect.any(Array),
      })
    );
    expect(result.executionInfo).toEqual(
      expect.objectContaining({
        executionKind: 'protocol',
        orchestrationMode: 'protocol_coordinated',
        state: 'running',
        recovery: expect.objectContaining({
          source: 'live_session',
          preferredMode: 'protocol_replay',
          replayReady: true,
        }),
      })
    );
    expect(repo.writeMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        teamId: team.id,
        toAgentId: 'slot-lead',
        content: expect.stringContaining('protocol coordination replay'),
      })
    );
  });

  it('starts gateway sessions through native bootstrap driver and replays structured worker payloads during recovery', async () => {
    mockConfigGet.mockImplementation(async (key: string) => {
      if (key === 'acp.cachedInitializeResult') {
        return null;
      }
      if (key === 'team.runtime.hermesNativeRouting') {
        return 'enabled';
      }
      return undefined;
    });

    const team: TTeam = {
      id: 'team-recovery-gateway',
      userId: 'user-1',
      name: 'Recovery Gateway Team',
      workspace: '/workspace',
      workspaceMode: 'shared',
      leaderAgentId: 'slot-lead',
      agents: [
        {
          slotId: 'slot-lead',
          conversationId: 'conv-lead',
          role: 'leader',
          agentType: 'openclaw-gateway',
          agentName: 'Leader',
          conversationType: 'openclaw-gateway',
          status: 'idle',
        },
        {
          slotId: 'slot-worker',
          conversationId: 'conv-worker',
          role: 'teammate',
          agentType: 'openclaw-gateway',
          agentName: 'Gateway Worker',
          conversationType: 'openclaw-gateway',
          status: 'failed',
        },
      ],
      executionEngine: 'gateway',
      orchestrationMode: 'gateway_coordinated',
      createdAt: 1,
      updatedAt: 1,
    };
    const repo = makeRepo({
      findById: vi.fn().mockResolvedValue(team),
      findTasksByTeam: vi.fn().mockResolvedValue([
        {
          id: 'task-1',
          teamId: team.id,
          owner: 'slot-worker',
          subject: 'Recover gateway task',
          description: 'Replay the gateway worker task context',
          status: 'pending',
          blockedBy: [],
          dependsOn: [],
          completionSummary: undefined,
          metadata: {},
          createdAt: 1,
          updatedAt: 1,
        },
      ]),
      update: vi.fn().mockResolvedValue(undefined),
      writeMessage: vi.fn(async (message) => message),
      readUnreadAndMark: vi.fn().mockResolvedValue([]),
    });
    const eventStore = new TeamEventStore();
    const snapshotStore = new TeamRuntimeSnapshotStore();
    const diagnosticsService = new TeamDiagnosticsService({
      repo,
      eventStore,
      snapshotStore,
    });
    await snapshotStore.set({
      teamId: team.id,
      capturedAt: 600,
      executionInfo: {
        teamId: team.id,
        executionKind: 'gateway',
        orchestrationMode: 'gateway_coordinated',
        state: 'failed',
      },
      degradedMembers: [
        {
          slotId: 'slot-worker',
          agentName: 'Gateway Worker',
          reason: 'gateway_connection_lost',
        },
      ],
      taskDiagnostics: {
        pending: 1,
        inProgress: 0,
        completed: 0,
        waiting: [],
      },
      protocolDiagnostics: {
        activeOwners: [],
        ownership: [],
        recentRecovery: [],
        leaderSummaries: [],
      },
      gatewayDiagnostics: {
        activeSessions: [
          {
            slotId: 'slot-worker',
            gatewaySessionId: 'sess-1',
            lifecycleState: 'reconnecting',
            taskCount: 1,
          },
        ],
        lifecycle: [
          {
            slotId: 'slot-worker',
            workerBackend: 'openclaw-gateway',
            gatewaySessionId: 'sess-1',
            lifecycleState: 'reconnecting',
            runtimeStatus: 'reconnecting',
            degradedReason: 'gateway_connection_lost',
            recoveryHint: 'Replay the saved session before redispatching work.',
            recoveryAction: 'replay_gateway_session',
            recoveryMode: 'native_resume',
            updatedAt: 1,
            sourceEventType: 'gateway_recovered',
          },
        ],
        taskOwnership: [
          {
            taskId: 'task-1',
            subject: 'Recover gateway task',
            owner: 'slot-worker',
            workerBackend: 'openclaw-gateway',
            gatewaySessionId: 'sess-1',
            taskStatus: 'failed',
            updatedAt: 1,
            lifecycleState: 'reconnecting',
            degradedReason: 'gateway_connection_lost',
            recoveryHint: 'Replay the saved session before redispatching work.',
            recoveryAction: 'replay_gateway_session',
            recoveryMode: 'native_resume',
          },
        ],
      },
      timeline: [],
    } as TeamRuntimeSnapshot);

    const updateConversation = vi.fn().mockResolvedValue(undefined);
    const conversationService = makeConversationService({
      updateConversation,
      listAllConversations: vi.fn().mockResolvedValue([]),
    });
    const getOrBuildTask = vi.fn().mockImplementation(async (conversationId: string) => {
      if (conversationId === 'conv-worker') {
        return {
          type: 'openclaw-gateway',
          status: 'running',
          workspace: '/workspace',
          conversation_id: 'conv-worker',
          lastActivityAt: Date.now(),
          sendMessage: vi.fn(),
          stop: vi.fn(),
          confirm: vi.fn(),
          getConfirmations: vi.fn(() => []),
          kill: vi.fn(),
          getDiagnostics: () => ({
            isConnected: false,
            hasActiveSession: false,
            sessionKey: 'sess-1',
            cliPath: 'openclaw',
          }),
        };
      }
      return {
        type: conversationId === 'conv-lead' ? 'openclaw-gateway' : 'acp',
        status: 'running',
        workspace: '/workspace',
        conversation_id: conversationId,
        lastActivityAt: Date.now(),
        sendMessage: vi.fn().mockResolvedValue(undefined),
        stop: vi.fn(),
        confirm: vi.fn(),
        getConfirmations: vi.fn(() => []),
        kill: vi.fn(),
        getDiagnostics: () => ({
          isConnected: true,
          hasActiveSession: true,
          sessionKey: conversationId === 'conv-lead' ? 'sess-lead' : undefined,
          cliPath: 'openclaw',
        }),
      };
    });
    const workerTaskManager = {
      getTask: vi.fn().mockImplementation((conversationId: string) => {
        if (conversationId === 'conv-worker') {
          return {
            type: 'openclaw-gateway',
            status: 'running',
            workspace: '/workspace',
            conversation_id: 'conv-worker',
            lastActivityAt: Date.now(),
            sendMessage: vi.fn(),
            stop: vi.fn(),
            confirm: vi.fn(),
            getConfirmations: vi.fn(() => []),
            kill: vi.fn(),
            getDiagnostics: () => ({
              isConnected: false,
              hasActiveSession: false,
              sessionKey: 'sess-1',
              cliPath: 'openclaw',
            }),
          };
        }
        return undefined;
      }),
      getOrBuildTask,
      kill: vi.fn(),
    };
    const service = new TeamSessionService(repo, workerTaskManager as any, conversationService, {
      diagnosticsService,
    });

    const session = await service.getOrStartSession(team.id);
    expect(session.getExecutionInfo()).toEqual(
      expect.objectContaining({
        executionKind: 'gateway',
        orchestrationMode: 'gateway_coordinated',
      })
    );
    expect(updateConversation).toHaveBeenCalledWith(
      'conv-worker',
      expect.objectContaining({
        extra: expect.objectContaining({
          gatewayLifecycleBootstrapMode: 'native_driver',
          gatewayRuntimeSnapshot: expect.objectContaining({
            sessionKey: 'sess-1',
            runtimeStatus: 'reconnecting',
          }),
        }),
      }),
      true
    );

    await service.stopSession(team.id);
    const preparation = await service.prepareRecoverySession(team.id);
    const result = await service.executeRecoveryPlan(team.id);
    expect(result.status).toBe('executed');
    expect(result.actionsApplied).toEqual(['rebuild_gateway_runtime', 'replay_gateway_session']);
    expect(preparation.gatewayReplayExecutionPlan).toEqual(
      expect.objectContaining({
        kind: 'gateway',
        targets: expect.arrayContaining([
          expect.objectContaining({
            slotId: 'slot-worker',
            taskIds: ['task-1'],
          }),
        ]),
      })
    );
    expect(result.gatewayReplayExecutionPlan).toEqual(
      expect.objectContaining({
        kind: preparation.gatewayReplayExecutionPlan?.kind,
        summary: preparation.gatewayReplayExecutionPlan?.summary,
        targets: preparation.gatewayReplayExecutionPlan?.targets,
      })
    );
    expect(result.gatewayReplayExecution).toEqual(
      expect.objectContaining({
        replayPlan: expect.objectContaining({
          kind: preparation.gatewayReplayExecutionPlan?.kind,
          summary: preparation.gatewayReplayExecutionPlan?.summary,
          targets: preparation.gatewayReplayExecutionPlan?.targets,
        }),
        workerResults: [
          expect.objectContaining({
            slotId: 'slot-worker',
            taskIds: ['task-1'],
            status: 'queued_for_redispatch',
          }),
        ],
      })
    );
    const gatewayRecoveryShell = new GatewayRecoveryShell();
    const gatewayContract = gatewayRecoveryShell.buildExecutionContract(team, preparation.diagnostics);
    expect(gatewayContract.workerReplayInstructions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          slotId: 'slot-worker',
          payload: expect.objectContaining({
            tasks: [{ taskId: 'task-1', subject: 'Recover gateway task' }],
          }),
        }),
      ])
    );
    const replayWrites = vi
      .mocked(repo.writeMessage)
      .mock.calls.map((call) => call[0])
      .filter((message) => typeof message?.content === 'string');
    expect(replayWrites).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          teamId: team.id,
          toAgentId: 'slot-lead',
          content: expect.stringContaining('Gateway targets:'),
        }),
      ])
    );
  });

  it('requests gateway native resume when gatewayNativeResume feature flag is enabled', async () => {
    mockConfigGet.mockImplementation(async (key: string) => {
      if (key === 'acp.cachedInitializeResult') {
        return null;
      }
      if (key === 'team.runtime.hermesNativeRouting') {
        return 'enabled';
      }
      if (key === 'team.runtime.gatewayNativeResume') {
        return 'enabled';
      }
      return undefined;
    });

    const team: TTeam = {
      id: 'team-gateway-native-resume',
      userId: 'user-1',
      name: 'Gateway Native Resume Team',
      workspace: '/workspace',
      workspaceMode: 'shared',
      leaderAgentId: 'slot-lead',
      agents: [
        {
          slotId: 'slot-lead',
          conversationId: 'conv-lead',
          role: 'leader',
          agentType: 'openclaw-gateway',
          agentName: 'Leader',
          conversationType: 'openclaw-gateway',
          status: 'idle',
        },
        {
          slotId: 'slot-worker',
          conversationId: 'conv-worker',
          role: 'teammate',
          agentType: 'openclaw-gateway',
          agentName: 'Gateway Worker',
          conversationType: 'openclaw-gateway',
          status: 'failed',
        },
      ],
      executionEngine: 'gateway',
      orchestrationMode: 'gateway_coordinated',
      createdAt: 1,
      updatedAt: 1,
    };
    const repo = makeRepo({
      findById: vi.fn().mockResolvedValue(team),
      findTasksByTeam: vi.fn().mockResolvedValue([
        {
          id: 'task-1',
          teamId: team.id,
          owner: 'slot-worker',
          subject: 'Recover gateway task',
          description: 'Replay the gateway worker task context',
          status: 'pending',
          blockedBy: [],
          dependsOn: [],
          completionSummary: undefined,
          metadata: {},
          createdAt: 1,
          updatedAt: 1,
        },
      ]),
      update: vi.fn().mockResolvedValue(undefined),
      writeMessage: vi.fn(async (message) => message),
      readUnreadAndMark: vi.fn().mockResolvedValue([]),
    });
    const eventStore = new TeamEventStore();
    const snapshotStore = new TeamRuntimeSnapshotStore();
    const diagnosticsService = new TeamDiagnosticsService({
      repo,
      eventStore,
      snapshotStore,
    });
    await snapshotStore.set({
      teamId: team.id,
      capturedAt: 600,
      executionInfo: {
        teamId: team.id,
        executionKind: 'gateway',
        orchestrationMode: 'gateway_coordinated',
        state: 'failed',
        recovery: {
          source: 'persisted_snapshot',
          snapshotAvailable: true,
          replayReady: true,
          resumeReady: true,
          preferredMode: 'gateway_replay',
        },
        recoveryPlan: {
          status: 'ready_for_replay',
          mode: 'gateway_replay',
          steps: [],
          blockers: [],
          summary: ['recovery_plan:gateway_replay'],
        },
      },
      degradedMembers: [
        {
          slotId: 'slot-worker',
          agentName: 'Gateway Worker',
          reason: 'gateway_connection_lost',
        },
      ],
      taskDiagnostics: {
        pending: 1,
        inProgress: 0,
        completed: 0,
        waiting: [],
      },
      protocolDiagnostics: {
        activeOwners: [],
        ownership: [],
        recentRecovery: [],
        leaderSummaries: [],
      },
      gatewayDiagnostics: {
        activeSessions: [
          {
            slotId: 'slot-worker',
            gatewaySessionId: 'sess-1',
            lifecycleState: 'reconnecting',
            taskCount: 1,
          },
        ],
        lifecycle: [
          {
            slotId: 'slot-worker',
            workerBackend: 'openclaw-gateway',
            gatewaySessionId: 'sess-1',
            lifecycleState: 'reconnecting',
            runtimeStatus: 'reconnecting',
            degradedReason: 'gateway_connection_lost',
            recoveryHint: 'Replay the saved session before redispatching work.',
            recoveryAction: 'replay_gateway_session',
            recoveryMode: 'gateway_replay',
            updatedAt: 1,
            sourceEventType: 'gateway_recovered',
          },
        ],
        taskOwnership: [
          {
            taskId: 'task-1',
            subject: 'Recover gateway task',
            owner: 'slot-worker',
            workerBackend: 'openclaw-gateway',
            gatewaySessionId: 'sess-1',
            taskStatus: 'failed',
            updatedAt: 1,
            lifecycleState: 'reconnecting',
            degradedReason: 'gateway_connection_lost',
            recoveryHint: 'Replay the saved session before redispatching work.',
            recoveryAction: 'replay_gateway_session',
            recoveryMode: 'gateway_replay',
          },
        ],
      },
      timeline: [],
    } as TeamRuntimeSnapshot);

    const conversationService = makeConversationService({
      updateConversation: vi.fn().mockResolvedValue(undefined),
      listAllConversations: vi.fn().mockResolvedValue([]),
    });
    const sendMessage = vi.fn().mockResolvedValue(undefined);
    const getOrBuildTask = vi.fn().mockImplementation(async (conversationId: string) => {
      if (conversationId === 'conv-worker') {
        return {
          type: 'openclaw-gateway',
          status: 'running',
          workspace: '/workspace',
          conversation_id: 'conv-worker',
          lastActivityAt: Date.now(),
          sendMessage,
          stop: vi.fn(),
          confirm: vi.fn(),
          getConfirmations: vi.fn(() => []),
          kill: vi.fn(),
          getDiagnostics: () => ({
            isConnected: false,
            hasActiveSession: false,
            sessionKey: 'sess-1',
            cliPath: 'openclaw',
          }),
        };
      }
      return {
        type: conversationId === 'conv-lead' ? 'openclaw-gateway' : 'acp',
        status: 'running',
        workspace: '/workspace',
        conversation_id: conversationId,
        lastActivityAt: Date.now(),
        sendMessage: vi.fn().mockResolvedValue(undefined),
        stop: vi.fn(),
        confirm: vi.fn(),
        getConfirmations: vi.fn(() => []),
        kill: vi.fn(),
        getDiagnostics: () => ({
          isConnected: true,
          hasActiveSession: true,
          sessionKey: conversationId === 'conv-lead' ? 'sess-lead' : undefined,
          cliPath: 'openclaw',
        }),
      };
    });
    const workerTaskManager = {
      getTask: vi.fn().mockImplementation((conversationId: string) => {
        if (conversationId === 'conv-worker') {
          return {
            type: 'openclaw-gateway',
            status: 'running',
            workspace: '/workspace',
            conversation_id: 'conv-worker',
            lastActivityAt: Date.now(),
            sendMessage,
            stop: vi.fn(),
            confirm: vi.fn(),
            getConfirmations: vi.fn(() => []),
            kill: vi.fn(),
            getDiagnostics: () => ({
              isConnected: false,
              hasActiveSession: false,
              sessionKey: 'sess-1',
              cliPath: 'openclaw',
            }),
          };
        }
        return undefined;
      }),
      getOrBuildTask,
      kill: vi.fn(),
    };
    const service = new TeamSessionService(repo, workerTaskManager as any, conversationService, {
      diagnosticsService,
    });

    await service.getOrStartSession(team.id);
    await service.stopSession(team.id);
    const result = await service.executeRecoveryPlan(team.id);

    expect(result.gatewayReplayExecution?.workerResults).toEqual([
      expect.objectContaining({
        slotId: 'slot-worker',
        replayStrategy: 'rebuild_session_then_resume_tasks',
        status: 'resume_requested',
      }),
    ]);
    expect(vi.mocked(repo.writeMessage).mock.calls.map((call) => call[0])).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          toAgentId: 'slot-worker',
          content: expect.stringContaining('"resume"'),
        }),
      ])
    );
  });
});
