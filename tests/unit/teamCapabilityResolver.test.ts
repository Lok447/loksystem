import { describe, expect, it } from 'vitest';
import { TeamCapabilityResolver } from '@/common/team/TeamCapabilityResolver';

const makeCachedEntry = (stdio: boolean) => ({
  protocolVersion: 1,
  capabilities: {
    loadSession: false,
    promptCapabilities: { image: false, audio: false, embeddedContext: false },
    mcpCapabilities: { stdio, http: false, sse: false },
    sessionCapabilities: { fork: null, resume: null, list: null, close: null },
    _meta: {},
  },
  agentInfo: null,
  authMethods: [],
});

describe('TeamCapabilityResolver', () => {
  it('returns native leader-ready capabilities for hermes', () => {
    const result = TeamCapabilityResolver.resolve('hermes', { hermes: makeCachedEntry(true) });
    expect(result).toMatchObject({
      backend: 'hermes',
      executionKind: 'hermes',
      currentlySupported: true,
      leaderRecommended: true,
      workerRecommended: true,
      recommendedTeamMode: 'native_orchestrator',
    });
  });

  it('returns supported worker-preferred capabilities for codex', () => {
    const result = TeamCapabilityResolver.resolve('codex', { codex: makeCachedEntry(true) });
    expect(result).toMatchObject({
      backend: 'codex',
      executionKind: 'acp',
      currentlySupported: true,
      leaderRecommended: false,
      workerRecommended: true,
      recommendedTeamMode: 'protocol_coordinated',
    });
  });

  it('returns gateway capability shape for openclaw-gateway', () => {
    const result = TeamCapabilityResolver.resolve('openclaw-gateway', null);
    expect(result).toMatchObject({
      backend: 'openclaw-gateway',
      executionKind: 'gateway',
      currentlySupported: true,
      workerRecommended: true,
      recommendedTeamMode: 'gateway_coordinated',
      caveats: ['worker_preferred'],
    });
  });

  it('formats a useful unsupported hint for missing MCP stdio', () => {
    const capabilities = TeamCapabilityResolver.resolve('qwen', { qwen: makeCachedEntry(false) });
    expect(TeamCapabilityResolver.formatSupportHint(capabilities)).toContain('missing MCP stdio support');
  });

  it('falls back when a currently supported backend is not leader-recommended', () => {
    const picked = TeamCapabilityResolver.pickPreferredLeaderBackend('codex', { codex: makeCachedEntry(true) });
    expect(picked).toBe('hermes');
  });

  it('falls back to hermes when gateway backend is not leader-recommended', () => {
    const picked = TeamCapabilityResolver.pickPreferredLeaderBackend(undefined, null, null, 'hermes');
    expect(picked).toBe('hermes');
  });

  it('applies capability overrides for custom managed workers', () => {
    const result = TeamCapabilityResolver.resolve('custom', null, {
      custom: {
        currentlySupported: true,
        workerRecommended: true,
        leaderRecommended: false,
        recommendedTeamMode: 'managed_mailbox',
      },
    });

    expect(result).toMatchObject({
      backend: 'custom',
      currentlySupported: true,
      workerRecommended: true,
      leaderRecommended: false,
      recommendedTeamMode: 'managed_mailbox',
    });
  });

  it('falls back when requested leader backend is worker-only via override', () => {
    const picked = TeamCapabilityResolver.pickPreferredLeaderBackend(
      'custom',
      null,
      {
        custom: {
          currentlySupported: true,
          workerRecommended: true,
          leaderRecommended: false,
        },
      },
      'hermes'
    );

    expect(picked).toBe('hermes');
  });

  it('keeps requested worker backend when override marks it worker-capable', () => {
    const picked = TeamCapabilityResolver.pickPreferredWorkerBackend({
      backend: 'custom',
      cachedInitResults: null,
      overrides: {
        custom: {
          currentlySupported: true,
          workerRecommended: true,
          leaderRecommended: false,
        },
      },
      fallback: 'hermes',
    });

    expect(picked).toBe('custom');
  });
});
