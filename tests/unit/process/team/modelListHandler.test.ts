import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ──────────────────────────────────────────────────────────────────

vi.mock('electron', () => ({
  app: { isPackaged: false, getAppPath: () => '/app' },
}));

const MOCK_CACHED_INIT = {
  hermes: {
    protocolVersion: 1,
    capabilities: {
      mcpCapabilities: { stdio: true, http: false, sse: false },
    },
  },
};

const MOCK_CACHED_MODELS: Record<string, { availableModels: Array<{ id: string }> }> = {
  hermes: {
    availableModels: [{ id: 'hermes-v13.0' }, { id: 'hermes-v13.0-local' }],
  },
};

vi.mock('@process/utils/initStorage', () => ({
  ProcessConfig: {
    get: vi.fn(async (key: string) => {
      if (key === 'acp.cachedModels') return MOCK_CACHED_MODELS;
      if (key === 'acp.cachedInitializeResult') return MOCK_CACHED_INIT;
      return null;
    }),
  },
}));

vi.mock('@process/bridge/modelBridge', () => ({
  getMergedModelProviders: vi.fn(async () => []),
}));

vi.mock('../../src/process/team/googleAuthCheck', () => ({
  hasGeminiOauthCreds: vi.fn(async () => false),
}));

vi.mock('@process/agent/AgentRegistry', () => ({
  agentRegistry: {
    getDetectedAgents: vi.fn(() => [{ backend: 'hermes', name: 'Lok CLI' }]),
  },
}));

import { handleListModels } from '@process/team/mcp/modelListHandler';

// ── Tests ──────────────────────────────────────────────────────────────────

describe('handleListModels', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns models for a specific agent_type', async () => {
    const result = await handleListModels({ agent_type: 'hermes' });
    expect(result).toContain('## Models for hermes');
    expect(result).toContain('- hermes-v13.0');
    expect(result).toContain('- hermes-v13.0-local');
  });

  it('returns "no models" for an unknown agent_type', async () => {
    const result = await handleListModels({ agent_type: 'unknown-backend' });
    expect(result).toBe('No models available for agent type "unknown-backend".');
  });

  it('lists all team-capable backends when no agent_type is given', async () => {
    const result = await handleListModels({});
    expect(result).toContain('## Available Models by Agent Type');
    expect(result).toContain('### Lok CLI (`hermes`)');
    expect(result).toContain('hermes-v13.0');
  });

  it('returns "no team-capable agents" when none detected', async () => {
    const { agentRegistry } = await import('@process/agent/AgentRegistry');
    vi.mocked(agentRegistry.getDetectedAgents).mockReturnValueOnce([]);

    const result = await handleListModels({});
    expect(result).toBe('No team-capable agent types detected.');
  });
});
