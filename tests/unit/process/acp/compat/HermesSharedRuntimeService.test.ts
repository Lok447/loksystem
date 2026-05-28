import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  ForkSessionResponse,
  InitializeResponse,
  LoadSessionResponse,
  NewSessionResponse,
  PromptResponse,
  RequestPermissionResponse,
  SessionNotification,
} from '@agentclientprotocol/sdk';
import type { DisconnectInfo } from '@process/acp/infra/IAcpClient';
import type { AgentConfig, PromptContent, ProtocolHandlers } from '@process/acp/types';
import { HermesSharedClient, HermesSharedRuntimeService } from '@process/acp/compat/HermesSharedRuntimeService';

type MockProcessAcpClientInstance = {
  options: { backend: string; handlers: ProtocolHandlers };
  start: ReturnType<typeof vi.fn<() => Promise<InitializeResponse>>>;
  createSession: ReturnType<typeof vi.fn<(params: unknown) => Promise<NewSessionResponse>>>;
  loadSession: ReturnType<typeof vi.fn<(params: unknown) => Promise<LoadSessionResponse>>>;
  forkSession: ReturnType<typeof vi.fn<(params: unknown) => Promise<ForkSessionResponse>>>;
  prompt: ReturnType<typeof vi.fn<(sessionId: string, content: PromptContent) => Promise<PromptResponse>>>;
  cancel: ReturnType<typeof vi.fn<(sessionId: string) => Promise<void>>>;
  closeSession: ReturnType<typeof vi.fn<(sessionId: string) => Promise<void>>>;
  setModel: ReturnType<typeof vi.fn<(sessionId: string, modelId: string) => Promise<void>>>;
  setMode: ReturnType<typeof vi.fn<(sessionId: string, modeId: string) => Promise<void>>>;
  setConfigOption: ReturnType<typeof vi.fn<(sessionId: string, configId: string, value: string | boolean) => Promise<void>>>;
  authenticate: ReturnType<typeof vi.fn<(methodId: string) => Promise<unknown>>>;
  extMethod: ReturnType<typeof vi.fn<(method: string, params: Record<string, unknown>) => Promise<unknown>>>;
  onDisconnect: ReturnType<typeof vi.fn<(handler: (info: DisconnectInfo) => void) => void>>;
  emitDisconnect: (info: DisconnectInfo) => void;
  lifecycleSnapshot: { pid: number | null; running: boolean; lastExit: null };
};

const mockProcessAcpClientInstances: MockProcessAcpClientInstance[] = [];

vi.mock('@process/agent/acp/acpConnectors', () => ({
  spawnGenericBackend: vi.fn(),
}));

vi.mock('@process/acp/infra/ProcessAcpClient', () => ({
  ProcessAcpClient: class MockProcessAcpClient {
    lifecycleSnapshot = { pid: 4242, running: true, lastExit: null };
    private disconnectHandler: ((info: DisconnectInfo) => void) | null = null;
    readonly start = vi.fn(async () => ({
      agentCapabilities: {},
      authMethods: [],
      protocolVersion: '2025-06-18',
    }));
    readonly createSession = vi.fn(async ({ sessionId }: { sessionId?: string }) => ({
      sessionId: sessionId ?? `session-${mockProcessAcpClientInstances.length}-${this.createSession.mock.calls.length}`,
    }));
    readonly loadSession = vi.fn(async ({ sessionId }: { sessionId: string }) => ({ sessionId }));
    readonly forkSession = vi.fn(async ({ nextSessionId }: { nextSessionId?: string }) => ({
      sessionId: nextSessionId ?? `fork-${mockProcessAcpClientInstances.length}-${this.forkSession.mock.calls.length}`,
    }));
    readonly prompt = vi.fn(async () => ({ stopReason: 'end_turn' }));
    readonly cancel = vi.fn(async () => {});
    readonly closeSession = vi.fn(async () => {});
    readonly setModel = vi.fn(async () => {});
    readonly setMode = vi.fn(async () => {});
    readonly setConfigOption = vi.fn(async () => {});
    readonly authenticate = vi.fn(async () => ({}));
    readonly extMethod = vi.fn(async () => ({}));
    readonly onDisconnect = vi.fn((handler: (info: DisconnectInfo) => void) => {
      this.disconnectHandler = handler;
    });
    readonly options: { backend: string; handlers: ProtocolHandlers };

    constructor(_spawnFn: unknown, options: { backend: string; handlers: ProtocolHandlers }) {
      this.options = options;
      mockProcessAcpClientInstances.push({
        options,
        start: this.start,
        createSession: this.createSession,
        loadSession: this.loadSession,
        forkSession: this.forkSession,
        prompt: this.prompt,
        cancel: this.cancel,
        closeSession: this.closeSession,
        setModel: this.setModel,
        setMode: this.setMode,
        setConfigOption: this.setConfigOption,
        authenticate: this.authenticate,
        extMethod: this.extMethod,
        onDisconnect: this.onDisconnect,
        emitDisconnect: (info) => {
          this.disconnectHandler?.(info);
        },
        lifecycleSnapshot: this.lifecycleSnapshot,
      });
    }
  },
}));

function createConfig(): AgentConfig {
  return {
    agentBackend: 'hermes',
    workingDirectory: 'D:/tmp/loksystem-fork-sync',
    command: 'bundled-hermes.exe',
    env: {},
    additionalDirectories: [],
  };
}

function createHandlers() {
  return {
    onSessionUpdate: vi.fn(),
    onRequestPermission: vi.fn(async (): Promise<RequestPermissionResponse> => ({ outcome: { outcome: 'allow_once' } })),
    onReadTextFile: vi.fn(async () => ({ content: '' })),
    onWriteTextFile: vi.fn(async () => undefined),
  } satisfies ProtocolHandlers;
}

describe('HermesSharedRuntimeService', () => {
  beforeEach(() => {
    mockProcessAcpClientInstances.length = 0;
    (HermesSharedRuntimeService as unknown as { instance: HermesSharedRuntimeService | null }).instance = null;
  });

  afterEach(() => {
    vi.clearAllMocks();
    (HermesSharedRuntimeService as unknown as { instance: HermesSharedRuntimeService | null }).instance = null;
  });

  it('reuses one shared Hermes runtime across multiple LokCLI clients', async () => {
    const service = HermesSharedRuntimeService.getInstance();
    const clientOne = new HermesSharedClient(service, createConfig(), createHandlers());
    const clientTwo = new HermesSharedClient(service, createConfig(), createHandlers());

    await Promise.all([clientOne.start(), clientTwo.start()]);

    expect(mockProcessAcpClientInstances).toHaveLength(1);
    expect(mockProcessAcpClientInstances[0].start).toHaveBeenCalledTimes(1);
  });

  it('routes session updates only to the matching LokCLI session owner', async () => {
    const service = HermesSharedRuntimeService.getInstance();
    const handlersOne = createHandlers();
    const handlersTwo = createHandlers();
    const clientOne = new HermesSharedClient(service, createConfig(), handlersOne);
    const clientTwo = new HermesSharedClient(service, createConfig(), handlersTwo);

    await Promise.all([clientOne.start(), clientTwo.start()]);

    const runtime = mockProcessAcpClientInstances[0];
    runtime.createSession
      .mockResolvedValueOnce({ sessionId: 'lokcli-session-1' })
      .mockResolvedValueOnce({ sessionId: 'lokcli-session-2' });

    await clientOne.createSession({ cwd: 'D:/workspace-one' });
    await clientTwo.createSession({ cwd: 'D:/workspace-two' });

    await runtime.options.handlers.onSessionUpdate({ sessionId: 'lokcli-session-1' } as SessionNotification);
    await runtime.options.handlers.onSessionUpdate({ sessionId: 'lokcli-session-2' } as SessionNotification);

    expect(handlersOne.onSessionUpdate).toHaveBeenCalledTimes(1);
    expect(handlersOne.onSessionUpdate).toHaveBeenCalledWith({ sessionId: 'lokcli-session-1' });
    expect(handlersTwo.onSessionUpdate).toHaveBeenCalledTimes(1);
    expect(handlersTwo.onSessionUpdate).toHaveBeenCalledWith({ sessionId: 'lokcli-session-2' });
  });

  it('closes only the sessions owned by the closing LokCLI client proxy', async () => {
    const service = HermesSharedRuntimeService.getInstance();
    const clientOne = new HermesSharedClient(service, createConfig(), createHandlers());
    const clientTwo = new HermesSharedClient(service, createConfig(), createHandlers());

    await Promise.all([clientOne.start(), clientTwo.start()]);

    const runtime = mockProcessAcpClientInstances[0];
    runtime.createSession
      .mockResolvedValueOnce({ sessionId: 'lokcli-session-1' })
      .mockResolvedValueOnce({ sessionId: 'lokcli-session-2' });

    await clientOne.createSession({ cwd: 'D:/workspace-one' });
    await clientTwo.createSession({ cwd: 'D:/workspace-two' });

    await clientOne.close();

    expect(runtime.closeSession).toHaveBeenCalledTimes(1);
    expect(runtime.closeSession).toHaveBeenCalledWith('lokcli-session-1');
  });

  it('notifies all attached LokCLI clients when the shared Hermes runtime disconnects', async () => {
    const service = HermesSharedRuntimeService.getInstance();
    const clientOne = new HermesSharedClient(service, createConfig(), createHandlers());
    const clientTwo = new HermesSharedClient(service, createConfig(), createHandlers());
    const disconnectOne = vi.fn();
    const disconnectTwo = vi.fn();

    clientOne.onDisconnect(disconnectOne);
    clientTwo.onDisconnect(disconnectTwo);

    await Promise.all([clientOne.start(), clientTwo.start()]);

    const runtime = mockProcessAcpClientInstances[0];
    const disconnectInfo: DisconnectInfo = {
      reason: 'process_exit',
      exitCode: 1,
      signal: null,
      stderr: 'runtime stopped',
    };

    runtime.emitDisconnect(disconnectInfo);

    expect(disconnectOne).toHaveBeenCalledWith(disconnectInfo);
    expect(disconnectTwo).toHaveBeenCalledWith(disconnectInfo);

    await clientOne.start();

    expect(mockProcessAcpClientInstances).toHaveLength(2);
  });
});
