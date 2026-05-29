import { describe, expect, it } from 'vitest';
import { buildTeammatePrompt } from '@process/team/prompts/teammatePrompt';
import type { TeamAgent } from '@process/team/types';

function makeAgent(overrides: Partial<TeamAgent> = {}): TeamAgent {
  return {
    slotId: 'slot-1',
    conversationId: 'conv-1',
    role: 'teammate',
    agentType: 'gemini',
    agentName: 'Researcher',
    conversationType: 'gemini',
    status: 'idle',
    ...overrides,
  };
}

describe('buildTeammatePrompt', () => {
  it('keeps greeting replies friendly and focused on role introduction', () => {
    const prompt = buildTeammatePrompt({
      agent: makeAgent(),
      agentCapabilities: {
        backend: 'codex',
        executionKind: 'acp',
        supportsMcpStdio: true,
        supportsSessionFork: false,
        supportsNativeDelegation: false,
        supportsSharedWorkspace: true,
        supportsStructuredTasks: true,
        supportsDirectPeerMessaging: true,
        supportsInterrupt: true,
        supportsResume: false,
        supportsModelSelection: true,
        recommendedTeamMode: 'protocol_coordinated',
        maturity: 'high',
        leaderRecommended: false,
        workerRecommended: true,
        currentlySupported: true,
        caveats: ['worker_preferred'],
      },
      leader: makeAgent({ slotId: 'slot-lead', role: 'leader', agentName: 'Leader', agentType: 'claude' }),
      teammates: [],
    });

    expect(prompt).toContain('## Your Runtime Fit');
    expect(prompt).toContain('better fit for specialist teammate work');
    expect(prompt).toContain('If the user greets you, starts a new chat, or asks what you can do');
    expect(prompt).toContain('Briefly introduce yourself and your role on the team');
    expect(prompt).toContain('invite the user to share what they need');
    expect(prompt).toContain('Do NOT open with task board details, idle/waiting status, or coordination mechanics');
  });
});
