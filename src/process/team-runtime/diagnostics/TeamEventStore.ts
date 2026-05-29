import { uuid } from '@/common/utils';
import type { ITeamEventStore } from './storeTypes';
import type { TeamRuntimeEvent } from './types';

type TeamEventStoreParams = {
  maxEventsPerTeam?: number;
};

export class TeamEventStore implements ITeamEventStore {
  private readonly eventsByTeam = new Map<string, TeamRuntimeEvent[]>();
  private readonly maxEventsPerTeam: number;

  constructor(params: TeamEventStoreParams = {}) {
    this.maxEventsPerTeam = params.maxEventsPerTeam ?? 100;
  }

  async append(teamId: string, event: Omit<TeamRuntimeEvent, 'id' | 'teamId'>): Promise<TeamRuntimeEvent> {
    const storedEvent: TeamRuntimeEvent = {
      id: uuid(12),
      teamId,
      ...event,
    };
    const current = this.eventsByTeam.get(teamId) ?? [];
    const next = [...current, storedEvent].slice(-this.maxEventsPerTeam);
    this.eventsByTeam.set(teamId, next);
    return storedEvent;
  }

  async list(teamId: string): Promise<TeamRuntimeEvent[]> {
    return [...(this.eventsByTeam.get(teamId) ?? [])];
  }

  async clear(teamId: string): Promise<void> {
    this.eventsByTeam.delete(teamId);
  }
}
