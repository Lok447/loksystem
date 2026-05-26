// src/renderer/pages/team/hooks/useTeamList.ts
import { getRendererCoreClient } from '@/common/coreClient';
import { useAuth } from '@renderer/hooks/context/AuthContext';
import type { TTeam } from '@/common/types/teamTypes';
import { useCallback, useEffect } from 'react';
import useSWR from 'swr';

export function useTeamList() {
  const { user } = useAuth();
  const userId = user?.id ?? 'system_default_user';

  const { data: teams = [], mutate } = useSWR<TTeam[]>(
    `teams/${userId}`,
    () => getRendererCoreClient().teams.list(userId),
    { revalidateOnFocus: false }
  );

  // Refresh list when backend creates/removes a team (e.g. via MCP)
  useEffect(() => {
    return getRendererCoreClient().events.subscribe((event) => {
      if (event.type !== 'team.list.changed') return;
      void mutate();
    });
  }, [mutate]);

  const removeTeam = useCallback(
    async (id: string) => {
      await getRendererCoreClient().teams.remove(id);
      localStorage.removeItem(`team-active-slot-${id}`);
      await mutate();
    },
    [mutate]
  );

  return { teams, mutate, removeTeam };
}
