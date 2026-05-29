import { describe, expect, it } from 'vitest';
import { GatewayCoordinatedEngine } from '../../src/process/team-runtime/GatewayCoordinatedEngine';
import { LegacyMailboxEngine } from '../../src/process/team-runtime/LegacyMailboxEngine';
import { HermesNativeOrchestrationEngine } from '../../src/process/team-runtime/HermesNativeOrchestrationEngine';
import { ProtocolCoordinatedEngine } from '../../src/process/team-runtime/ProtocolCoordinatedEngine';
import { GatewaySessionFactory } from '../../src/process/team-runtime/gateway';
import { HermesNativeSessionFactory } from '../../src/process/team-runtime/hermes';
import { ProtocolSessionFactory } from '../../src/process/team-runtime/protocol';
import { TeamOrchestrationEngineSelector } from '../../src/process/team-runtime/TeamOrchestrationEngineSelector';
import type { TTeam } from '../../src/common/types/teamTypes';

function makeTeam(agentType: string): TTeam {
  return {
    id: 'team-1',
    userId: 'user-1',
    name: 'Team',
    workspace: '/workspace',
    workspaceMode: 'shared',
    leaderAgentId: 'slot-lead',
    agents: [
      {
        slotId: 'slot-lead',
        conversationId: 'conv-lead',
        role: 'leader',
        agentType,
        agentName: 'Leader',
        conversationType: agentType === 'hermes' ? 'lokcli' : 'acp',
        status: 'idle',
      },
    ],
    createdAt: 1,
    updatedAt: 1,
  };
}

describe('TeamOrchestrationEngineSelector', () => {
  const legacy = new LegacyMailboxEngine();
  const hermesNative = new HermesNativeOrchestrationEngine({
    sessionFactory: new HermesNativeSessionFactory({
      createCompatibilitySession: () => ({}) as any,
    }),
  });
  const protocol = new ProtocolCoordinatedEngine({
    sessionFactory: new ProtocolSessionFactory({
      createCompatibilitySession: () => ({}) as any,
    }),
  });
  const gateway = new GatewayCoordinatedEngine({
    sessionFactory: new GatewaySessionFactory({
      createCompatibilitySession: () => ({}) as any,
    }),
  });
  const selector = new TeamOrchestrationEngineSelector({
    legacyEngine: legacy,
    hermesNativeEngine: hermesNative,
    protocolEngine: protocol,
    gatewayEngine: gateway,
  });

  it('falls back to legacy when feature flag is off', () => {
    const selection = selector.select({
      team: makeTeam('hermes'),
      cachedInitResults: null,
      hermesNativeRouting: 'off',
    });

    expect(selection.engine.kind).toBe('legacy_mailbox');
    expect(selection.fallbackReason).toBe('feature_flag_off');
  });

  it('falls back to legacy in shadow mode even for hermes leader', () => {
    const selection = selector.select({
      team: makeTeam('hermes'),
      cachedInitResults: null,
      hermesNativeRouting: 'shadow',
    });

    expect(selection.engine.kind).toBe('legacy_mailbox');
    expect(selection.fallbackReason).toBe('shadow_mode_compatibility_routing');
  });

  it('falls back to legacy when leader is not hermes-native capable', () => {
    const selection = selector.select({
      team: makeTeam('codex'),
      cachedInitResults: null,
      hermesNativeRouting: 'enabled',
    });

    expect(selection.engine.kind).toBe('protocol');
    expect(selection.fallbackReason).toBeUndefined();
  });

  it('falls back to legacy when hermes-native engine is not ready', () => {
    const selection = selector.select({
      team: makeTeam('hermes'),
      cachedInitResults: null,
      hermesNativeRouting: 'enabled',
    });

    expect(selection.engine.kind).toBe('legacy_mailbox');
    expect(selection.requestedEngine).toBe('hermes_native');
    expect(selection.fallbackReason).toBe('engine_not_ready');
  });

  it('selects gateway engine for openclaw gateway leader', () => {
    const selection = selector.select({
      team: makeTeam('openclaw-gateway'),
      cachedInitResults: null,
      hermesNativeRouting: 'enabled',
    });

    expect(selection.engine.kind).toBe('gateway');
    expect(selection.requestedEngine).toBe('gateway');
    expect(selection.fallbackReason).toBeUndefined();
  });
});
