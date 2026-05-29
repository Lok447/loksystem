/**
 * @license
 * Copyright 2025 LokSystem (loksystem.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Tests for TeamGuideMcpServer tool handler logic (TCP architecture):
 *   - aion_create_team: input validation, TeamSessionService wiring, return shape
 *   - shouldInjectTeamGuideMcp: dynamic capability check (uses cached ACP init results)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as net from 'node:net';

// ------------------------------------------------------------------
// Hoist mocks
// ------------------------------------------------------------------

const { mockDeepLinkEmit, mockListChangedEmit } = vi.hoisted(() => ({
  mockDeepLinkEmit: vi.fn(),
  mockListChangedEmit: vi.fn(),
}));

const makeCachedInitEntry = () => ({
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
});

vi.mock('@/common', () => ({
  ipcBridge: {
    deepLink: {
      received: { emit: mockDeepLinkEmit },
    },
    team: {
      listChanged: { emit: mockListChangedEmit },
    },
  },
}));

vi.mock('electron', () => ({
  app: { isPackaged: false, getAppPath: () => '/app' },
}));

// Mock ProcessConfig for dynamic team capability checks
vi.mock('../../src/process/utils/initStorage', () => ({
  ProcessConfig: {
    get: vi.fn(async (key: string) => {
      if (key === 'acp.cachedInitializeResult') {
        return { claude: makeCachedInitEntry(), codex: makeCachedInitEntry() };
      }
      return null;
    }),
  },
}));

// ------------------------------------------------------------------
// Mock TeamSessionService
// ------------------------------------------------------------------

const mockCreateTeam = vi.fn();
const mockGetOrStartSession = vi.fn();
const mockSendMessageToAgent = vi.fn();
const mockGetExecutionInfo = vi.fn();
const mockPrepareRecoverySession = vi.fn();
const mockExecuteRecoveryPlan = vi.fn();

function makeTeamSessionService() {
  return {
    createTeam: mockCreateTeam,
    getOrStartSession: mockGetOrStartSession,
    getExecutionInfo: mockGetExecutionInfo,
    prepareRecoverySession: mockPrepareRecoverySession,
    executeRecoveryPlan: mockExecuteRecoveryPlan,
  } as unknown as import('../../src/process/team/TeamSessionService').TeamSessionService;
}

// ------------------------------------------------------------------
// Import units under test
// ------------------------------------------------------------------

import { TeamGuideMcpServer } from '../../src/process/team/mcp/guide/TeamGuideMcpServer';
import { MAX_MCP_MESSAGE_SIZE } from '../../src/process/team/mcp/tcpHelpers';

// ------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------

function getPort(service: TeamGuideMcpServer): number {
  const entry = service.getStdioConfig().env.find((e) => e.name === 'LOK_MCP_PORT');
  return Number(entry?.value ?? 0);
}

function getAuthToken(service: TeamGuideMcpServer): string {
  return service.getStdioConfig().env.find((e) => e.name === 'LOK_MCP_TOKEN')?.value ?? '';
}

async function tcpRequest(port: number, data: unknown): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();

    socket.connect(port, '127.0.0.1', () => {
      const json = JSON.stringify(data);
      const body = Buffer.from(json, 'utf-8');
      const header = Buffer.alloc(4);
      header.writeUInt32BE(body.length, 0);
      socket.write(Buffer.concat([header, body]));
    });

    let buffer = Buffer.alloc(0);
    socket.on('data', (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      while (buffer.length >= 4) {
        const bodyLen = buffer.readUInt32BE(0);
        if (buffer.length < 4 + bodyLen) break;
        const jsonStr = buffer.subarray(4, 4 + bodyLen).toString('utf-8');
        buffer = buffer.subarray(4 + bodyLen);
        try {
          resolve(JSON.parse(jsonStr));
        } catch (e) {
          reject(e);
        }
      }
    });

    socket.on('error', reject);
    setTimeout(() => reject(new Error('TCP request timed out')), 3000);
  });
}

// ------------------------------------------------------------------
// shouldInjectTeamGuideMcp (dynamic capability check)
// ------------------------------------------------------------------
// Tested in team-agentSelectUtils.test.ts via isTeamCapableBackend.
// The function itself is a thin wrapper around ProcessConfig + isTeamCapableBackend.

// ------------------------------------------------------------------
// TeamGuideMcpServer lifecycle
// ------------------------------------------------------------------

describe('TeamGuideMcpServer lifecycle', () => {
  let service: TeamGuideMcpServer;

  beforeEach(async () => {
    vi.clearAllMocks();
    service = new TeamGuideMcpServer(makeTeamSessionService());
    await service.start();
  });

  afterEach(async () => {
    await service.stop();
  });

  it('starts on a non-zero port', () => {
    expect(getPort(service)).toBeGreaterThan(0);
  });

  it('getStdioConfig returns correct structure', () => {
    const config = service.getStdioConfig();
    expect(config.name).toBe('loksystem-team-guide');
    expect(config.command).toBe('node');
    expect(Array.isArray(config.args)).toBe(true);
    expect(config.env.some((e) => e.name === 'LOK_MCP_PORT')).toBe(true);
    expect(config.env.some((e) => e.name === 'LOK_MCP_TOKEN')).toBe(true);
  });

  it('start() returns the same StdioMcpConfig as getStdioConfig()', async () => {
    const service2 = new TeamGuideMcpServer(makeTeamSessionService());
    const returned = await service2.start();
    const getter = service2.getStdioConfig();
    expect(returned).toEqual(getter);
    await service2.stop();
  });

  it('LOK_MCP_PORT resets to 0 after stop', async () => {
    await service.stop();
    expect(getPort(service)).toBe(0);
    await service.start();
  });
});

// ------------------------------------------------------------------
// Auth token validation
// ------------------------------------------------------------------

describe('TeamGuideMcpServer auth token', () => {
  let service: TeamGuideMcpServer;

  beforeEach(async () => {
    vi.clearAllMocks();
    service = new TeamGuideMcpServer(makeTeamSessionService());
    await service.start();
  });

  afterEach(async () => {
    await service.stop();
  });

  it('rejects requests with wrong auth token', async () => {
    const response = (await tcpRequest(getPort(service), {
      tool: 'aion_create_team',
      args: { summary: 'test' },
      auth_token: 'wrong-token',
    })) as Record<string, unknown>;
    expect(response.error).toBe('Unauthorized');
  });

  it('destroys oversize framed requests immediately and still accepts the next valid request', async () => {
    mockCreateTeam.mockResolvedValue({
      id: 'team-oversize-check',
      name: 'oversize recovery check',
      agents: [{ slotId: 'slot-lead', conversationId: 'conv-lead', role: 'leader' }],
    });
    mockGetOrStartSession.mockResolvedValue({
      sendMessageToAgent: mockSendMessageToAgent,
    });
    mockSendMessageToAgent.mockResolvedValue(undefined);

    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const socket = new net.Socket();

      const finish = (error?: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (error) reject(error);
        else resolve();
      };

      const timer = setTimeout(() => finish(new Error('Oversize guide MCP frame was not closed promptly')), 500);

      socket.connect(getPort(service), '127.0.0.1', () => {
        const header = Buffer.alloc(4);
        header.writeUInt32BE(MAX_MCP_MESSAGE_SIZE + 1, 0);
        socket.write(header);
      });

      socket.once('data', (chunk) => {
        finish(new Error(`Expected disconnect for oversize guide frame, got data: ${chunk.toString('hex')}`));
      });
      socket.once('close', () => finish());
      socket.once('error', () => finish());
    });

    const response = (await tcpRequest(getPort(service), {
      tool: 'aion_create_team',
      args: { summary: 'oversize recovery check' },
      auth_token: getAuthToken(service),
    })) as Record<string, unknown>;

    expect(response.error).toBeUndefined();
    expect(String(response.result)).toContain('team_created');
  });
});

// ------------------------------------------------------------------
// aion_create_team handler
// ------------------------------------------------------------------

describe('aion_create_team handler', () => {
  let service: TeamGuideMcpServer;

  beforeEach(async () => {
    vi.clearAllMocks();
    service = new TeamGuideMcpServer(makeTeamSessionService());
    await service.start();

    mockCreateTeam.mockResolvedValue({
      id: 'team-abc-123',
      name: '电商网站全栈开发',
      agents: [{ slotId: 'slot-lead', conversationId: 'conv-lead', role: 'leader' }],
    });

    mockGetOrStartSession.mockResolvedValue({
      sendMessageToAgent: mockSendMessageToAgent,
    });
    mockGetExecutionInfo.mockResolvedValue({
      teamId: 'team-abc-123',
      executionKind: 'legacy_mailbox',
      orchestrationMode: 'legacy_mailbox',
      state: 'created',
    });

    mockSendMessageToAgent.mockResolvedValue(undefined);
  });

  afterEach(async () => {
    await service.stop();
  });

  it('returns teamId, name, route, and status on valid input', async () => {
    const response = (await tcpRequest(getPort(service), {
      tool: 'aion_create_team',
      args: { summary: '构建完整电商网站', name: '电商网站全栈开发' },
      auth_token: getAuthToken(service),
    })) as Record<string, unknown>;

    const data = JSON.parse(response.result as string) as Record<string, unknown>;
    expect(data).toMatchObject({
      teamId: 'team-abc-123',
      name: '电商网站全栈开发',
      route: '/team/team-abc-123',
      executionInfo: {
        teamId: 'team-abc-123',
        executionKind: 'legacy_mailbox',
        orchestrationMode: 'legacy_mailbox',
        state: 'created',
      },
      status: 'team_created',
    });
  });

  it('auto-generates name from summary when name is omitted', async () => {
    const response = (await tcpRequest(getPort(service), {
      tool: 'aion_create_team',
      args: { summary: '构建电商网站 React 前端' },
      auth_token: getAuthToken(service),
    })) as Record<string, unknown>;

    const data = JSON.parse(response.result as string) as Record<string, unknown>;
    expect(data.teamId).toBe('team-abc-123');
    expect(data.route).toBe('/team/team-abc-123');
  });

  it('calls TeamSessionService.createTeam with the provided name', async () => {
    await tcpRequest(getPort(service), {
      tool: 'aion_create_team',
      args: { summary: '测试摘要', name: '测试团队' },
      auth_token: getAuthToken(service),
    });

    expect(mockCreateTeam).toHaveBeenCalledWith(expect.objectContaining({ name: '测试团队' }));
  });

  it('sends summary as first message to leader agent (async)', async () => {
    await tcpRequest(getPort(service), {
      tool: 'aion_create_team',
      args: { summary: '构建电商网站', name: '电商' },
      auth_token: getAuthToken(service),
    });

    // Session start + message send are fire-and-forget; wait for microtasks to settle
    await vi.waitFor(() => {
      expect(mockSendMessageToAgent).toHaveBeenCalledWith('slot-lead', '构建电商网站', { silent: false });
    });
  });

  it('returns error when summary is empty', async () => {
    const response = (await tcpRequest(getPort(service), {
      tool: 'aion_create_team',
      args: { summary: '' },
      auth_token: getAuthToken(service),
    })) as Record<string, unknown>;

    expect(response.error).toBeTruthy();
    expect(String(response.error)).toContain('summary is required');
  });

  it('returns error when TeamSessionService.createTeam throws', async () => {
    mockCreateTeam.mockRejectedValue(new Error('DB write failed'));

    const response = (await tcpRequest(getPort(service), {
      tool: 'aion_create_team',
      args: { summary: '构建网站' },
      auth_token: getAuthToken(service),
    })) as Record<string, unknown>;

    expect(response.error).toContain('DB write failed');
  });

  it('uses system-injected backend (from LOK_MCP_BACKEND) as agent type', async () => {
    await tcpRequest(getPort(service), {
      tool: 'aion_create_team',
      args: { summary: '分析代码' },
      auth_token: getAuthToken(service),
      backend: 'codex',
    });

    expect(mockCreateTeam).toHaveBeenCalledWith(
      expect.objectContaining({
        agents: expect.arrayContaining([expect.objectContaining({ agentType: 'codex' })]),
      })
    );
  });

  it('falls back to hermes when backend is not in whitelist', async () => {
    await tcpRequest(getPort(service), {
      tool: 'aion_create_team',
      args: { summary: '分析代码' },
      auth_token: getAuthToken(service),
      backend: 'qwen',
    });

    expect(mockCreateTeam).toHaveBeenCalledWith(
      expect.objectContaining({
        agents: expect.arrayContaining([expect.objectContaining({ agentType: 'hermes' })]),
      })
    );
  });

  it('falls back to hermes when backend is not provided', async () => {
    await tcpRequest(getPort(service), {
      tool: 'aion_create_team',
      args: { summary: '构建网站' },
      auth_token: getAuthToken(service),
    });

    expect(mockCreateTeam).toHaveBeenCalledWith(
      expect.objectContaining({
        agents: expect.arrayContaining([expect.objectContaining({ agentType: 'hermes' })]),
      })
    );
  });
});

// ------------------------------------------------------------------
// Unknown tool
// ------------------------------------------------------------------

describe('unknown tool', () => {
  let service: TeamGuideMcpServer;

  beforeEach(async () => {
    vi.clearAllMocks();
    service = new TeamGuideMcpServer(makeTeamSessionService());
    await service.start();
  });

  afterEach(async () => {
    await service.stop();
  });

  it('returns error for unknown tool names', async () => {
    const response = (await tcpRequest(getPort(service), {
      tool: 'totally_unknown_tool',
      args: {},
      auth_token: getAuthToken(service),
    })) as Record<string, unknown>;

    expect(response.error).toContain('Unknown tool');
  });
});

describe('team recovery handlers', () => {
  let service: TeamGuideMcpServer;

  beforeEach(async () => {
    vi.clearAllMocks();
    service = new TeamGuideMcpServer(makeTeamSessionService());
    await service.start();
    mockPrepareRecoverySession.mockResolvedValue({
      teamId: 'team-recovery-1',
      executionInfo: {
        teamId: 'team-recovery-1',
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
      protocolReplayContext: undefined,
      protocolReplayExecutionPlan: undefined,
      gatewayReplayContext: undefined,
      gatewayReplayExecutionPlan: undefined,
    });
    mockExecuteRecoveryPlan.mockResolvedValue({
      teamId: 'team-recovery-1',
      status: 'executed',
      executionInfo: {
        teamId: 'team-recovery-1',
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
      replayMessage: 'Recovered team "Recovery Team" using legacy mailbox replay.',
      protocolReplayContext: undefined,
      protocolReplayExecutionPlan: undefined,
      gatewayReplayContext: undefined,
      gatewayReplayExecutionPlan: undefined,
      gatewayReplayExecution: undefined,
    });
  });

  afterEach(async () => {
    await service.stop();
  });

  it('returns prepared team recovery details', async () => {
    const response = (await tcpRequest(getPort(service), {
      tool: 'aion_prepare_team_recovery',
      args: { team_id: 'team-recovery-1' },
      auth_token: getAuthToken(service),
    })) as Record<string, unknown>;

    const data = JSON.parse(response.result as string) as Record<string, unknown>;
    expect(data).toMatchObject({
      teamId: 'team-recovery-1',
      status: 'ready_for_replay',
      mode: 'mailbox_replay',
    });
    expect(mockPrepareRecoverySession).toHaveBeenCalledWith('team-recovery-1');
  });

  it('returns executed team recovery details', async () => {
    const response = (await tcpRequest(getPort(service), {
      tool: 'aion_execute_team_recovery',
      args: { team_id: 'team-recovery-1' },
      auth_token: getAuthToken(service),
    })) as Record<string, unknown>;

    const data = JSON.parse(response.result as string) as Record<string, unknown>;
    expect(data).toMatchObject({
      teamId: 'team-recovery-1',
      status: 'executed',
      actionsApplied: ['rebuild_mailbox_runtime', 'replay_mailbox_messages'],
    });
    expect(mockExecuteRecoveryPlan).toHaveBeenCalledWith('team-recovery-1');
  });

  it('returns error when recovery tool is missing team_id', async () => {
    const response = (await tcpRequest(getPort(service), {
      tool: 'aion_prepare_team_recovery',
      args: {},
      auth_token: getAuthToken(service),
    })) as Record<string, unknown>;

    expect(String(response.error)).toContain('team_id is required');
  });

  it('includes protocol replay execution plan in recovery tool output when available', async () => {
    mockPrepareRecoverySession.mockResolvedValueOnce({
      teamId: 'team-protocol',
      executionInfo: {
        teamId: 'team-protocol',
        executionKind: 'protocol',
        orchestrationMode: 'protocol_coordinated',
        state: 'stopped',
      },
      recoveryPlan: {
        status: 'ready_for_replay',
        mode: 'protocol_replay',
        steps: [],
        blockers: [],
        summary: ['recovery_plan:protocol_replay'],
      },
      diagnostics: null,
      protocolReplayContext: {
        kind: 'protocol',
        leaderSlotId: 'slot-lead',
        generatedAt: 1,
        summary: ['protocol_targets:1'],
        replaySteps: ['Review Worker ownership'],
        targets: [],
        executionPlan: {
          kind: 'protocol_replay_execution',
          leaderSlotId: 'slot-lead',
          generatedAt: 1,
          targetCount: 1,
          replayTaskCount: 1,
          summary: ['protocol_replay_targets:1'],
          steps: ['slot-worker: task-1'],
          targets: [
            {
              slotId: 'slot-worker',
              role: 'worker',
              agentName: 'Worker',
              backend: 'codex',
              conversationId: 'conv-worker',
              supportsResume: true,
              supportsStructuredTasks: true,
              replayTaskCount: 1,
              replayTasks: [
                {
                  taskId: 'task-1',
                  subject: 'Investigate regression',
                  recoveryAction: 'replay_protocol_coordination',
                  recoveryMode: 'protocol_replay',
                },
              ],
              replayActions: [
                {
                  action: 'replay_protocol_coordination',
                  mode: 'protocol_replay',
                  taskIds: ['task-1'],
                },
              ],
              replayInstructions: ['Investigate regression (task-1) -> replay_protocol_coordination'],
            },
          ],
        },
      },
      protocolReplayExecutionPlan: {
        kind: 'protocol_replay_execution',
        leaderSlotId: 'slot-lead',
        generatedAt: 1,
        targetCount: 1,
        replayTaskCount: 1,
        summary: ['protocol_replay_targets:1'],
        steps: ['slot-worker: task-1'],
        targets: [
          {
            slotId: 'slot-worker',
            role: 'worker',
            agentName: 'Worker',
            backend: 'codex',
            conversationId: 'conv-worker',
            supportsResume: true,
            supportsStructuredTasks: true,
            replayTaskCount: 1,
            replayTasks: [
              {
                taskId: 'task-1',
                subject: 'Investigate regression',
                recoveryAction: 'replay_protocol_coordination',
                recoveryMode: 'protocol_replay',
              },
            ],
            replayActions: [
              {
                action: 'replay_protocol_coordination',
                mode: 'protocol_replay',
                taskIds: ['task-1'],
              },
            ],
            replayInstructions: ['Investigate regression (task-1) -> replay_protocol_coordination'],
          },
        ],
      },
    });

    const response = (await tcpRequest(getPort(service), {
      tool: 'aion_prepare_team_recovery',
      args: { team_id: 'team-protocol' },
      auth_token: getAuthToken(service),
    })) as Record<string, unknown>;

    const data = JSON.parse(response.result as string) as Record<string, unknown>;
    expect(data).toMatchObject({
      teamId: 'team-protocol',
      mode: 'protocol_replay',
      protocolReplayExecutionPlan: {
        kind: 'protocol_replay_execution',
        targetCount: 1,
        replayTaskCount: 1,
      },
    });
  });

  it('includes gateway replay execution plan and execution details in recovery tool output when available', async () => {
    mockPrepareRecoverySession.mockResolvedValueOnce({
      teamId: 'team-gateway',
      executionInfo: {
        teamId: 'team-gateway',
        executionKind: 'gateway',
        orchestrationMode: 'gateway_coordinated',
        state: 'stopped',
      },
      recoveryPlan: {
        status: 'ready_for_replay',
        mode: 'gateway_replay',
        steps: [],
        blockers: [],
        summary: ['recovery_plan:gateway_replay'],
      },
      diagnostics: null,
      protocolReplayContext: undefined,
      protocolReplayExecutionPlan: undefined,
      gatewayReplayContext: {
        kind: 'gateway',
        leaderSlotId: 'slot-lead',
        generatedAt: 1,
        summary: ['gateway_targets:1'],
        replaySteps: ['Review Gateway Worker ownership'],
        targets: [],
      },
      gatewayReplayExecutionPlan: {
        kind: 'gateway',
        generatedAt: 1,
        summary: ['gateway_replay_targets:1'],
        targets: [
          {
            slotId: 'slot-worker',
            role: 'worker',
            agentName: 'Gateway Worker',
            backend: 'openclaw-gateway',
            gatewaySessionId: 'sess-1',
            lifecycleState: 'reconnecting',
            replayStrategy: 'rebuild_session_then_wait',
            resumeSupported: false,
            structuredTasksSupported: false,
            requiresLeaderRedispatch: true,
            recoveryActions: ['replay_gateway_session'],
            recoveryModes: ['gateway_replay'],
            taskIds: ['task-1'],
            taskSubjects: ['Recover gateway task'],
            latestRecoveryHint: 'Replay the saved session before redispatching work.',
          },
        ],
      },
    });
    mockExecuteRecoveryPlan.mockResolvedValueOnce({
      teamId: 'team-gateway',
      status: 'executed',
      executionInfo: {
        teamId: 'team-gateway',
        executionKind: 'gateway',
        orchestrationMode: 'gateway_coordinated',
        state: 'running',
      },
      recoveryPlan: {
        status: 'ready_for_replay',
        mode: 'gateway_replay',
        steps: [],
        blockers: [],
        summary: ['recovery_plan:gateway_replay'],
      },
      diagnostics: null,
      actionsApplied: ['rebuild_gateway_runtime', 'replay_gateway_session'],
      replayMessage: 'Recovered team "Gateway Team" using gateway coordination replay.',
      protocolReplayContext: undefined,
      protocolReplayExecutionPlan: undefined,
      gatewayReplayContext: {
        kind: 'gateway',
        leaderSlotId: 'slot-lead',
        generatedAt: 1,
        summary: ['gateway_targets:1'],
        replaySteps: ['Review Gateway Worker ownership'],
        targets: [],
      },
      gatewayReplayExecutionPlan: {
        kind: 'gateway',
        generatedAt: 1,
        summary: ['gateway_replay_targets:1'],
        targets: [
          {
            slotId: 'slot-worker',
            role: 'worker',
            agentName: 'Gateway Worker',
            backend: 'openclaw-gateway',
            gatewaySessionId: 'sess-1',
            lifecycleState: 'reconnecting',
            replayStrategy: 'rebuild_session_then_wait',
            resumeSupported: false,
            structuredTasksSupported: false,
            requiresLeaderRedispatch: true,
            recoveryActions: ['replay_gateway_session'],
            recoveryModes: ['gateway_replay'],
            taskIds: ['task-1'],
            taskSubjects: ['Recover gateway task'],
            latestRecoveryHint: 'Replay the saved session before redispatching work.',
          },
        ],
      },
      gatewayReplayExecution: {
        replayPlan: {
          kind: 'gateway',
          generatedAt: 1,
          summary: ['gateway_replay_targets:1'],
          targets: [
            {
              slotId: 'slot-worker',
              role: 'worker',
              agentName: 'Gateway Worker',
              backend: 'openclaw-gateway',
              gatewaySessionId: 'sess-1',
              lifecycleState: 'reconnecting',
              replayStrategy: 'rebuild_session_then_wait',
              resumeSupported: false,
              structuredTasksSupported: false,
              requiresLeaderRedispatch: true,
              recoveryActions: ['replay_gateway_session'],
              recoveryModes: ['gateway_replay'],
              taskIds: ['task-1'],
              taskSubjects: ['Recover gateway task'],
              latestRecoveryHint: 'Replay the saved session before redispatching work.',
            },
          ],
        },
        workerResults: [
          {
            slotId: 'slot-worker',
            gatewaySessionId: 'sess-1',
            replayStrategy: 'rebuild_session_then_wait',
            taskIds: ['task-1'],
            status: 'queued',
          },
        ],
      },
    });

    const prepareResponse = (await tcpRequest(getPort(service), {
      tool: 'aion_prepare_team_recovery',
      args: { team_id: 'team-gateway' },
      auth_token: getAuthToken(service),
    })) as Record<string, unknown>;
    const prepareData = JSON.parse(prepareResponse.result as string) as Record<string, unknown>;
    expect(prepareData).toMatchObject({
      teamId: 'team-gateway',
      mode: 'gateway_replay',
      gatewayReplayExecutionPlan: {
        kind: 'gateway',
        targets: [expect.objectContaining({ slotId: 'slot-worker', taskIds: ['task-1'] })],
      },
    });

    const executeResponse = (await tcpRequest(getPort(service), {
      tool: 'aion_execute_team_recovery',
      args: { team_id: 'team-gateway' },
      auth_token: getAuthToken(service),
    })) as Record<string, unknown>;
    const executeData = JSON.parse(executeResponse.result as string) as Record<string, unknown>;
    expect(executeData).toMatchObject({
      teamId: 'team-gateway',
      status: 'executed',
      gatewayReplayExecutionPlan: {
        kind: 'gateway',
      },
      gatewayReplayExecution: {
        workerResults: [expect.objectContaining({ slotId: 'slot-worker', status: 'queued' })],
      },
    });
  });
});
