import type { TeamRuntimeEvent, TeamRuntimeSnapshot } from './types';

export interface ITeamEventStore {
  append(teamId: string, event: Omit<TeamRuntimeEvent, 'id' | 'teamId'>): Promise<TeamRuntimeEvent>;
  list(teamId: string): Promise<TeamRuntimeEvent[]>;
  clear(teamId: string): Promise<void>;
}

export interface ITeamRuntimeSnapshotStore {
  set(snapshot: TeamRuntimeSnapshot): Promise<void>;
  get(teamId: string): Promise<TeamRuntimeSnapshot | null>;
  clear(teamId: string): Promise<void>;
}
