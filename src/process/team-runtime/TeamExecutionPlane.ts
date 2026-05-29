import type { TTeam } from '@process/team/types';
import type { ITeamExecutionSession } from './ITeamExecutionSession';

type TeamExecutionPlaneParams<TSession extends ITeamExecutionSession> = {
  loadTeam: (teamId: string) => Promise<TTeam>;
  createSession: (team: TTeam) => Promise<TSession> | TSession;
  initializeSession?: (team: TTeam, session: TSession) => Promise<void>;
};

export class TeamExecutionPlane<TSession extends ITeamExecutionSession = ITeamExecutionSession> {
  private readonly sessions: Map<string, TSession> = new Map();

  constructor(private readonly params: TeamExecutionPlaneParams<TSession>) {}

  getSession(teamId: string): TSession | undefined {
    return this.sessions.get(teamId);
  }

  async getOrStartSession(teamId: string): Promise<TSession> {
    const existing = this.sessions.get(teamId);
    if (existing) return existing;

    const team = await this.params.loadTeam(teamId);
    const session = await this.params.createSession(team);

    try {
      await this.params.initializeSession?.(team, session);
    } catch (error) {
      try {
        await session.dispose();
      } catch (disposeError) {
        console.warn(`[TeamExecutionPlane] Failed to dispose session after startup failure for ${teamId}:`, disposeError);
      }
      throw error;
    }

    this.sessions.set(teamId, session);
    return session;
  }

  async stopSession(teamId: string): Promise<void> {
    const session = this.sessions.get(teamId);
    if (!session) return;
    this.sessions.delete(teamId);
    await session.dispose();
  }

  async stopAllSessions(): Promise<void> {
    const teamIds = [...this.sessions.keys()];
    await Promise.all(teamIds.map((teamId) => this.stopSession(teamId)));
  }
}
