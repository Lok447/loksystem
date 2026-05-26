import { getRendererCoreClient } from '@/common/coreClient';
import { Spin } from '@arco-design/web-react';
import React from 'react';
import { useParams } from 'react-router-dom';
import useSWR from 'swr';
import TeamPage from './TeamPage';

const TeamIndex: React.FC = () => {
  const { id } = useParams<{ id: string }>();

  const { data: team, isLoading } = useSWR(id ? `team/${id}` : null, () => getRendererCoreClient().teams.get(id!));

  if (isLoading) return <Spin loading />;
  if (!team) return null;
  return <TeamPage key={team.id} team={team} />;
};

export default TeamIndex;
