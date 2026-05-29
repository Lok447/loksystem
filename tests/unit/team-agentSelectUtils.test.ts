// tests/unit/team-agentSelectUtils.test.ts
import { describe, it, expect } from 'vitest';
import {
  resolveConversationType,
  filterTeamSupportedAgents,
  partitionAgentsByTeamRole,
  agentKey,
  agentFromKey,
  resolveTeamAgentType,
  getAgentTeamCapabilitySummary,
  getAgentTeamEligibility,
  getLeaderMixedBackendHint,
  getTeammateMixedBackendHint,
} from '@renderer/pages/team/components/agentSelectUtils';
import { isTeamCapableBackend, getTeamCapableBackends, getTeamBackendCapabilities } from '@/common/types/teamTypes';
import { buildTeamMcpServer } from '@process/agent/acp/mcpSessionConfig';
import type { AvailableAgent } from '@renderer/utils/model/agentTypes';
import type { AcpInitializeResult } from '@/common/types/acpTypes';

// Helper to build a minimal cached AcpInitializeResult with mcpCapabilities.stdio = true
function makeCachedInit(backends: string[]): Record<string, AcpInitializeResult> {
  const result: Record<string, AcpInitializeResult> = {};
  for (const b of backends) {
    result[b] = {
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
    };
  }
  return result;
}

// ---------------------------------------------------------------------------
// resolveConversationType
// ---------------------------------------------------------------------------
describe('resolveConversationType', () => {
  it('maps gemini to lokcli', () => {
    expect(resolveConversationType('gemini')).toBe('lokcli');
  });

  it('maps aionrs to lokcli', () => {
    expect(resolveConversationType('aionrs')).toBe('lokcli');
  });

  it('maps codex to acp', () => {
    expect(resolveConversationType('codex')).toBe('acp');
  });

  it('maps openclaw-gateway to openclaw-gateway', () => {
    expect(resolveConversationType('openclaw-gateway')).toBe('openclaw-gateway');
  });

  it('maps nanobot to nanobot', () => {
    expect(resolveConversationType('nanobot')).toBe('nanobot');
  });

  it('maps remote to remote', () => {
    expect(resolveConversationType('remote')).toBe('remote');
  });

  it.each(['claude', 'qwen', 'deepseek', 'grok', 'some-future-acp-backend'])(
    'maps unknown backend "%s" to acp (default, MCP injectable)',
    (backend) => {
      expect(resolveConversationType(backend)).toBe('acp');
    }
  );
});

// ---------------------------------------------------------------------------
// isTeamCapableBackend — dynamic capability check
// ---------------------------------------------------------------------------
describe('isTeamCapableBackend', () => {
  const cached = makeCachedInit(['qwen', 'codex']);

  it('returns true for known team-capable backends regardless of cached data', () => {
    for (const backend of ['hermes', 'codex']) {
      expect(isTeamCapableBackend(backend, null)).toBe(true);
      expect(isTeamCapableBackend(backend, undefined)).toBe(true);
      expect(isTeamCapableBackend(backend, {})).toBe(true);
      expect(isTeamCapableBackend(backend, cached)).toBe(true);
    }
  });

  it('returns false for ACP backend without cached init result', () => {
    expect(isTeamCapableBackend('opencode', cached)).toBe(false);
    expect(isTeamCapableBackend('codebuddy', cached)).toBe(false);
  });

  it('returns false for unknown backend when cached data is null', () => {
    expect(isTeamCapableBackend('qwen', null)).toBe(false);
  });

  it('returns false for unknown backend when cached data is undefined', () => {
    expect(isTeamCapableBackend('qwen', undefined)).toBe(false);
  });
});

describe('getTeamBackendCapabilities', () => {
  const cached = makeCachedInit(['qwen']);

  it('describes hermes as native orchestrator and leader recommended', () => {
    expect(getTeamBackendCapabilities('hermes', cached)).toMatchObject({
      recommendedTeamMode: 'native_orchestrator',
      leaderRecommended: true,
      workerRecommended: true,
      currentlySupported: true,
      supportsNativeDelegation: true,
    });
  });

  it('describes codex as protocol worker preferred', () => {
    expect(getTeamBackendCapabilities('codex', cached)).toMatchObject({
      recommendedTeamMode: 'protocol_coordinated',
      leaderRecommended: false,
      workerRecommended: true,
      currentlySupported: true,
    });
  });

  it('describes openclaw gateway as future gateway mode but not yet currently supported', () => {
    expect(getTeamBackendCapabilities('openclaw-gateway', cached)).toMatchObject({
      recommendedTeamMode: 'gateway_coordinated',
      workerRecommended: true,
      currentlySupported: true,
    });
  });

  it('uses cached stdio support to mark ACP workers as protocol-coordinated', () => {
    expect(getTeamBackendCapabilities('qwen', cached)).toMatchObject({
      recommendedTeamMode: 'protocol_coordinated',
      workerRecommended: true,
      currentlySupported: true,
      supportsMcpStdio: true,
    });
  });
});

// ---------------------------------------------------------------------------
// getTeamCapableBackends
// ---------------------------------------------------------------------------
describe('getTeamCapableBackends', () => {
  const cached = makeCachedInit(['qwen', 'codex']);

  it('returns only backends with cached init plus known LokSystem backends', () => {
    const result = getTeamCapableBackends(['hermes', 'codex', 'qwen', 'codebuddy'], cached);
    expect(result).toEqual(['hermes', 'codex', 'qwen']);
  });

  it('returns known team-capable backends even without cached data', () => {
    const result = getTeamCapableBackends(['hermes', 'codex', 'qwen', 'codebuddy'], null);
    expect(result).toEqual(['hermes', 'codex']);
  });
});

// ---------------------------------------------------------------------------
// filterTeamSupportedAgents
// ---------------------------------------------------------------------------
describe('filterTeamSupportedAgents', () => {
  const makeAgent = (backend: string, overrides?: Partial<AvailableAgent>): AvailableAgent =>
    ({
      backend,
      name: backend,
      conversationType: 'acp',
      ...overrides,
    }) as AvailableAgent;

  const cached = makeCachedInit(['qwen', 'codex']);

  it('keeps agents with cached init results and known LokSystem backends', () => {
    const agents = [
      makeAgent('hermes'),
      makeAgent('gemini'),
      makeAgent('codex'),
      makeAgent('qwen'),
      makeAgent('codebuddy'),
    ];
    const result = filterTeamSupportedAgents(agents, cached);
    expect(result.map((a: AvailableAgent) => a.backend)).toEqual(['hermes', 'codex', 'qwen']);
  });

  it('uses presetAgentType over backend when available', () => {
    const agent = makeAgent('hermes', { presetAgentType: 'codebuddy' });
    const result = filterTeamSupportedAgents([agent], cached);
    // codebuddy has no cached init → filtered out
    expect(result).toHaveLength(0);
  });

  it('returns known team-capable agents even without cached data', () => {
    const agents = [makeAgent('hermes'), makeAgent('gemini'), makeAgent('codex'), makeAgent('qwen')];
    const result = filterTeamSupportedAgents(agents, null);
    expect(result.map((a: AvailableAgent) => a.backend)).toEqual(['hermes', 'codex']);
  });

  it('returns all agents when all have cached init results', () => {
    const agents = [makeAgent('qwen'), makeAgent('codex')];
    expect(filterTeamSupportedAgents(agents, cached)).toHaveLength(2);
  });

  it('filters leader options by leader eligibility when role is leader', () => {
    const agents = [makeAgent('hermes'), makeAgent('codex'), makeAgent('qwen')];
    const result = filterTeamSupportedAgents(agents, cached, null, 'leader');
    expect(result.map((a: AvailableAgent) => a.backend)).toEqual(['hermes']);
  });

  it('allows override-enabled custom workers when role is teammate', () => {
    const agents = [makeAgent('custom')];
    const result = filterTeamSupportedAgents(
      agents,
      cached,
      {
        custom: {
          currentlySupported: true,
          workerRecommended: true,
          leaderRecommended: false,
          recommendedTeamMode: 'managed_mailbox',
        },
      },
      'teammate'
    );

    expect(result.map((a: AvailableAgent) => a.backend)).toEqual(['custom']);
  });
});

describe('getAgentTeamEligibility', () => {
  const cached = makeCachedInit(['qwen']);

  it('marks codex as blocked for leader role', () => {
    const result = getAgentTeamEligibility({ backend: 'codex', name: 'Codex' } as AvailableAgent, cached, 'leader');
    expect(result.selectable).toBe(false);
    expect(result.capabilities.leaderRecommended).toBe(false);
  });

  it('marks qwen as selectable teammate when cached stdio exists', () => {
    const result = getAgentTeamEligibility({ backend: 'qwen', name: 'Qwen' } as AvailableAgent, cached, 'teammate');
    expect(result.selectable).toBe(true);
    expect(result.capabilities.workerRecommended).toBe(true);
  });
});

describe('partitionAgentsByTeamRole', () => {
  const cached = makeCachedInit(['qwen']);
  const makeAgent = (backend: string): AvailableAgent => ({ backend, name: backend, conversationType: 'acp' }) as AvailableAgent;

  it('splits leader-selectable and blocked agents', () => {
    const result = partitionAgentsByTeamRole([makeAgent('hermes'), makeAgent('codex'), makeAgent('qwen')], cached, 'leader');
    expect(result.selectable.map((agent) => agent.backend)).toEqual(['hermes']);
    expect(result.blocked.map((agent) => agent.backend)).toEqual(['codex', 'qwen']);
  });
});

describe('getAgentTeamCapabilitySummary', () => {
  const cached = makeCachedInit(['qwen']);

  it('returns native leader summary for hermes', () => {
    expect(getAgentTeamCapabilitySummary({ backend: 'hermes', name: 'LokCLI' } as AvailableAgent, cached)).toEqual({
      modeLabel: 'Native Team Mode',
      recommendationLabel: 'Leader Recommended',
    });
  });

  it('returns protocol worker summary for qwen', () => {
    expect(getAgentTeamCapabilitySummary({ backend: 'qwen', name: 'Qwen' } as AvailableAgent, cached)).toEqual({
      modeLabel: 'Protocol Team Mode',
      recommendationLabel: 'Worker Recommended',
      caveatLabel: 'Best used as a worker',
    });
  });
});

describe('getLeaderMixedBackendHint', () => {
  const cached = makeCachedInit(['qwen']);

  it('returns native hint for hermes leaders', () => {
    expect(getLeaderMixedBackendHint({ backend: 'hermes', name: 'Hermes' } as AvailableAgent, cached)).toContain(
      'Hermes-native leaders'
    );
  });

  it('returns worker-only hint for codex leaders', () => {
    expect(getLeaderMixedBackendHint({ backend: 'codex', name: 'Codex' } as AvailableAgent, cached)).toContain(
      'worker-capable but not recommended as the team leader'
    );
  });
});

describe('getTeammateMixedBackendHint', () => {
  const cached = makeCachedInit(['qwen']);

  it('returns compatibility hint when qwen joins a hermes-led team', () => {
    expect(
      getTeammateMixedBackendHint({ backend: 'qwen', name: 'Qwen' } as AvailableAgent, 'hermes', cached)
    ).toContain('compatibility path');
  });

  it('returns managed hint for override-enabled custom worker', () => {
    expect(
      getTeammateMixedBackendHint(
        { backend: 'custom', name: 'Custom Worker' } as AvailableAgent,
        'custom',
        cached,
        {
          custom: {
            currentlySupported: true,
            workerRecommended: true,
            leaderRecommended: true,
            recommendedTeamMode: 'managed_mailbox',
          },
        }
      )
    ).toContain('managed mailbox path');
  });
});

// ---------------------------------------------------------------------------
// agentKey / agentFromKey
// ---------------------------------------------------------------------------
describe('agentKey', () => {
  it('returns cli:: prefix for CLI agents', () => {
    expect(agentKey({ backend: 'claude' } as AvailableAgent)).toBe('cli::claude');
  });

  it('returns preset:: prefix for custom agents', () => {
    expect(agentKey({ backend: 'claude', customAgentId: 'my-agent' } as AvailableAgent)).toBe('preset::my-agent');
  });
});

describe('agentFromKey', () => {
  const agents = [
    { backend: 'claude' } as AvailableAgent,
    { backend: 'claude', customAgentId: 'my-agent' } as AvailableAgent,
  ];

  it('finds CLI agent by key', () => {
    expect(agentFromKey('cli::claude', agents)).toBe(agents[0]);
  });

  it('finds preset agent by key', () => {
    expect(agentFromKey('preset::my-agent', agents)).toBe(agents[1]);
  });

  it('returns undefined for unknown key', () => {
    expect(agentFromKey('cli::unknown', agents)).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// resolveTeamAgentType
// ---------------------------------------------------------------------------
describe('resolveTeamAgentType', () => {
  it('returns presetAgentType when available', () => {
    expect(resolveTeamAgentType({ presetAgentType: 'qwen' } as AvailableAgent, 'fallback')).toBe('qwen');
  });

  it('falls back to backend when no presetAgentType', () => {
    expect(resolveTeamAgentType({ backend: 'claude' } as AvailableAgent, 'fallback')).toBe('claude');
  });

  it('returns fallback when agent is undefined', () => {
    expect(resolveTeamAgentType(undefined, 'fallback')).toBe('fallback');
  });
});

// ---------------------------------------------------------------------------
// buildTeamMcpServer — the actual injection builder used by AcpAgent
// ---------------------------------------------------------------------------
describe('buildTeamMcpServer', () => {
  const validConfig = {
    name: 'team-mcp',
    command: '/usr/bin/node',
    args: ['server.js', '--team-id=abc'],
    env: [{ name: 'TEAM_ID', value: 'abc' }],
  };

  it('returns a valid stdio server entry when config is complete', () => {
    const result = buildTeamMcpServer(validConfig);
    expect(result).toEqual({
      name: 'team-mcp',
      command: '/usr/bin/node',
      args: ['server.js', '--team-id=abc'],
      env: [{ name: 'TEAM_ID', value: 'abc' }],
    });
  });

  it('returns null when config is undefined', () => {
    expect(buildTeamMcpServer(undefined)).toBeNull();
  });

  it('returns null when config is null', () => {
    expect(buildTeamMcpServer(null)).toBeNull();
  });

  it('returns null when command is empty string', () => {
    expect(buildTeamMcpServer({ ...validConfig, command: '' })).toBeNull();
  });

  it('preserves all env entries', () => {
    const config = {
      ...validConfig,
      env: [
        { name: 'TEAM_ID', value: 'abc' },
        { name: 'SLOT_ID', value: 'slot-1' },
      ],
    };
    const result = buildTeamMcpServer(config);
    expect(result?.env).toHaveLength(2);
    expect(result?.env[1]).toEqual({ name: 'SLOT_ID', value: 'slot-1' });
  });

  it('preserves empty args array', () => {
    const result = buildTeamMcpServer({ ...validConfig, args: [] });
    expect(result?.args).toEqual([]);
  });
});
