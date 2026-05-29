import { describe, expect, it, vi } from 'vitest';
import { GatewayNativeSessionBootstrapDriver } from '../../src/process/team-runtime/gateway';
import type { TTeam } from '../../src/process/team/types';

function makeTeam(): TTeam {
  return {
    id: 'team-gateway',
    userId: 'user-1',
    name: 'Gateway Team',
    workspace: '/workspace',
    workspaceMode: 'shared',
    leaderAgentId: 'slot-lead',
    agents: [
      {
        slotId: 'slot-worker',
        conversationId: 'conv-worker',
        role: 'teammate',
        agentType: 'openclaw-gateway',
        agentName: 'Gateway Worker',
        conversationType: 'openclaw-gateway',
        status: 'idle',
      },
    ],
    createdAt: 1,
    updatedAt: 1,
  };
}

describe('GatewayNativeSessionBootstrapDriver', () => {
  it('writes gateway lifecycle bootstrap marker and warms gateway runtime with skipCache', async () => {
    const updateConversation = vi.fn().mockResolvedValue(undefined);
    const getOrBuildTask = vi.fn().mockResolvedValue(undefined);
    const gatewayEventSink = {
      emit: vi.fn().mockResolvedValue(undefined),
    };
    const session = {
      start: vi.fn().mockResolvedValue(undefined),
      getStdioConfig: vi.fn().mockReturnValue({ name: 'team-mcp' }),
    } as any;
    const driver = new GatewayNativeSessionBootstrapDriver({
      conversationService: {
        updateConversation,
      } as any,
      workerTaskManager: {
        getOrBuildTask,
      } as any,
      gatewayRuntimeAdapter: {
        getWorkerRuntime: vi.fn().mockReturnValue({
          runtimeStatus: 'session_active',
          lifecycleState: 'session_active',
        }),
      } as any,
    });

    await driver.startSession(session);
    await driver.configureAgentMcp(makeTeam(), session, makeTeam().agents[0]);
    await driver.warmAgent(makeTeam(), makeTeam().agents[0], gatewayEventSink as any);

    expect(session.start).toHaveBeenCalled();
    expect(updateConversation).toHaveBeenCalledWith(
      'conv-worker',
      expect.objectContaining({
        extra: expect.objectContaining({
          gatewayLifecycleBootstrapMode: 'native_driver',
          gatewayWorkerRole: 'worker',
          gatewayLifecycleContract: expect.objectContaining({
            slotId: 'slot-worker',
            bootstrapMode: 'native_driver',
            warmupStrategy: 'skip_cache',
            supportsStructuredTasks: true,
            supportsResume: true,
          }),
          gatewayRuntimeSnapshot: expect.objectContaining({
            runtimeStatus: 'session_active',
            lifecycleState: 'session_active',
          }),
        }),
      }),
      true
    );
    expect(getOrBuildTask).toHaveBeenCalledWith('conv-worker', { skipCache: true });
    expect(gatewayEventSink.emit).toHaveBeenCalledWith(
      'progress',
      expect.objectContaining({
        slotId: 'slot-worker',
        lifecycleState: 'session_active',
        runtimeStatus: 'session_active',
      })
    );
  });
});
