import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({ app: { isPackaged: false, getPath: vi.fn(() => '/tmp') } }));

vi.mock('@process/agent/AgentRegistry', () => ({
  agentRegistry: {
    getDetectedAgents: vi.fn(() => []),
    refreshCustomAgents: vi.fn(async () => {}),
  },
}));

vi.mock('@process/services/mcpServices/McpService', () => ({
  mcpService: { getSupportedTransportsForAgent: vi.fn(() => []) },
}));

vi.mock('@process/acp/compat/LegacyConnectorFactory', () => ({
  LegacyConnectorFactory: vi.fn(function () {
    return {
      create: vi.fn(() => ({
        start: vi.fn(async () => {}),
        createSession: vi.fn(async () => ({ sessionId: 'session-1' })),
        prompt: vi.fn(async () => {}),
        close: vi.fn(async () => {}),
      })),
    };
  }),
}));

vi.mock('@process/acp/types', () => ({
  noopProtocolHandlers: {},
}));

const { mockAcpSessionGet, mockAcpSessionUpsert } = vi.hoisted(() => ({
  mockAcpSessionGet: vi.fn(),
  mockAcpSessionUpsert: vi.fn(),
}));

vi.mock('@process/core/acp/CoreAcpSessionRepository', () => ({
  CoreAcpSessionRepository: {
    get: mockAcpSessionGet,
    upsert: mockAcpSessionUpsert,
  },
}));

import { CoreAcpGatewayService } from '@process/core/acp';
import { coreEventBus } from '@process/core/shared/CoreEventBus';
import type { CoreTaskRuntimeService } from '@process/core/tasks';
import type { AgentBackend } from '@/common/types/acpTypes';

function createTaskRuntimeService(overrides?: Partial<CoreTaskRuntimeService>): CoreTaskRuntimeService {
  return {
    getAcpLikeTask: vi.fn(() => null),
    getAcpTask: vi.fn(() => null),
    getOrBuildAcpLikeTask: vi.fn(async () => null),
    getOrBuildAcpTask: vi.fn(async () => null),
    getRuntimeState: vi.fn(() => null),
    ...overrides,
  } as unknown as CoreTaskRuntimeService;
}

describe('CoreAcpGatewayService', () => {
  let events: Array<Parameters<Parameters<typeof coreEventBus.on>[0]>[0]>;
  let off: () => void;

  beforeEach(async () => {
    vi.clearAllMocks();
    events = [];
    off?.();
    off = coreEventBus.on((event) => events.push(event));
    mockAcpSessionGet.mockResolvedValue(null);
    mockAcpSessionUpsert.mockResolvedValue(undefined);
    const { agentRegistry } = await import('@process/agent/AgentRegistry');
    vi.mocked(agentRegistry.getDetectedAgents).mockReturnValue([]);
  });

  it('emits discovery events when listing agents', async () => {
    const { agentRegistry } = await import('@process/agent/AgentRegistry');
    vi.mocked(agentRegistry.getDetectedAgents).mockReturnValue([
      { backend: 'claude', name: 'Claude', kind: 'acp', cliPath: '/bin/claude' },
    ] as never);
    const { mcpService } = await import('@process/services/mcpServices/McpService');
    vi.mocked(mcpService.getSupportedTransportsForAgent).mockReturnValue(['stdio'] as never);

    const service = new CoreAcpGatewayService(createTaskRuntimeService());
    const result = service.getAvailableAgents();

    expect(result.success).toBe(true);
    expect(result.data?.[0]).toMatchObject({ backend: 'claude', supportedTransports: ['stdio'] });
    expect(events.at(-1)).toMatchObject({
      scope: 'acp',
      type: 'acp.agent.discovery.updated',
      data: { action: 'listed', count: 1 },
    });
  });

  it('preserves local custom agent metadata when listing agents', async () => {
    const { agentRegistry } = await import('@process/agent/AgentRegistry');
    vi.mocked(agentRegistry.getDetectedAgents).mockReturnValue([
      {
        id: 'custom:local-1',
        backend: 'custom',
        name: 'Local Agent',
        kind: 'acp',
        available: true,
        cliPath: 'D:/tools/local-agent.exe',
        acpArgs: ['--acp'],
        customAgentId: 'local-1',
      },
    ] as never);
    const { mcpService } = await import('@process/services/mcpServices/McpService');
    vi.mocked(mcpService.getSupportedTransportsForAgent).mockReturnValue(['stdio'] as never);

    const service = new CoreAcpGatewayService(createTaskRuntimeService());
    const result = service.getAvailableAgents();

    expect(result.data?.[0]).toMatchObject({
      id: 'custom:local-1',
      backend: 'custom',
      name: 'Local Agent',
      available: true,
      cliPath: 'D:/tools/local-agent.exe',
      acpArgs: ['--acp'],
      customAgentId: 'local-1',
      supportedTransports: ['stdio'],
    });
  });

  it('returns a normalized ACP session snapshot', async () => {
    const task = {
      getMode: vi.fn(() => ({ mode: 'auto_edit', initialized: true })),
      getModelInfo: vi.fn(() => ({ currentModelId: 'opus' })),
      getConfigOptions: vi.fn(() => [{ id: 'reasoning', currentValue: 'high' }]),
    };
    const runtime = {
      id: 'conv-1',
      type: 'acp',
      status: 'running',
      workspace: '/workspace',
      lastActivityAt: 1000,
      isActive: true,
    };
    const service = new CoreAcpGatewayService(
      createTaskRuntimeService({
        getAcpLikeTask: vi.fn(() => task),
        getAcpTask: vi.fn(() => task),
        getRuntimeState: vi.fn(() => runtime),
      })
    );

    await expect(service.getSessionSnapshot('conv-1')).resolves.toMatchObject({
      conversationId: 'conv-1',
      exists: true,
      runtime,
      mode: { mode: 'auto_edit', initialized: true },
      modelInfo: { currentModelId: 'opus' },
      configOptions: [{ id: 'reasoning', currentValue: 'high' }],
    });
  });

  it('emits session update events when mode changes', async () => {
    const task = {
      getMode: vi.fn(() => ({ mode: 'yolo', initialized: true })),
      setMode: vi.fn(async () => ({ success: true, data: { mode: 'yolo' } })),
    };
    const service = new CoreAcpGatewayService(
      createTaskRuntimeService({
        getAcpLikeTask: vi.fn(() => task),
        getOrBuildAcpLikeTask: vi.fn(async () => task),
      })
    );

    await expect(service.setMode('conv-1', 'yolo')).resolves.toEqual({ success: true, data: { mode: 'yolo' } });
    expect(events.at(-1)).toMatchObject({
      scope: 'acp',
      type: 'acp.session.updated',
      data: { action: 'mode_updated', conversationId: 'conv-1', mode: 'yolo', success: true },
    });
    expect(mockAcpSessionUpsert).toHaveBeenCalledWith({
      conversationId: 'conv-1',
      backend: undefined,
      agentId: 'conv-1',
      status: 'active',
      config: { mode: 'yolo', error: undefined },
    });
  });

  it('emits health events for unavailable CLI backends', async () => {
    const service = new CoreAcpGatewayService(createTaskRuntimeService());

    const result = await service.checkAgentHealth('qwen' as AgentBackend);

    expect(result).toMatchObject({ success: false, data: { available: false, error: 'CLI not installed' } });
    expect(events.at(-1)).toMatchObject({
      scope: 'acp',
      type: 'acp.agent.health.checked',
      data: { backend: 'qwen', available: false, error: 'CLI not installed' },
    });
  });
});
