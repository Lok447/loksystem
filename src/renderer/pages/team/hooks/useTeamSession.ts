// src/renderer/pages/team/hooks/useTeamSession.ts
import { getRendererCoreClient } from '@/common/coreClient';
import type {
  ITeamAgentRemovedEvent,
  ITeamAgentRenamedEvent,
  ITeamAgentSpawnedEvent,
  ITeamAgentStatusEvent,
  TeamAgent,
  TeammateStatus,
  TTeam,
} from '@/common/types/teamTypes';
import { useCallback, useEffect, useState } from 'react';
import useSWR from 'swr';

type AgentStatusInfo = {
  slotId: string;
  status: TeammateStatus;
  lastMessage?: string;
};

export function useTeamSession(team: TTeam) {
  const { mutate: mutateTeam } = useSWR(team.id ? `team/${team.id}` : null, () =>
    getRendererCoreClient().teams.get(team.id)
  );

  const [statusMap, setStatusMap] = useState<Map<string, AgentStatusInfo>>(() => {
    return new Map(team.agents.map((a) => [a.slotId, { slotId: a.slotId, status: a.status }]));
  });

  useEffect(() => {
    return getRendererCoreClient().events.subscribe((event) => {
      if (event.scope !== 'team') return;
      switch (event.type) {
        case 'team.agent.status.changed': {
          const data = event.data as ITeamAgentStatusEvent;
          if (data.teamId !== team.id) return;
          const { slotId, status, lastMessage } = data;
          setStatusMap((prev) => {
            const next = new Map(prev);
            next.set(slotId, { slotId, status, lastMessage });
            return next;
          });
          return;
        }
        case 'team.agent.spawned':
        case 'team.agent.removed':
        case 'team.agent.renamed':
          if ((event.data as ITeamAgentSpawnedEvent | ITeamAgentRemovedEvent | ITeamAgentRenamedEvent).teamId !== team.id) {
            return;
          }
          void mutateTeam();
          return;
        default:
          return;
      }
    });
  }, [team.id, mutateTeam]);

  useEffect(() => {
    if (!team.id) return;

    // Pre-warm the team execution session when the team page opens so the
    // leader runtime is already booting before the first user message arrives.
    void getRendererCoreClient().teams.ensureSession(team.id).catch((error) => {
      console.warn('[useTeamSession] Failed to pre-warm team session:', {
        teamId: team.id,
        error,
      });
    });
  }, [team.id]);

  const sendMessage = useCallback(
    async (content: string) => {
      await getRendererCoreClient().teams.sendMessage({ teamId: team.id, content });
    },
    [team.id]
  );

  const addAgent = useCallback(
    async (agent: Omit<TeamAgent, 'slotId'>) => {
      await getRendererCoreClient().teams.addAgent({ teamId: team.id, agent });
      await mutateTeam();
    },
    [team.id, mutateTeam]
  );

  const renameAgent = useCallback(
    async (slotId: string, newName: string) => {
      await getRendererCoreClient().teams.renameAgent({ teamId: team.id, slotId, newName });
      await mutateTeam();
    },
    [team.id, mutateTeam]
  );

  const removeAgent = useCallback(
    async (slotId: string) => {
      await getRendererCoreClient().teams.removeAgent(team.id, slotId);
      await mutateTeam();
    },
    [team.id, mutateTeam]
  );

  return { statusMap, sendMessage, addAgent, renameAgent, removeAgent, mutateTeam };
}
