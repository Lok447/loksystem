import type { TTeam } from '@process/team/types';
import type { ITeamExecutionSession } from './ITeamExecutionSession';

export interface ITeamExecutionBootstrap<TSession extends ITeamExecutionSession = ITeamExecutionSession> {
  initialize(team: TTeam, session: TSession): Promise<void>;
}
