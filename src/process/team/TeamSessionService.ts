// src/process/team/TeamSessionService.ts
import { ipcBridge } from '@/common';
import { uuid } from '@/common/utils';
import {
  buildAgentConversationParams,
  getConversationTypeForBackend,
} from '@/common/utils/buildAgentConversationParams';
import {
  loadPresetAssistantResources,
  type PresetAssistantResourceDeps,
} from '@/common/utils/presetAssistantResources';
import type { ITeamRepository } from './repository/ITeamRepository';
import type { IWorkerTaskManager } from '@process/task/IWorkerTaskManager';
import type { IConversationService } from '@process/services/IConversationService';
import type { AgentType } from '@process/task/agentTypes';
import type { AcpInitializeResult, AgentBackend } from '@/common/types/acpTypes';
import type { TChatConversation, TProviderWithModel } from '@/common/config/storage';
import { ProcessConfig } from '@process/utils/initStorage';
import { getAssistantsDir } from '@process/utils/initStorage';
import { TeamCapabilityResolver } from '@/common/team/TeamCapabilityResolver';
import type { TeamCapabilityOverrides } from '@/common/team/TeamCapabilityResolver';
import { CompatibilityMailboxSessionBootstrap } from '@process/team-runtime/compat';
import {
  TeamDiagnosticsService,
  TeamEventStore,
  TeamRuntimeSnapshotStore,
  type TeamRuntimeDiagnostics,
} from '@process/team-runtime/diagnostics';
import {
  attachExecutionRecovery,
  TeamRecoveryCoordinator,
  type TeamRecoveryExecutionResult,
  type TeamRecoveryPreparation,
} from '@process/team-runtime/recovery';
import { HermesNativeOrchestrationEngine } from '@process/team-runtime/HermesNativeOrchestrationEngine';
import { ProtocolCoordinatedEngine } from '@process/team-runtime/ProtocolCoordinatedEngine';
import { GatewayCoordinatedEngine } from '@process/team-runtime/GatewayCoordinatedEngine';
import {
  HermesNativeSessionBootstrap,
  HermesNativeSessionFactory,
} from '@process/team-runtime/hermes';
import type { ITeamExecutionSession, TeamExecutionContext } from '@process/team-runtime/ITeamExecutionSession';
import type { TeamEngineSelection } from '@process/team-runtime/TeamOrchestrationEngineSelector';
import { LegacyMailboxEngine } from '@process/team-runtime/LegacyMailboxEngine';
import { TeamExecutionPlane } from '@process/team-runtime/TeamExecutionPlane';
import { TeamOrchestrationEngineSelector } from '@process/team-runtime/TeamOrchestrationEngineSelector';
import {
  LegacyMailboxSessionBootstrap,
  LegacyMailboxSessionFactory,
} from '@process/team-runtime/legacy';
import { AcpMemberAdapter, type ProtocolEventSink, ProtocolSessionFactory } from '@process/team-runtime/protocol';
import {
  OpenClawMemberAdapter,
  GatewaySessionFactory,
  GatewayNativeSessionBootstrapDriver,
  GatewaySessionBootstrap,
  OpenClawGatewayRuntimeAdapter,
  type GatewayEventSink,
} from '@process/team-runtime/gateway';
import type { TeamExecutionInfo } from '@process/team-runtime/ITeamExecutionSession';
import type { TTeam, TeamAgent } from './types';
import { mirrorTeamListChanged } from '@process/core/team';
import fs from 'fs/promises';
import path from 'path';
import { resolveLocaleKey } from '@/common/utils';

export class TeamSessionService {
  /** Per-team mutex to serialize addAgent calls, preventing read-modify-write race conditions */
  private readonly addAgentLocks: Map<string, Promise<unknown>> = new Map();
  private readonly pendingExecutionSelections: Map<string, TeamEngineSelection> = new Map();
  private cachedTeamCapabilityInitResults: Awaited<ReturnType<typeof ProcessConfig.get>> | undefined;
  private readonly legacyMailboxEngine: LegacyMailboxEngine;
  private readonly hermesNativeEngine: HermesNativeOrchestrationEngine;
  private readonly protocolEngine: ProtocolCoordinatedEngine;
  private readonly gatewayEngine: GatewayCoordinatedEngine;
  private readonly engineSelector: TeamOrchestrationEngineSelector;
  private readonly executionPlane: TeamExecutionPlane<ITeamExecutionSession>;
  private readonly legacySessionFactory: LegacyMailboxSessionFactory;
  private readonly hermesNativeSessionFactory: HermesNativeSessionFactory;
  private readonly protocolSessionFactory: ProtocolSessionFactory;
  private readonly gatewaySessionFactory: GatewaySessionFactory;
  private readonly compatibilitySessionBootstrap: CompatibilityMailboxSessionBootstrap;
  private readonly legacySessionBootstrap: LegacyMailboxSessionBootstrap;
  private readonly hermesNativeSessionBootstrap: HermesNativeSessionBootstrap;
  private readonly gatewaySessionBootstrap: GatewaySessionBootstrap;
  private readonly gatewayNativeSessionBootstrapDriver: GatewayNativeSessionBootstrapDriver;
  private readonly diagnosticsService: TeamDiagnosticsService;
  private readonly recoveryCoordinator: TeamRecoveryCoordinator;
  private readonly acpMemberAdapter: AcpMemberAdapter;
  private readonly openClawMemberAdapter: OpenClawMemberAdapter;
  private readonly openClawGatewayRuntimeAdapter: OpenClawGatewayRuntimeAdapter;
  private gatewayNativeResumeMode: 'off' | 'enabled' = 'off';
  private teamCapabilityOverrides: TeamCapabilityOverrides | null = null;

  constructor(
    private readonly repo: ITeamRepository,
    private readonly workerTaskManager: IWorkerTaskManager,
    private readonly conversationService: IConversationService,
    options?: {
      diagnosticsService?: TeamDiagnosticsService;
    }
  ) {
    this.acpMemberAdapter = new AcpMemberAdapter();
    this.openClawMemberAdapter = new OpenClawMemberAdapter();
    this.openClawGatewayRuntimeAdapter = new OpenClawGatewayRuntimeAdapter(this.workerTaskManager);
    this.legacySessionFactory = new LegacyMailboxSessionFactory({
      repo: this.repo,
      workerTaskManager: this.workerTaskManager,
      conversationService: this.conversationService,
      addAgent: (teamId, agent) => this.addAgent(teamId, agent),
      resolveWorkerBackend: (agentType, agents) => this.resolveWorkerBackend(agentType, agents),
      resolveConversationType: (agentType) => this.resolveConversationType(agentType),
      createProtocolEventSink: (teamId) => this.createProtocolEventSink(teamId),
      createGatewayEventSink: (teamId) => this.createGatewayEventSink(teamId),
    });
    this.compatibilitySessionBootstrap = new CompatibilityMailboxSessionBootstrap({
      conversationService: this.conversationService,
      workerTaskManager: this.workerTaskManager,
    });
    this.diagnosticsService =
      options?.diagnosticsService ??
      new TeamDiagnosticsService({
        repo: this.repo,
        eventStore: new TeamEventStore(),
        snapshotStore: new TeamRuntimeSnapshotStore(),
      });
    this.legacyMailboxEngine = new LegacyMailboxEngine({
      createExecutionSession: (params) =>
        this.legacySessionFactory.create(params.team, {
          executionKind: 'legacy_mailbox',
          orchestrationMode: 'legacy_mailbox',
          context: params.executionMetadata?.context,
          diagnostics: this.mergeExecutionDiagnostics(params.executionMetadata),
        }),
    });
    this.legacySessionBootstrap = new LegacyMailboxSessionBootstrap({
      repo: this.repo,
      compatibilityBootstrap: this.compatibilitySessionBootstrap,
      executionEngine: this.legacyMailboxEngine.kind,
      orchestrationMode: this.legacyMailboxEngine.orchestrationMode,
    });
    this.hermesNativeSessionFactory = new HermesNativeSessionFactory({
      createCompatibilitySession: (params) =>
        this.legacySessionFactory.create(params.team, {
          executionKind: 'legacy_mailbox',
          orchestrationMode: 'legacy_mailbox',
          context: {
            compatibilityMode: 'native_compatibility_bridge',
            ...params.executionMetadata?.context,
          },
          diagnostics: this.mergeExecutionDiagnostics(params.executionMetadata),
        }),
    });
    this.protocolSessionFactory = new ProtocolSessionFactory({
      acpAdapter: this.acpMemberAdapter,
      createCompatibilitySession: (params) =>
        this.legacySessionFactory.create(params.team, {
          executionKind: 'protocol',
          orchestrationMode: 'protocol_coordinated',
          context: {
            ...params.executionMetadata?.context,
          },
          diagnostics: this.mergeExecutionDiagnostics(params.executionMetadata),
        }),
    });
    this.gatewaySessionFactory = new GatewaySessionFactory({
      gatewayAdapter: this.openClawMemberAdapter,
      gatewayRuntimeAdapter: this.openClawGatewayRuntimeAdapter,
      createCompatibilitySession: (params) =>
        this.legacySessionFactory.create(params.team, {
          executionKind: 'gateway',
          orchestrationMode: 'gateway_coordinated',
          context: {
            ...params.executionMetadata?.context,
          },
          diagnostics: this.mergeExecutionDiagnostics(params.executionMetadata),
        }),
    });
    this.hermesNativeEngine = new HermesNativeOrchestrationEngine({
      sessionFactory: this.hermesNativeSessionFactory,
    });
    this.protocolEngine = new ProtocolCoordinatedEngine({
      sessionFactory: this.protocolSessionFactory,
    });
    this.gatewayEngine = new GatewayCoordinatedEngine({
      sessionFactory: this.gatewaySessionFactory,
    });
    this.hermesNativeSessionBootstrap = new HermesNativeSessionBootstrap({
      repo: this.repo,
      compatibilityBootstrap: this.compatibilitySessionBootstrap,
    });
    this.gatewayNativeSessionBootstrapDriver = new GatewayNativeSessionBootstrapDriver({
      conversationService: this.conversationService,
      workerTaskManager: this.workerTaskManager,
      gatewayRuntimeAdapter: this.openClawGatewayRuntimeAdapter,
    });
    this.gatewaySessionBootstrap = new GatewaySessionBootstrap({
      repo: this.repo,
      nativeDriver: this.gatewayNativeSessionBootstrapDriver,
      createGatewayEventSink: (teamId) => this.createGatewayEventSink(teamId),
    });
    this.engineSelector = new TeamOrchestrationEngineSelector({
      legacyEngine: this.legacyMailboxEngine,
      hermesNativeEngine: this.hermesNativeEngine,
      protocolEngine: this.protocolEngine,
      gatewayEngine: this.gatewayEngine,
    });
    this.executionPlane = new TeamExecutionPlane<ITeamExecutionSession>({
      loadTeam: async (teamId) => {
        const team = await this.getTeam(teamId);
        if (!team) throw new Error(`Team "${teamId}" not found`);
        return team;
      },
      createSession: async (team) => this.createSelectedRuntimeSession(team),
      initializeSession: async (team, session) => this.initializeSelectedRuntimeSession(team, session),
    });
    this.recoveryCoordinator = new TeamRecoveryCoordinator({
      getLiveSession: (teamId) => this.executionPlane.getSession(teamId),
      startSession: async (teamId) => this.getOrStartSession(teamId),
      loadExecutionInfo: async (teamId) => this.getExecutionInfo(teamId),
      getGatewayNativeResumeMode: () => this.gatewayNativeResumeMode,
    });
  }

  /**
   * Returns the workspace path as-is, or empty string when not specified.
   * An empty workspace tells the downstream agent factory (initAgent.ts) to
   * create an auto-generated temporary workspace, matching
   * the single-agent conversation behavior.
   */
  private resolveWorkspace(workspace: string | undefined): string {
    if (workspace && workspace.trim().length > 0) return workspace;
    return '';
  }

  private async resolveDefaultLokCliModel(): Promise<TProviderWithModel> {
    const configuredProviders = await ProcessConfig.get('model.config');
    const providers = Array.isArray(configuredProviders) ? configuredProviders.filter((p) => p.enabled !== false) : [];

    const provider = providers[0];
    if (!provider) {
      throw new Error('No enabled model provider for LokCLI');
    }

    const enabledModel = provider.model?.find((m: string) => provider.modelEnabled?.[m] !== false);
    return {
      ...provider,
      useModel: enabledModel || provider.model?.[0],
    } as TProviderWithModel;
  }

  private async resolveConversationModel(params: {
    backend: string;
    isPreset: boolean;
    presetAgentType?: string;
  }): Promise<TProviderWithModel> {
    const { backend, isPreset, presetAgentType } = params;
    const type = getConversationTypeForBackend(isPreset ? presetAgentType || backend : backend);

    if (type === 'lokcli' || type === 'aionrs') {
      return this.resolveDefaultLokCliModel();
    }

    return {} as TProviderWithModel;
  }

  private async resolvePreferredAcpModelId(agentType: string): Promise<string | undefined> {
    const acpConfig = await ProcessConfig.get('acp.config');
    const preferredModelId = (acpConfig as Record<string, { preferredModelId?: string } | undefined> | undefined)?.[
      agentType
    ]?.preferredModelId;
    if (typeof preferredModelId === 'string' && preferredModelId.trim().length > 0) {
      return preferredModelId;
    }

    const cachedModels = await ProcessConfig.get('acp.cachedModels');
    const cachedModelId = cachedModels?.[agentType]?.currentModelId;
    if (typeof cachedModelId === 'string' && cachedModelId.trim().length > 0) {
      return cachedModelId;
    }

    return undefined;
  }

  private async findBuiltinResourceDir(resourceType: 'rules' | 'skills'): Promise<string> {
    const base = process.cwd();
    const devDir = resourceType === 'skills' ? 'src/process/resources/skills' : resourceType;
    const candidates = [path.join(base, devDir), path.join(base, '..', devDir), path.join(base, resourceType)];

    for (const candidate of candidates) {
      try {
        await fs.access(candidate);
        return candidate;
      } catch {
        // Try next candidate
      }
    }

    return candidates[0];
  }

  private async readAssistantResource(
    resourceType: 'rules' | 'skills',
    assistantId: string,
    locale: string
  ): Promise<string> {
    const assistantsDir = getAssistantsDir();
    const locales = [locale, 'en-US', 'zh-CN'].filter((value, index, values) => values.indexOf(value) === index);
    const fileName = (targetLocale: string) =>
      resourceType === 'rules' ? `${assistantId}.${targetLocale}.md` : `${assistantId}-skills.${targetLocale}.md`;

    for (const currentLocale of locales) {
      try {
        return await fs.readFile(path.join(assistantsDir, fileName(currentLocale)), 'utf-8');
      } catch {
        // Try next locale
      }
    }

    const builtinDir = await this.findBuiltinResourceDir(resourceType);
    for (const currentLocale of locales) {
      try {
        return await fs.readFile(path.join(builtinDir, fileName(currentLocale)), 'utf-8');
      } catch {
        // Try next locale
      }
    }

    return '';
  }

  private async loadPresetResources(
    customAgentId: string
  ): Promise<{ rules?: string; enabledSkills?: string[]; excludeBuiltinSkills?: string[] }> {
    const language = await ProcessConfig.get('language');
    const localeKey = resolveLocaleKey(language || 'en-US');
    const deps: PresetAssistantResourceDeps = {
      readAssistantRule: ({ assistantId, locale }) => this.readAssistantResource('rules', assistantId, locale),
      readAssistantSkill: ({ assistantId, locale }) => this.readAssistantResource('skills', assistantId, locale),
      readBuiltinRule: async ({ fileName }) => {
        const builtinDir = await this.findBuiltinResourceDir('rules');
        return fs.readFile(path.join(builtinDir, path.basename(fileName)), 'utf-8');
      },
      readBuiltinSkill: async ({ fileName }) => {
        const builtinDir = await this.findBuiltinResourceDir('skills');
        return fs.readFile(path.join(builtinDir, path.basename(fileName)), 'utf-8');
      },
      getEnabledSkills: async (assistantId) => {
        const customAgents = await ProcessConfig.get('assistants');
        return customAgents?.find((agent) => agent.id === assistantId)?.enabledSkills;
      },
      getDisabledBuiltinSkills: async (assistantId) => {
        const customAgents = await ProcessConfig.get('assistants');
        return customAgents?.find((agent) => agent.id === assistantId)?.disabledBuiltinSkills;
      },
      warn: (message, error) => {
        console.warn(message, error);
      },
    };
    const resources = await loadPresetAssistantResources({ customAgentId, localeKey }, deps);

    return {
      rules: resources.rules,
      enabledSkills: resources.enabledSkills,
      excludeBuiltinSkills: resources.disabledBuiltinSkills,
    };
  }

  private async getTeamCapabilityInitResults() {
    if (this.cachedTeamCapabilityInitResults === undefined) {
      this.cachedTeamCapabilityInitResults = (await ProcessConfig.get(
        'acp.cachedInitializeResult'
      )) as Record<string, AcpInitializeResult> | null | undefined;
    }
    return this.cachedTeamCapabilityInitResults as Record<string, AcpInitializeResult> | null | undefined;
  }

  private normalizeLegacyTeamBackend(agentType: string | undefined): string | undefined {
    const normalized = agentType?.trim();
    if (!normalized) return normalized;
    if (normalized === 'gemini' || normalized === 'aionrs') {
      return 'hermes';
    }
    if (normalized === 'openclaw') {
      return 'openclaw-gateway';
    }
    return normalized;
  }

  private async refreshTeamRuntimeConfig(): Promise<void> {
    this.gatewayNativeResumeMode =
      ((await ProcessConfig.get('team.runtime.gatewayNativeResume')) as 'off' | 'enabled' | undefined) ?? 'off';
    this.teamCapabilityOverrides =
      ((await ProcessConfig.get('team.capabilityOverrides')) as TeamCapabilityOverrides | null | undefined) ?? null;
  }

  private async resolveLeaderBackend(agentType: string | undefined): Promise<string> {
    await this.refreshTeamRuntimeConfig();
    const normalized = this.normalizeLegacyTeamBackend(agentType);
    if (normalized && normalized !== 'acp') {
      return normalized;
    }
    const cachedInitResults = await this.getTeamCapabilityInitResults();
    return TeamCapabilityResolver.pickPreferredLeaderBackend(
      undefined,
      cachedInitResults,
      this.teamCapabilityOverrides,
      'hermes'
    );
  }

  private async resolveWorkerBackend(agentType: string | undefined, agents: TeamAgent[]): Promise<string> {
    await this.refreshTeamRuntimeConfig();
    const normalized = this.normalizeLegacyTeamBackend(agentType);
    if (normalized && normalized !== 'acp') {
      return normalized;
    }
    const leader = agents.find((a) => a.role === 'leader');
    const cachedInitResults = await this.getTeamCapabilityInitResults();
    return TeamCapabilityResolver.pickPreferredWorkerBackend({
      backend: undefined,
      leaderBackend: leader?.agentType,
      cachedInitResults,
      overrides: this.teamCapabilityOverrides,
      fallback: 'hermes',
    });
  }

  private async validateRuntimeAgentRole(agent: Pick<TeamAgent, 'role' | 'agentType' | 'agentName'>): Promise<void> {
    const cachedInitResults = await this.getTeamCapabilityInitResults();
    const capabilities = TeamCapabilityResolver.resolve(
      agent.agentType,
      cachedInitResults,
      this.teamCapabilityOverrides
    );

    if (!capabilities.currentlySupported) {
      throw new Error(
        `Agent "${agent.agentName}" (${agent.agentType}) is not supported in the current team runtime. ${TeamCapabilityResolver.formatSupportHint(
          capabilities
        )}`
      );
    }

    if (agent.role === 'leader' && !capabilities.leaderRecommended) {
      throw new Error(
        `Agent "${agent.agentName}" (${agent.agentType}) cannot act as a team leader. ${TeamCapabilityResolver.formatSupportHint(
          capabilities
        )}`
      );
    }

    if (agent.role !== 'leader' && !capabilities.workerRecommended) {
      throw new Error(
        `Agent "${agent.agentName}" (${agent.agentType}) cannot act as a teammate worker. ${TeamCapabilityResolver.formatSupportHint(
          capabilities
        )}`
      );
    }
  }

  private async buildConversationParams(params: {
    teamId: string;
    teamName: string;
    workspace: string;
    agent: Omit<TeamAgent, 'slotId'> | TeamAgent;
    agents: TeamAgent[];
    inheritedSessionMode?: string;
    /** When true, workspace was inherited (not user-specified) — setupAssistantWorkspace should still run */
    isInheritedWorkspace?: boolean;
  }): Promise<{
    type: AgentType;
    name: string;
    model: TProviderWithModel;
    extra: Record<string, unknown>;
  }> {
    const { teamId, teamName, workspace, agent, agents, inheritedSessionMode, isInheritedWorkspace } = params;
    const backend =
      agent.role === 'leader'
        ? ((await this.resolveLeaderBackend(agent.agentType)) as AgentBackend)
        : ((await this.resolveWorkerBackend(agent.agentType, agents)) as AgentBackend);
    // remote agents use customAgentId as remoteAgentId, not as a preset indicator
    const isPreset = Boolean(agent.customAgentId) && backend !== 'remote';
    const preferredModelId =
      agent.model ||
      (getConversationTypeForBackend(backend) === 'acp' ? await this.resolvePreferredAcpModelId(backend) : undefined);
    const presetResources =
      isPreset && agent.customAgentId ? await this.loadPresetResources(agent.customAgentId) : undefined;
    let model = await this.resolveConversationModel({
      backend,
      isPreset,
      presetAgentType: isPreset ? backend : undefined,
    });

    // Override useModel for Gemini/Aionrs when agent has an explicit model
    if (agent.model) {
      const type = getConversationTypeForBackend(backend);
      if (type === 'gemini' || type === 'aionrs' || type === 'lokcli') {
        model = { ...model, useModel: agent.model };
      }
    }

    return buildAgentConversationParams({
      backend,
      name: `${teamName} - ${agent.agentName}`,
      agentName: agent.agentName,
      workspace,
      customWorkspace: Boolean(workspace) && !isInheritedWorkspace,
      model,
      cliPath: agent.cliPath,
      customAgentId: agent.customAgentId,
      isPreset,
      presetAgentType: isPreset ? backend : undefined,
      presetResources,
      sessionMode: inheritedSessionMode,
      currentModelId: preferredModelId,
      extra: {
        teamId,
      },
    }) as {
      type: AgentType;
      name: string;
      model: TProviderWithModel;
      extra: Record<string, unknown>;
    };
  }

  private extractRecoveredSlotId(
    extra: { teamMcpStdioConfig?: { env?: Array<{ name?: string; value?: string }> } } | undefined
  ): string | undefined {
    return extra?.teamMcpStdioConfig?.env?.find((entry) => entry.name === 'TEAM_AGENT_SLOT_ID')?.value;
  }

  private resolveRecoveredAgentType(conversation: TChatConversation): string | undefined {
    switch (conversation.type) {
      case 'gemini':
        return 'hermes';
      case 'lokcli':
        return ((conversation.extra as { backend?: string } | undefined)?.backend || 'hermes') as string;
      case 'aionrs':
        return 'hermes';
      case 'remote':
        return 'remote';
      case 'nanobot':
        return 'nanobot';
      case 'openclaw-gateway':
        return (conversation.extra as { backend?: string } | undefined)?.backend || 'openclaw-gateway';
      case 'acp':
        return (conversation.extra as { backend?: string } | undefined)?.backend;
      default:
        return undefined;
    }
  }

  private resolveRecoveredAgentName(team: TTeam, conversation: TChatConversation, isLead: boolean): string {
    const extra = conversation.extra as { agentName?: string } | undefined;
    const explicitName = extra?.agentName?.trim();
    if (explicitName) return explicitName;

    const prefix = `${team.name} - `;
    if (conversation.name.startsWith(prefix)) {
      const derivedName = conversation.name.slice(prefix.length).trim();
      if (derivedName) return derivedName;
    }

    return isLead ? 'Leader' : 'Teammate';
  }

  private mapRecoveredStatus(status: TChatConversation['status']): TeamAgent['status'] {
    switch (status) {
      case 'running':
        return 'active';
      case 'finished':
        return 'idle';
      default:
        return 'pending';
    }
  }

  private buildRecoveredAgent(team: TTeam, conversation: TChatConversation): TeamAgent | null {
    const extra = conversation.extra as {
      cliPath?: string;
      customAgentId?: string;
      presetAssistantId?: string;
      gateway?: { cliPath?: string };
      teamMcpStdioConfig?: { env?: Array<{ name?: string; value?: string }> };
      currentModelId?: string;
    };
    const slotId = this.extractRecoveredSlotId(extra);
    const agentType = this.resolveRecoveredAgentType(conversation);
    if (!slotId || !agentType) return null;

    const isLeader = slotId === team.leaderAgentId;
    return {
      slotId,
      conversationId: conversation.id,
      role: isLeader ? 'leader' : 'teammate',
      agentType,
      agentName: this.resolveRecoveredAgentName(team, conversation, isLeader),
      conversationType: conversation.type,
      status: this.mapRecoveredStatus(conversation.status),
      cliPath: extra.cliPath || extra.gateway?.cliPath,
      customAgentId: extra.customAgentId || extra.presetAssistantId,
      model: extra.currentModelId || (conversation as { model?: { useModel?: string } }).model?.useModel,
    };
  }

  private async repairTeamAgentsIfMissing(team: TTeam): Promise<TTeam> {
    if (team.agents.length > 0) return team;

    const conversations = await this.conversationService.listAllConversations();
    const linkedConversations = conversations
      .filter((conversation) => (conversation.extra as { teamId?: string } | undefined)?.teamId === team.id)
      .toSorted((left, right) => (right.modifyTime ?? 0) - (left.modifyTime ?? 0));

    if (linkedConversations.length === 0) return team;

    const recoveredBySlot = new Map<string, TeamAgent>();
    for (const conversation of linkedConversations) {
      const recovered = this.buildRecoveredAgent(team, conversation);
      if (recovered && !recoveredBySlot.has(recovered.slotId)) {
        recoveredBySlot.set(recovered.slotId, recovered);
      }
    }

    const recoveredAgents = [...recoveredBySlot.values()];
    if (recoveredAgents.length === 0) return team;

    let repairedAgents = recoveredAgents;
    if (!repairedAgents.some((agent) => agent.role === 'leader')) {
      repairedAgents = repairedAgents.map((agent, index) => ({
        ...agent,
        role: index === 0 ? 'leader' : 'teammate',
      }));
    }

    repairedAgents = repairedAgents.toSorted((left, right) => {
      if (left.role === right.role) return left.agentName.localeCompare(right.agentName);
      return left.role === 'leader' ? -1 : 1;
    });

    const repairedLead = repairedAgents.find((agent) => agent.role === 'leader') ?? repairedAgents[0];
    const repairedTeam: TTeam = {
      ...team,
      leaderAgentId: repairedLead.slotId,
      agents: repairedAgents,
      updatedAt: Date.now(),
    };

    try {
      await this.repo.update(team.id, {
        agents: repairedTeam.agents,
        leaderAgentId: repairedTeam.leaderAgentId,
        updatedAt: repairedTeam.updatedAt,
      });
    } catch (error) {
      console.warn(`[TeamSessionService] Failed to persist repaired agents for team ${team.id}:`, error);
    }

    return repairedTeam;
  }

  async createTeam(params: {
    userId: string;
    name: string;
    workspace: string;
    workspaceMode: TTeam['workspaceMode'];
    agents: TeamAgent[];
    sessionMode?: string;
  }): Promise<TTeam> {
    const now = Date.now();
    const teamId = uuid(36);
    let workspace = this.resolveWorkspace(params.workspace);
    await this.refreshTeamRuntimeConfig();
    const normalizedAgents = await Promise.all(
      params.agents.map(async (agent) => ({
        ...agent,
        agentType:
          agent.role === 'leader'
            ? await this.resolveLeaderBackend(agent.agentType)
            : await this.resolveWorkerBackend(agent.agentType, params.agents),
        }))
    );
    for (const agent of normalizedAgents) {
      await this.validateRuntimeAgentRole(agent);
    }

    // Create a real conversation for each agent (or reuse an existing one for the leader)
    const agentsWithConversations = await Promise.all(
      normalizedAgents.map(async (agent) => {
        const slotId = agent.slotId || `slot-${uuid(8)}`;

        // If the agent already has a conversationId (e.g., leader reusing caller's conversation),
        // verify it exists and adopt it into the team instead of creating a new conversation.
        if (agent.conversationId) {
          const existing = await this.conversationService.getConversation(agent.conversationId);
          if (existing) {
            // Only include workspace in the update when it has a real value.
            // An empty string would overwrite the conversation's existing workspace
            // (e.g. the temp dir created during solo-chat init), causing mkdir('') failures.
            const extraUpdate: Record<string, unknown> = { teamId };
            if (workspace) {
              extraUpdate.workspace = workspace;
            }
            await this.conversationService.updateConversation(
              agent.conversationId,
              { extra: extraUpdate } as any,
              true
            );
            return { ...agent, slotId, conversationId: agent.conversationId };
          }
          // Fall through to create new if conversation was not found
        }

        const conversationParams = await this.buildConversationParams({
          teamId,
          teamName: params.name,
          workspace,
          agent,
          agents: normalizedAgents,
          inheritedSessionMode: params.sessionMode,
          isInheritedWorkspace: !params.workspace,
        });
        const conversation = await this.conversationService.createConversation(conversationParams);
        // Ensure teamId is in extra regardless of which factory function was used.
        // Some legacy factories drop unknown extra fields during conversation creation.
        await this.conversationService.updateConversation(conversation.id, { extra: { teamId } } as any, true);
        return { ...agent, slotId, conversationId: conversation.id };
      })
    );

    const leadAgent = agentsWithConversations.find((a) => a.role === 'leader');

    // If workspace was not specified, back-fill from the leader agent's actual conversation workspace.
    // The conversation factory may auto-assign a workspace (stored in extra.workspace), and we need
    // TTeam.workspace to reflect that so all subsequent addAgent calls share the same directory.
    if (!workspace && leadAgent?.conversationId) {
      const leadConv = await this.conversationService.getConversation(leadAgent.conversationId);
      const leadExtra = leadConv?.extra as Record<string, unknown> | undefined;
      if (leadExtra?.workspace && typeof leadExtra.workspace === 'string') {
        workspace = leadExtra.workspace;
      }
    }
    if (!leadAgent) throw new Error('Team must have at least one leader agent');

    const team: TTeam = {
      id: teamId,
      userId: params.userId,
      name: params.name,
      workspace,
      workspaceMode: params.workspaceMode,
      leaderAgentId: leadAgent.slotId,
      agents: agentsWithConversations,
      orchestrationMode: this.legacyMailboxEngine.orchestrationMode,
      executionEngine: this.legacyMailboxEngine.kind,
      sessionMode: params.sessionMode,
      createdAt: now,
      updatedAt: now,
    };
    await this.repo.create(team);
    return team;
  }

  async getTeam(id: string): Promise<TTeam | null> {
    const team = await this.repo.findById(id);
    if (!team) return null;
    return this.repairTeamAgentsIfMissing(team);
  }

  async listTeams(userId: string): Promise<TTeam[]> {
    return this.repo.findAll(userId);
  }

  async deleteTeam(id: string): Promise<void> {
    // Kill all agent processes before disposing session and deleting data.
    // This prevents orphan processes that keep running after the team is deleted.
    const team = await this.repo.findById(id);
    if (team) {
      const killResults = await Promise.allSettled(
        team.agents
          .filter((agent) => agent.conversationId)
          .map((agent) => {
            this.workerTaskManager.kill(agent.conversationId, 'team_deleted');
            return Promise.resolve();
          })
      );
      killResults.forEach((r) => {
        if (r.status === 'rejected') {
          console.warn(`[TeamSessionService] Failed to kill agent process:`, r.reason);
        }
      });
    }

    await this.executionPlane.stopSession(id);

    // Delete conversations owned by this team's agents
    if (team) {
      const results = await Promise.allSettled(
        team.agents
          .filter((agent) => agent.conversationId)
          .map((agent) => this.conversationService.deleteConversation(agent.conversationId))
      );
      results.forEach((r) => {
        if (r.status === 'rejected') {
          console.warn(`[TeamSessionService] Failed to delete conversation:`, r.reason);
        }
      });
    }

    await this.repo.deleteMailboxByTeam(id);
    await this.repo.deleteTasksByTeam(id);
    await this.repo.delete(id);
  }

  async addAgent(teamId: string, agent: Omit<TeamAgent, 'slotId'>): Promise<TeamAgent> {
    // Serialize per-team to prevent concurrent read-modify-write races on the agents array.
    // Without this lock, parallel team_spawn_agent calls read the same stale agents list,
    // and the last writer wins — silently dropping agents added by concurrent calls.
    const prev = this.addAgentLocks.get(teamId) ?? Promise.resolve();
    let resolve!: () => void;
    const lock = new Promise<void>((r) => {
      resolve = r;
    });
    this.addAgentLocks.set(teamId, lock);
    try {
      await prev;
      return await this.addAgentUnsafe(teamId, agent);
    } finally {
      resolve();
      // Clean up the lock entry when it's the last in the chain
      if (this.addAgentLocks.get(teamId) === lock) {
        this.addAgentLocks.delete(teamId);
      }
    }
  }

  private async addAgentUnsafe(teamId: string, agent: Omit<TeamAgent, 'slotId'>): Promise<TeamAgent> {
    const team = await this.repo.findById(teamId);
    if (!team) throw new Error(`Team "${teamId}" not found`);
    await this.refreshTeamRuntimeConfig();
    const resolvedAgentType =
      agent.role === 'leader'
        ? await this.resolveLeaderBackend(agent.agentType)
        : await this.resolveWorkerBackend(agent.agentType, team.agents);
    await this.validateRuntimeAgentRole({
      role: agent.role,
      agentType: resolvedAgentType,
      agentName: agent.agentName,
    });

    const workspace = this.resolveWorkspace(team.workspace);
    // Inherit sessionMode: prefer persisted team.sessionMode, fallback to leader agent's conversation extra
    let inheritedSessionMode: string | undefined = team.sessionMode;
    if (!inheritedSessionMode) {
      const leadAgent = team.agents.find((a) => a.role === 'leader');
      if (leadAgent?.conversationId) {
        const leadConv = await this.conversationService.getConversation(leadAgent.conversationId);
        const leadExtra = leadConv?.extra as Record<string, unknown> | undefined;
        if (leadExtra?.sessionMode && typeof leadExtra.sessionMode === 'string') {
          inheritedSessionMode = leadExtra.sessionMode;
        }
      }
    }

    const conversationParams = await this.buildConversationParams({
      teamId,
      teamName: team.name,
      workspace,
      agent: { ...agent, agentType: resolvedAgentType },
      agents: team.agents,
      inheritedSessionMode,
      isInheritedWorkspace: true,
    });
    const conversation = await this.conversationService.createConversation(conversationParams);
    // Ensure teamId is in extra regardless of which factory function was used
    await this.conversationService.updateConversation(conversation.id, { extra: { teamId } } as any, true);

    const newAgent: TeamAgent = {
      ...agent,
      agentType: resolvedAgentType,
      slotId: `slot-${uuid(8)}`,
      conversationId: conversation.id,
    };
    const updatedAgents = [...team.agents, newAgent];
    await this.repo.update(teamId, { agents: updatedAgents, updatedAt: Date.now() });
    this.executionPlane.getSession(teamId)?.addAgent(newAgent);
    // Notify renderer so SWR caches (useTeamList, useSiderTeamBadges) revalidate
    const listEvent = { teamId, action: 'agent_added' as const };
    ipcBridge.team.listChanged.emit(listEvent);
    mirrorTeamListChanged(listEvent);
    return newAgent;
  }

  private resolveConversationType(agentType: string): AgentType {
    if (agentType === 'gemini') return 'lokcli';
    if (agentType === 'hermes') return 'lokcli';
    if (agentType === 'aionrs') return 'lokcli';
    if (agentType === 'codex') return 'acp';
    if (agentType === 'openclaw-gateway') return 'openclaw-gateway';
    if (agentType === 'nanobot') return 'nanobot';
    if (agentType === 'remote') return 'remote';
    return 'acp';
  }

  private async createLegacyRuntimeSession(team: TTeam): Promise<ITeamExecutionSession> {
    return this.legacySessionFactory.create(team);
  }

  private createProtocolEventSink(teamId: string): ProtocolEventSink {
    return this.diagnosticsService.createProtocolEventSink(teamId);
  }

  private createGatewayEventSink(teamId: string): GatewayEventSink {
    return this.diagnosticsService.createGatewayEventSink(teamId);
  }

  private buildExecutionContext(team: TTeam, selection: TeamEngineSelection): TeamExecutionContext {
    const leaderBackend = team.agents.find((agent) => agent.role === 'leader')?.agentType;
    return {
      runtimeVersion: 'phase2',
      leaderBackend,
      memberCount: team.agents.length,
      engineReadiness: selection.engine.readiness,
      routingMode: selection.routingMode,
      requestedExecutionKind: selection.requestedEngine,
      compatibilityMode:
        selection.engine.kind === this.hermesNativeEngine.kind ? 'native_compatibility_bridge' : 'legacy_mailbox',
    };
  }

  private buildExecutionDiagnostics(team: TTeam, selection: TeamEngineSelection) {
    const leaderBackend = team.agents.find((agent) => agent.role === 'leader')?.agentType ?? 'unknown';
    const summary = [
      `selected_engine:${selection.engine.kind}`,
      `routing_mode:${selection.routingMode}`,
      `engine_readiness:${selection.engine.readiness}`,
      `leader_backend:${leaderBackend}`,
    ];

    if (selection.requestedEngine) {
      summary.push(`requested_engine:${selection.requestedEngine}`);
    }
    if (selection.fallbackReason) {
      summary.push(`fallback_reason:${selection.fallbackReason}`);
    }

    return {
      summary,
      fallbackReason: selection.fallbackReason,
    };
  }

  private mergeExecutionDiagnostics(
    executionMetadata:
      | {
          diagnostics?: {
            summary?: string[];
            fallbackReason?: string;
          };
          fallbackReason?: string;
        }
      | undefined
  ) {
    if (!executionMetadata?.diagnostics && !executionMetadata?.fallbackReason) return undefined;

    return {
      summary: executionMetadata?.diagnostics?.summary ?? [],
      fallbackReason: executionMetadata?.diagnostics?.fallbackReason ?? executionMetadata?.fallbackReason,
    };
  }

  private async createSelectedRuntimeSession(team: TTeam): Promise<ITeamExecutionSession> {
    const selection = await this.resolveExecutionRouting(team);
    this.pendingExecutionSelections.set(team.id, selection);
    await this.diagnosticsService.recordEvent(team.id, {
      at: Date.now(),
      type: 'routing_selected',
      level: selection.fallbackReason ? 'warning' : 'info',
      message: `Runtime routing selected ${selection.engine.kind}`,
      details: {
        requestedEngine: selection.requestedEngine,
        routingMode: selection.routingMode,
        fallbackReason: selection.fallbackReason,
      },
    });

    if (selection.engine.kind === this.hermesNativeEngine.kind) {
      console.info(
        `[TeamSessionService] Hermes native routing selected for team ${team.id} (mode=${selection.routingMode})`
      );
    } else if (selection.fallbackReason) {
      console.info(
        `[TeamSessionService] Falling back to ${selection.engine.kind} for team ${team.id}: ${selection.fallbackReason}`
      );
    }

    try {
      return await selection.engine.createSession({
        team,
        repo: this.repo,
        workerTaskManager: this.workerTaskManager,
        executionMetadata: {
          routingMode: selection.routingMode,
          requestedExecutionKind: selection.requestedEngine,
          fallbackReason: selection.fallbackReason,
          context: this.buildExecutionContext(team, selection),
          diagnostics: this.buildExecutionDiagnostics(team, selection),
        },
      });
    } catch (error) {
      this.pendingExecutionSelections.delete(team.id);
      throw error;
    }
  }

  private async resolveExecutionRouting(team: TTeam) {
    await this.refreshTeamRuntimeConfig();
    const cachedInitResults = await this.getTeamCapabilityInitResults();
    const hermesNativeRouting =
      ((await ProcessConfig.get('team.runtime.hermesNativeRouting')) as 'off' | 'shadow' | 'enabled' | undefined) ??
      'off';
    return this.engineSelector.select({
      team,
      cachedInitResults,
      hermesNativeRouting,
    });
  }

  private async initializeLegacyRuntimeSession(team: TTeam, session: ITeamExecutionSession): Promise<void> {
    await this.legacySessionBootstrap.initialize(team, session);
  }

  private async initializeSelectedRuntimeSession(team: TTeam, session: ITeamExecutionSession): Promise<void> {
    const selection = this.pendingExecutionSelections.get(team.id) ?? (await this.resolveExecutionRouting(team));

    try {
      await this.repo.update(team.id, {
        executionEngine: selection.engine.kind,
        orchestrationMode: selection.engine.orchestrationMode,
        updatedAt: Date.now(),
      });
      if (selection.engine.kind === this.hermesNativeEngine.kind) {
        await this.hermesNativeSessionBootstrap.initialize(team, session);
      } else if (selection.engine.kind === this.gatewayEngine.kind) {
        await this.gatewaySessionBootstrap.initialize(team, session);
      } else {
        await this.initializeLegacyRuntimeSession(team, session);
      }

      const executionInfo = session.getExecutionInfo();
      await this.diagnosticsService.recordEvent(team.id, {
        at: Date.now(),
        type: 'session_started',
        level: 'info',
        message: `Execution session started in ${executionInfo.executionKind}`,
        details: {
          executionKind: executionInfo.executionKind,
          orchestrationMode: executionInfo.orchestrationMode,
          state: executionInfo.state,
        },
      });
      await this.diagnosticsService.refreshSnapshot(team, executionInfo);
    } finally {
      this.pendingExecutionSelections.delete(team.id);
    }
  }

  async renameAgent(teamId: string, slotId: string, newName: string): Promise<void> {
    // Update in-memory session if running
    const session = this.executionPlane.getSession(teamId);
    if (session) {
      session.renameAgent(slotId, newName);
      return; // TeamSession.renameAgent already persists
    }
    // No active session — update DB directly
    const team = await this.repo.findById(teamId);
    if (!team) throw new Error(`Team "${teamId}" not found`);
    const updatedAgents = team.agents.map((a) => (a.slotId === slotId ? { ...a, agentName: newName.trim() } : a));
    await this.repo.update(teamId, { agents: updatedAgents, updatedAt: Date.now() });
  }

  async renameTeam(id: string, name: string): Promise<void> {
    const trimmed = name.trim();
    if (!trimmed) return;
    await this.repo.update(id, { name: trimmed, updatedAt: Date.now() });
  }

  async setSessionMode(teamId: string, sessionMode: string): Promise<void> {
    await this.repo.update(teamId, { sessionMode, updatedAt: Date.now() });
  }

  async updateWorkspace(teamId: string, newWorkspace: string): Promise<void> {
    const team = await this.repo.findById(teamId);
    if (!team) throw new Error(`Team "${teamId}" not found`);

    const now = Date.now();
    await this.repo.update(teamId, { workspace: newWorkspace, updatedAt: now });

    for (const agent of team.agents) {
      if (!agent.conversationId) continue;
      await this.conversationService.updateConversation(
        agent.conversationId,
        {
          extra: { workspace: newWorkspace, customWorkspace: true },
          modifyTime: now,
        } as Partial<TChatConversation>,
        true
      );
    }
  }

  async removeAgent(teamId: string, slotId: string): Promise<void> {
    const team = await this.repo.findById(teamId);
    if (!team) throw new Error(`Team "${teamId}" not found`);

    // removeAgent handles: kill process + clear in-memory state + persist via onAgentRemoved callback
    const session = this.executionPlane.getSession(teamId);
    if (session) {
      session.removeAgent(slotId);
    } else {
      // No active session — update DB directly
      const updatedAgents = team.agents.filter((a) => a.slotId !== slotId);
      await this.repo.update(teamId, { agents: updatedAgents, updatedAt: Date.now() });
    }
    // Notify renderer so SWR caches (useTeamList, useSiderTeamBadges) revalidate
    const listEvent = { teamId, action: 'agent_removed' as const };
    ipcBridge.team.listChanged.emit(listEvent);
    mirrorTeamListChanged(listEvent);
  }

  async getOrStartSession(teamId: string): Promise<ITeamExecutionSession> {
    try {
      return await this.executionPlane.getOrStartSession(teamId);
    } catch (err) {
      console.error(`[TeamSessionService] Failed to start session for team ${teamId}:`, err);
      throw err;
    }
  }

  async getExecutionInfo(teamId: string): Promise<TeamExecutionInfo> {
    const session = this.executionPlane.getSession(teamId);
    if (session) {
      const liveInfo = session.getExecutionInfo();
      const cachedSnapshot = await this.diagnosticsService.getCachedSnapshot(teamId);
      const lastEventAt = cachedSnapshot?.timeline.reduce<number | undefined>((latest, event) => {
        return latest === undefined || event.at > latest ? event.at : latest;
      }, undefined);
      return attachExecutionRecovery(liveInfo, {
        source: 'live_session',
        snapshotAvailable: Boolean(cachedSnapshot),
        snapshotCapturedAt: cachedSnapshot?.capturedAt,
        lastEventAt,
        lastKnownState: liveInfo.state,
      });
    }

    const team = await this.getTeam(teamId);
    if (!team) throw new Error(`Team "${teamId}" not found`);

    const recoveredDiagnostics = await this.diagnosticsService.getRecoveredDiagnostics(team);
    if (recoveredDiagnostics) {
      return recoveredDiagnostics.executionInfo;
    }

    return attachExecutionRecovery(
      {
      teamId,
      executionKind: team.executionEngine ?? this.legacyMailboxEngine.kind,
      orchestrationMode: team.orchestrationMode ?? this.legacyMailboxEngine.orchestrationMode,
      state: 'created',
      context: {
        runtimeVersion: 'phase2',
        leaderBackend: team.agents.find((agent) => agent.role === 'leader')?.agentType,
        memberCount: team.agents.length,
        compatibilityMode:
          (team.executionEngine ?? this.legacyMailboxEngine.kind) === this.hermesNativeEngine.kind
            ? 'native_compatibility_bridge'
            : 'legacy_mailbox',
      },
      diagnostics: {
        summary: [
          `selected_engine:${team.executionEngine ?? this.legacyMailboxEngine.kind}`,
          `persisted_orchestration_mode:${team.orchestrationMode ?? this.legacyMailboxEngine.orchestrationMode}`,
        ],
      },
      },
      {
        source: 'fresh',
        snapshotAvailable: false,
        lastKnownState: 'created',
      }
    );
  }

  async getRuntimeDiagnostics(teamId: string): Promise<TeamRuntimeDiagnostics> {
    const session = this.executionPlane.getSession(teamId);
    const team = await this.getTeam(teamId);
    if (!team) throw new Error(`Team "${teamId}" not found`);

    if (!session) {
      const recoveredDiagnostics = await this.diagnosticsService.getRecoveredDiagnostics(team);
      if (recoveredDiagnostics) {
        return recoveredDiagnostics;
      }
    }

    const executionInfo = await this.getExecutionInfo(teamId);
    const diagnostics = await this.diagnosticsService.getDiagnostics(team, executionInfo);
    await this.diagnosticsService.recordEvent(team.id, {
      at: Date.now(),
      type: 'diagnostics_refreshed',
      level: 'info',
      message: 'Runtime diagnostics refreshed',
      details: {
        executionKind: diagnostics.executionInfo.executionKind,
        degradedMembers: diagnostics.degradedMembers.length,
        waitingTasks: diagnostics.taskDiagnostics.waiting.length,
      },
    });
    return diagnostics;
  }

  async warmDiagnosticsRecovery(teamId: string): Promise<TeamRuntimeDiagnostics | null> {
    const session = this.executionPlane.getSession(teamId);
    if (session) {
      return this.getRuntimeDiagnostics(teamId);
    }

    const team = await this.getTeam(teamId);
    if (!team) throw new Error(`Team "${teamId}" not found`);

    const recoveredDiagnostics = await this.diagnosticsService.getRecoveredDiagnostics(team);
    if (!recoveredDiagnostics) {
      return null;
    }

    await this.diagnosticsService.recordEvent(team.id, {
      at: Date.now(),
      type: 'snapshot_recovered',
      level: 'info',
      message: 'Recovered runtime diagnostics from persisted snapshot',
      details: {
        executionKind: recoveredDiagnostics.executionInfo.executionKind,
        preferredMode: recoveredDiagnostics.executionInfo.recovery?.preferredMode,
        snapshotCapturedAt: recoveredDiagnostics.recoveredFromSnapshotAt,
      },
    });

    return recoveredDiagnostics;
  }

  async prepareRecoverySession(teamId: string): Promise<TeamRecoveryPreparation> {
    const team = await this.getTeam(teamId);
    if (!team) throw new Error(`Team "${teamId}" not found`);

    const executionInfo = await this.getExecutionInfo(teamId);
    const diagnostics = await this.loadRecoveryDiagnostics(teamId, team);
    const preparation = this.recoveryCoordinator.prepare({
      team,
      executionInfo,
      diagnostics,
    });

    await this.diagnosticsService.recordEvent(team.id, {
      at: Date.now(),
      type: 'recovery_plan_prepared',
      level: preparation.recoveryPlan.status === 'not_available' ? 'warning' : 'info',
      message: `Recovery plan prepared in ${preparation.recoveryPlan.mode}`,
      details: {
        status: preparation.recoveryPlan.status,
        mode: preparation.recoveryPlan.mode,
        blockers: preparation.recoveryPlan.blockers,
      },
    });

    return preparation;
  }

  async executeRecoveryPlan(teamId: string): Promise<TeamRecoveryExecutionResult> {
    const team = await this.getTeam(teamId);
    if (!team) throw new Error(`Team "${teamId}" not found`);

    const executionInfo = await this.getExecutionInfo(teamId);
    const diagnostics = await this.loadRecoveryDiagnostics(teamId, team);

    try {
      const result = await this.recoveryCoordinator.execute({
        team,
        executionInfo,
        diagnostics,
      });
      const refreshedDiagnostics = await this.loadRecoveryDiagnostics(teamId, team);
      const finalResult: TeamRecoveryExecutionResult = {
        ...result,
        diagnostics: refreshedDiagnostics,
      };

      await this.diagnosticsService.recordEvent(team.id, {
        at: Date.now(),
        type: 'recovery_plan_executed',
        level: finalResult.status === 'not_available' ? 'warning' : 'info',
        message: `Recovery execution completed with status ${finalResult.status}`,
        details: {
          status: finalResult.status,
          mode: finalResult.recoveryPlan.mode,
          actionsApplied: finalResult.actionsApplied,
        },
      });

      return finalResult;
    } catch (error) {
      await this.diagnosticsService.recordEvent(team.id, {
        at: Date.now(),
        type: 'recovery_plan_failed',
        level: 'error',
        message: error instanceof Error ? error.message : 'Recovery execution failed',
        details: {
          teamId,
        },
      });
      throw error;
    }
  }

  async stopSession(teamId: string): Promise<void> {
    await this.diagnosticsService.recordEvent(teamId, {
      at: Date.now(),
      type: 'session_stopped',
      level: 'info',
      message: 'Execution session stopped',
    });
    await this.executionPlane.stopSession(teamId);
  }

  async stopAllSessions(): Promise<void> {
    await this.executionPlane.stopAllSessions();
  }

  private async loadRecoveryDiagnostics(teamId: string, team: TTeam): Promise<TeamRuntimeDiagnostics | null> {
    const session = this.executionPlane.getSession(teamId);
    if (!session) {
      return this.diagnosticsService.getRecoveredDiagnostics(team);
    }

    return this.getRuntimeDiagnostics(teamId);
  }
}
