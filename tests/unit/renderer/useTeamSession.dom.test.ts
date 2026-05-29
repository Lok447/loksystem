import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const coreClientMock = vi.hoisted(() => ({
  teams: {
    get: vi.fn().mockResolvedValue({ id: 'team-1' }),
    ensureSession: vi.fn().mockResolvedValue({ success: true }),
    sendMessage: vi.fn().mockResolvedValue({ success: true }),
    addAgent: vi.fn().mockResolvedValue({ success: true }),
    renameAgent: vi.fn().mockResolvedValue({ success: true }),
    removeAgent: vi.fn().mockResolvedValue({ success: true }),
  },
  events: {
    subscribe: vi.fn(() => vi.fn()),
  },
}));

vi.mock('@/common/coreClient', () => ({
  getRendererCoreClient: () => coreClientMock,
}));

vi.mock('swr', () => ({
  __esModule: true,
  default: () => ({
    mutate: vi.fn(),
    data: undefined,
    error: undefined,
    isLoading: false,
  }),
}));

import { useTeamSession } from '@/renderer/pages/team/hooks/useTeamSession';
import type { TTeam } from '@/common/types/teamTypes';

function makeTeam(): TTeam {
  return {
    id: 'team-1',
    name: 'Test Team',
    leaderAgentId: 'slot-lead',
    agents: [
      {
        slotId: 'slot-lead',
        conversationId: 'conv-lead',
        agentName: 'Leader',
        agentType: 'hermes',
        role: 'leader',
        status: 'idle',
        conversationType: 'lokcli',
      },
    ],
    createdAt: 1,
    updatedAt: 1,
  } as TTeam;
}

describe('useTeamSession', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    coreClientMock.teams.ensureSession.mockResolvedValue({ success: true });
  });

  it('pre-warms the team session on mount', async () => {
    renderHook(() => useTeamSession(makeTeam()));

    await waitFor(() => {
      expect(coreClientMock.teams.ensureSession).toHaveBeenCalledWith('team-1');
    });
  });
});
