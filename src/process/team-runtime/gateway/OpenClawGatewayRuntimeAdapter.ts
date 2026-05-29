import type { IWorkerTaskManager } from '@process/task/IWorkerTaskManager';
import type { TeamAgent } from '@process/team/types';
import { resolveGatewayRuntimeSnapshot, type GatewayRuntimeSnapshot } from './OpenClawRuntimeResolver';

export class OpenClawGatewayRuntimeAdapter {
  constructor(private readonly workerTaskManager: IWorkerTaskManager) {}

  getWorkerRuntime(agent: TeamAgent): GatewayRuntimeSnapshot | null {
    return resolveGatewayRuntimeSnapshot(this.workerTaskManager, agent);
  }

  listWorkerRuntimes(agents: TeamAgent[]): GatewayRuntimeSnapshot[] {
    return agents
      .map((agent) => this.getWorkerRuntime(agent))
      .filter((runtime): runtime is GatewayRuntimeSnapshot => Boolean(runtime));
  }
}
