import type { ITeamRuntimeSnapshotStore } from './storeTypes';
import type { TeamRuntimeSnapshot } from './types';

export class TeamRuntimeSnapshotStore implements ITeamRuntimeSnapshotStore {
  private readonly snapshots = new Map<string, TeamRuntimeSnapshot>();

  async set(snapshot: TeamRuntimeSnapshot): Promise<void> {
    this.snapshots.set(snapshot.teamId, snapshot);
  }

  async get(teamId: string): Promise<TeamRuntimeSnapshot | null> {
    return this.snapshots.get(teamId) ?? null;
  }

  async clear(teamId: string): Promise<void> {
    this.snapshots.delete(teamId);
  }
}
