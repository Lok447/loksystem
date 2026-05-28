import type {
  ForkSessionResponse,
  InitializeResponse,
  LoadSessionResponse,
  NewSessionResponse,
  PromptResponse,
  RequestPermissionRequest,
  RequestPermissionResponse,
  SessionNotification,
} from '@agentclientprotocol/sdk';
import { AcpError } from '@process/acp/errors/AcpError';
import { ProcessAcpClient } from '@process/acp/infra/ProcessAcpClient';
import type { AcpClient, DisconnectInfo } from '@process/acp/infra/IAcpClient';
import type { CreateSessionParams, ForkSessionParams, LoadSessionParams } from '@process/acp/infra/AcpProtocol';
import type { AgentConfig, PromptContent, ProtocolHandlers } from '@process/acp/types';
import { spawnGenericBackend } from '@process/agent/acp/acpConnectors';

type SharedClientEntry = {
  client: HermesSharedClient;
  handlers: ProtocolHandlers;
};

export class HermesSharedRuntimeService {
  private static instance: HermesSharedRuntimeService | null = null;

  static getInstance(): HermesSharedRuntimeService {
    if (!HermesSharedRuntimeService.instance) {
      HermesSharedRuntimeService.instance = new HermesSharedRuntimeService();
    }
    return HermesSharedRuntimeService.instance;
  }

  private runtimeClient: ProcessAcpClient | null = null;
  private initializePromise: Promise<InitializeResponse> | null = null;
  private initializeResult: InitializeResponse | null = null;
  private readonly proxies = new Set<HermesSharedClient>();
  private readonly sessionRoutes = new Map<string, SharedClientEntry>();
  private readonly proxySessions = new Map<HermesSharedClient, Set<string>>();

  async ensureStarted(config: AgentConfig): Promise<InitializeResponse> {
    if (this.initializeResult) return this.initializeResult;
    if (this.initializePromise) return this.initializePromise;

    const command = config.command?.trim();
    if (!command) {
      throw new AcpError('CONNECTION_FAILED', 'LokCLI runtime binary is unavailable', { retryable: false });
    }

    const spawnFn = async () => {
      const result = await spawnGenericBackend(
        'hermes',
        command,
        config.cwd,
        config.args,
        config.env
      );
      return result.child;
    };

    this.runtimeClient = new ProcessAcpClient(spawnFn, {
      backend: 'hermes',
      handlers: {
        onSessionUpdate: (notification) => this.routeSessionUpdate(notification),
        onRequestPermission: (request) => this.routePermissionRequest(request),
        onReadTextFile: (request) => this.routeReadTextFile(request),
        onWriteTextFile: (request) => this.routeWriteTextFile(request),
      },
    });
    this.runtimeClient.onDisconnect((info) => {
      this.handleRuntimeDisconnect(info);
    });

    this.initializePromise = this.runtimeClient
      .start()
      .then((result) => {
        this.initializeResult = result;
        return result;
      })
      .catch((error) => {
        this.runtimeClient = null;
        this.initializeResult = null;
        throw error;
      })
      .finally(() => {
        if (!this.initializeResult) {
          this.initializePromise = null;
        }
      });

    return this.initializePromise;
  }

  registerProxy(proxy: HermesSharedClient): void {
    this.proxies.add(proxy);
    if (!this.proxySessions.has(proxy)) {
      this.proxySessions.set(proxy, new Set());
    }
  }

  unregisterProxy(proxy: HermesSharedClient): void {
    this.proxies.delete(proxy);
    const sessionIds = this.proxySessions.get(proxy);
    if (sessionIds) {
      for (const sessionId of sessionIds) {
        const current = this.sessionRoutes.get(sessionId);
        if (current?.client === proxy) {
          this.sessionRoutes.delete(sessionId);
        }
      }
      this.proxySessions.delete(proxy);
    }
  }

  async closeProxy(proxy: HermesSharedClient): Promise<void> {
    const sessionIds = Array.from(this.proxySessions.get(proxy) ?? []);
    const runtimeClient = this.runtimeClient;
    for (const sessionId of sessionIds) {
      try {
        await runtimeClient?.closeSession(sessionId);
      } catch {
        // best effort: shared runtime may already be down
      }
      this.unbindSession(proxy, sessionId);
    }
    this.unregisterProxy(proxy);
  }

  getLifecycleSnapshot() {
    return this.runtimeClient?.lifecycleSnapshot ?? { pid: null, running: false, lastExit: null };
  }

  async createSession(
    proxy: HermesSharedClient,
    params: CreateSessionParams,
    handlers: ProtocolHandlers
  ): Promise<NewSessionResponse> {
    const client = this.requireRuntimeClient();
    const response = await client.createSession(params);
    this.bindSession(proxy, response.sessionId, handlers);
    return response;
  }

  async loadSession(
    proxy: HermesSharedClient,
    params: LoadSessionParams,
    handlers: ProtocolHandlers
  ): Promise<LoadSessionResponse> {
    const client = this.requireRuntimeClient();
    this.bindSession(proxy, params.sessionId, handlers);
    try {
      return await client.loadSession(params);
    } catch (error) {
      this.unbindSession(proxy, params.sessionId);
      throw error;
    }
  }

  async forkSession(
    proxy: HermesSharedClient,
    params: ForkSessionParams,
    handlers: ProtocolHandlers
  ): Promise<ForkSessionResponse> {
    const client = this.requireRuntimeClient();
    const response = await client.forkSession(params);
    this.bindSession(proxy, response.sessionId, handlers);
    return response;
  }

  async prompt(sessionId: string, content: PromptContent): Promise<PromptResponse> {
    return await this.requireRuntimeClient().prompt(sessionId, content);
  }

  async cancel(sessionId: string): Promise<void> {
    await this.requireRuntimeClient().cancel(sessionId);
  }

  async closeSession(sessionId: string): Promise<void> {
    await this.requireRuntimeClient().closeSession(sessionId);
    this.unbindSessionFromAll(sessionId);
  }

  async setModel(sessionId: string, modelId: string): Promise<void> {
    await this.requireRuntimeClient().setModel(sessionId, modelId);
  }

  async setMode(sessionId: string, modeId: string): Promise<void> {
    await this.requireRuntimeClient().setMode(sessionId, modeId);
  }

  async setConfigOption(sessionId: string, configId: string, value: string | boolean): Promise<void> {
    await this.requireRuntimeClient().setConfigOption(sessionId, configId, value);
  }

  async authenticate(methodId: string): Promise<unknown> {
    return await this.requireRuntimeClient().authenticate(methodId);
  }

  async extMethod(method: string, params: Record<string, unknown>): Promise<unknown> {
    return await this.requireRuntimeClient().extMethod(method, params);
  }

  private requireRuntimeClient(): ProcessAcpClient {
    if (!this.runtimeClient) {
      throw new AcpError('INVALID_STATE', 'LokCLI runtime is not connected');
    }
    return this.runtimeClient;
  }

  private bindSession(proxy: HermesSharedClient, sessionId: string, handlers: ProtocolHandlers): void {
    this.registerProxy(proxy);
    this.sessionRoutes.set(sessionId, { client: proxy, handlers });
    let sessions = this.proxySessions.get(proxy);
    if (!sessions) {
      sessions = new Set();
      this.proxySessions.set(proxy, sessions);
    }
    sessions.add(sessionId);
  }

  private unbindSession(proxy: HermesSharedClient, sessionId: string): void {
    const current = this.sessionRoutes.get(sessionId);
    if (current?.client === proxy) {
      this.sessionRoutes.delete(sessionId);
    }
    this.proxySessions.get(proxy)?.delete(sessionId);
  }

  private unbindSessionFromAll(sessionId: string): void {
    const current = this.sessionRoutes.get(sessionId);
    if (!current) return;
    this.sessionRoutes.delete(sessionId);
    this.proxySessions.get(current.client)?.delete(sessionId);
  }

  private async routeSessionUpdate(notification: SessionNotification): Promise<void> {
    const route = this.sessionRoutes.get(notification.sessionId);
    if (!route) return;
    route.handlers.onSessionUpdate(notification);
  }

  private async routePermissionRequest(request: RequestPermissionRequest): Promise<RequestPermissionResponse> {
    const route = this.sessionRoutes.get(request.sessionId);
    if (!route) {
      return { outcome: { outcome: 'cancelled' } };
    }
    return await route.handlers.onRequestPermission(request);
  }

  private async routeReadTextFile(request: Parameters<ProtocolHandlers['onReadTextFile']>[0]) {
    const route = this.sessionRoutes.get(request.sessionId);
    if (!route) {
      throw new Error(`No LokCLI session route for file read: ${request.sessionId}`);
    }
    return await route.handlers.onReadTextFile(request);
  }

  private async routeWriteTextFile(request: Parameters<ProtocolHandlers['onWriteTextFile']>[0]) {
    const route = this.sessionRoutes.get(request.sessionId);
    if (!route) {
      throw new Error(`No LokCLI session route for file write: ${request.sessionId}`);
    }
    return await route.handlers.onWriteTextFile(request);
  }

  private handleRuntimeDisconnect(info: DisconnectInfo): void {
    this.runtimeClient = null;
    this.initializeResult = null;
    this.initializePromise = null;
    this.sessionRoutes.clear();
    this.proxySessions.clear();

    for (const proxy of this.proxies) {
      proxy.notifyDisconnect(info);
    }
  }
}

export class HermesSharedClient implements AcpClient {
  private disconnectHandler: ((info: DisconnectInfo) => void) | null = null;

  constructor(
    private readonly service: HermesSharedRuntimeService,
    private readonly config: AgentConfig,
    private readonly handlers: ProtocolHandlers
  ) {
    this.service.registerProxy(this);
  }

  get lifecycleSnapshot() {
    return this.service.getLifecycleSnapshot();
  }

  async start(): Promise<InitializeResponse> {
    return await this.service.ensureStarted(this.config);
  }

  async createSession(params: CreateSessionParams): Promise<NewSessionResponse> {
    return await this.service.createSession(this, params, this.handlers);
  }

  async loadSession(params: LoadSessionParams): Promise<LoadSessionResponse> {
    return await this.service.loadSession(this, params, this.handlers);
  }

  async forkSession(params: ForkSessionParams): Promise<ForkSessionResponse> {
    return await this.service.forkSession(this, params, this.handlers);
  }

  async prompt(sessionId: string, content: PromptContent): Promise<PromptResponse> {
    return await this.service.prompt(sessionId, content);
  }

  async cancel(sessionId: string): Promise<void> {
    await this.service.cancel(sessionId);
  }

  async closeSession(sessionId: string): Promise<void> {
    await this.service.closeSession(sessionId);
  }

  async setModel(sessionId: string, modelId: string): Promise<void> {
    await this.service.setModel(sessionId, modelId);
  }

  async setMode(sessionId: string, modeId: string): Promise<void> {
    await this.service.setMode(sessionId, modeId);
  }

  async setConfigOption(sessionId: string, id: string, value: string | boolean): Promise<void> {
    await this.service.setConfigOption(sessionId, id, value);
  }

  async extMethod(method: string, params: Record<string, unknown>): Promise<unknown> {
    return await this.service.extMethod(method, params);
  }

  async authenticate(methodId: string): Promise<unknown> {
    return await this.service.authenticate(methodId);
  }

  onDisconnect(handler: (info: DisconnectInfo) => void): void {
    this.disconnectHandler = handler;
  }

  notifyDisconnect(info: DisconnectInfo): void {
    this.disconnectHandler?.(info);
  }

  async close(): Promise<void> {
    await this.service.closeProxy(this);
  }
}
