import type { TeamAgent } from '@/common/types/teamTypes';
import type { CoreTeamRuntimeDiagnosticsDto } from '@process/core/shared/CoreContracts';
import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { buildTeamExecutionOverviewModel } from './teamExecutionOverviewModel';
import { useTeamRuntimeDiagnostics } from './teamRuntimeDiagnosticsShared';

type Props = {
  teamId: string;
  agents: TeamAgent[];
};

function formatEventTime(timestamp: number | undefined): string {
  if (!timestamp) return '--';
  return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function getStageTone(index: number): string {
  if (index === 0) return 'var(--color-primary-6)';
  if (index === 1) return 'var(--color-success-6)';
  if (index === 2) return 'var(--color-warning-6)';
  return 'var(--color-secondary)';
}

function getOverviewStages(diagnostics: CoreTeamRuntimeDiagnosticsDto | null) {
  const executionInfo = diagnostics?.executionInfo;
  const waitingCount = diagnostics?.taskDiagnostics.waiting.length ?? 0;
  const timelineCount = diagnostics?.timeline.length ?? 0;
  const lastEvent = diagnostics?.timeline.at(-1);

  return [
    {
      titleKey: 'team.runtime.executionOverviewStageGoal',
      defaultTitle: 'Goal Intake',
      detailKey: 'team.runtime.executionOverviewStageGoalDetail',
      defaultDetail: 'User intent, constraints, and workspace context will surface here.',
      metric: executionInfo?.context?.leaderBackend ?? '-',
      metricLabelKey: 'team.runtime.executionOverviewLeaderBackend',
      metricLabelDefault: 'Leader backend',
    },
    {
      titleKey: 'team.runtime.executionOverviewStagePlan',
      defaultTitle: 'Delegation Plan',
      detailKey: 'team.runtime.executionOverviewStagePlanDetail',
      defaultDetail: 'Leader to worker task routing and capability-aware assignment.',
      metric: `${executionInfo?.context?.memberCount ?? 0}`,
      metricLabelKey: 'team.runtime.executionOverviewMembers',
      metricLabelDefault: 'Members',
    },
    {
      titleKey: 'team.runtime.executionOverviewStageExecution',
      defaultTitle: 'Execution Stream',
      detailKey: 'team.runtime.executionOverviewStageExecutionDetail',
      defaultDetail: 'Multi-agent progress, blockers, and handoffs will be visualized here.',
      metric: `${timelineCount}`,
      metricLabelKey: 'team.runtime.executionOverviewEvents',
      metricLabelDefault: 'Events',
    },
    {
      titleKey: 'team.runtime.executionOverviewStageRecovery',
      defaultTitle: 'Recovery Path',
      detailKey: 'team.runtime.executionOverviewStageRecoveryDetail',
      defaultDetail: 'Replay and resume status will join the same orchestration timeline.',
      metric: executionInfo?.recovery?.preferredMode ?? '-',
      metricLabelKey: 'team.runtime.executionOverviewRecoveryMode',
      metricLabelDefault: 'Recovery mode',
    },
    {
      titleKey: 'team.runtime.executionOverviewStagePending',
      defaultTitle: 'Pending Work',
      detailKey: 'team.runtime.executionOverviewStagePendingDetail',
      defaultDetail: 'Queued and blocked work stays visible before we wire full orchestration lanes.',
      metric: `${diagnostics?.taskDiagnostics.pending ?? 0}`,
      metricLabelKey: 'team.runtime.executionOverviewPending',
      metricLabelDefault: 'Pending',
    },
    {
      titleKey: 'team.runtime.executionOverviewStageTimeline',
      defaultTitle: 'Latest Runtime Event',
      detailKey: 'team.runtime.executionOverviewStageTimelineDetail',
      defaultDetail: 'The newest orchestration or recovery event anchors the execution timeline.',
      metric: waitingCount > 0 ? `${waitingCount}` : formatEventTime(lastEvent?.at),
      metricLabelKey:
        waitingCount > 0 ? 'team.runtime.executionOverviewWaiting' : 'team.runtime.executionOverviewLastEvent',
      metricLabelDefault: waitingCount > 0 ? 'Waiting' : 'Last event',
    },
  ];
}

function laneItemKindLabelKey(kind: string): string {
  switch (kind) {
    case 'routing':
      return 'team.runtime.executionOverviewItemRouting';
    case 'session':
      return 'team.runtime.executionOverviewItemSession';
    case 'recovery':
      return 'team.runtime.executionOverviewItemRecovery';
    case 'diagnostics':
      return 'team.runtime.executionOverviewItemDiagnostics';
    case 'blocked_task':
      return 'team.runtime.executionOverviewItemBlockedTask';
    case 'degraded':
      return 'team.runtime.executionOverviewItemDegraded';
    default:
      return 'team.runtime.executionOverviewItemEvent';
  }
}

export default function TeamExecutionOverview({ teamId, agents }: Props) {
  const { t } = useTranslation();
  const { diagnostics, isLoading } = useTeamRuntimeDiagnostics(teamId);

  const stages = useMemo(() => getOverviewStages(diagnostics), [diagnostics]);
  const overviewModel = useMemo(() => buildTeamExecutionOverviewModel(agents, diagnostics), [agents, diagnostics]);

  return (
    <div
      data-testid='team-execution-overview'
      className='shrink-0 border-b border-solid border-[color:var(--border-base)] bg-[linear-gradient(135deg,var(--color-fill-1),var(--color-bg-1))] px-12px py-12px'
    >
      <div className='flex flex-wrap items-end justify-between gap-10px'>
        <div className='min-w-0'>
          <div className='text-13px font-medium text-[color:var(--color-text-1)]'>
            {t('team.runtime.executionOverviewTitle', { defaultValue: 'Execution Overview' })}
          </div>
          <div className='mt-4px max-w-720px text-12px leading-18px text-[color:var(--color-text-3)]'>
            {t('team.runtime.executionOverviewSubtitle', {
              defaultValue:
                'This reserved area will become the primary visualization surface for leader planning, worker progress, and cross-agent coordination.',
            })}
          </div>
        </div>
        <div className='rounded-full border border-solid border-[color:var(--border-base)] bg-[var(--color-bg-1)] px-10px py-6px text-11px text-[color:var(--color-text-2)]'>
          {isLoading
            ? t('team.runtime.loading', { defaultValue: 'Loading runtime diagnostics...' })
            : t('team.runtime.executionOverviewLiveBadge', {
                defaultValue: 'Live runtime view',
              })}
        </div>
      </div>

      <div className='mt-12px grid gap-10px md:grid-cols-2 xl:grid-cols-3'>
        {stages.map((stage, index) => (
          <div
            key={stage.titleKey}
            className='rounded-12px border border-solid border-[color:var(--border-base)] bg-[var(--color-bg-1)] px-12px py-12px'
          >
            <div className='flex items-center justify-between gap-8px'>
              <span className='text-11px uppercase tracking-[0.08em] text-[color:var(--color-text-3)]'>
                {t('team.runtime.executionOverviewStageLabel', {
                  defaultValue: 'Stage {{index}}',
                  index: index + 1,
                })}
              </span>
              <span className='h-8px w-48px rounded-full' style={{ background: getStageTone(index) }} />
            </div>
            <div className='mt-8px text-13px font-medium text-[color:var(--color-text-1)]'>
              {t(stage.titleKey, { defaultValue: stage.defaultTitle })}
            </div>
            <div className='mt-6px text-12px leading-18px text-[color:var(--color-text-3)]'>
              {t(stage.detailKey, { defaultValue: stage.defaultDetail })}
            </div>
            <div className='mt-10px flex items-end justify-between gap-10px'>
              <div>
                <div className='text-11px text-[color:var(--color-text-3)]'>
                  {t(stage.metricLabelKey, { defaultValue: stage.metricLabelDefault })}
                </div>
                <div className='mt-4px text-16px font-medium text-[color:var(--color-text-1)]'>{stage.metric}</div>
              </div>
              <div className='flex min-w-80px gap-6px'>
                <span className='h-8px flex-1 rounded-full bg-[var(--color-fill-2)]' />
                <span className='h-8px rounded-full bg-[var(--color-fill-2)]' style={{ width: '40%' }} />
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className='mt-12px rounded-12px border border-solid border-[color:var(--border-base)] bg-[var(--color-bg-1)] px-12px py-12px'>
        <div className='grid gap-8px lg:grid-cols-2'>
          <div className='rounded-10px bg-[var(--color-fill-1)] px-10px py-10px'>
            <div className='text-12px font-medium text-[color:var(--color-text-1)]'>
              {t('team.runtime.executionOverviewOwnershipTitle', {
                defaultValue: 'Task ownership',
              })}
            </div>
            {overviewModel.ownershipHighlights.length ? (
              <div className='mt-8px grid gap-8px'>
                {overviewModel.ownershipHighlights.map((item) => (
                  <div key={item.id} className='rounded-8px bg-[var(--color-bg-1)] px-10px py-8px'>
                    <div className='text-12px text-[color:var(--color-text-1)]'>{item.title}</div>
                    {item.subtitle ? (
                      <div className='mt-4px line-clamp-2 text-11px leading-16px text-[color:var(--color-text-2)]'>
                        {item.subtitle}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : (
              <div className='mt-8px text-11px text-[color:var(--color-text-3)]'>
                {t('team.runtime.executionOverviewOwnershipEmpty', {
                  defaultValue: 'Current worker ownership will appear here as protocol tasks are assigned.',
                })}
              </div>
            )}
          </div>

          <div className='rounded-10px bg-[var(--color-fill-1)] px-10px py-10px'>
            <div className='text-12px font-medium text-[color:var(--color-text-1)]'>
              {t('team.runtime.executionOverviewRecoveryTitle', {
                defaultValue: 'Recovery actions',
              })}
            </div>
            {overviewModel.recoveryHighlights.length ? (
              <div className='mt-8px grid gap-8px'>
                {overviewModel.recoveryHighlights.map((item) => (
                  <div key={item.id} className='rounded-8px bg-[var(--color-bg-1)] px-10px py-8px'>
                    <div className='text-12px text-[color:var(--color-text-1)]'>{item.title}</div>
                    {item.subtitle ? (
                      <div className='mt-4px line-clamp-2 text-11px leading-16px text-[color:var(--color-text-2)]'>
                        {item.subtitle}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : (
              <div className='mt-8px text-11px text-[color:var(--color-text-3)]'>
                {t('team.runtime.executionOverviewRecoveryEmpty', {
                  defaultValue: 'Suggested recovery actions will appear here when the protocol runtime detects failures.',
                })}
              </div>
            )}
          </div>
        </div>

        <div className='mt-12px flex flex-wrap items-center justify-between gap-8px'>
          <div className='text-12px font-medium text-[color:var(--color-text-1)]'>
            {t('team.runtime.executionOverviewTimelineTitle', {
              defaultValue: 'Recent runtime timeline',
            })}
          </div>
          <div className='text-11px text-[color:var(--color-text-3)]'>
            {t('team.runtime.executionOverviewTimelineCount', {
              defaultValue: '{{count}} events',
              count: overviewModel.recentActivity.length,
            })}
          </div>
        </div>

        {overviewModel.recentActivity.length ? (
          <div className='mt-10px grid gap-8px'>
            {overviewModel.recentActivity.map((item) => (
              <div
                key={item.id}
                className='flex items-start justify-between gap-10px rounded-10px bg-[var(--color-fill-1)] px-10px py-10px'
              >
                <div className='min-w-0'>
                  <div className='text-12px text-[color:var(--color-text-1)]'>{item.title}</div>
                  {item.subtitle ? (
                    <div className='mt-4px line-clamp-2 text-11px leading-16px text-[color:var(--color-text-2)]'>
                      {item.subtitle}
                    </div>
                  ) : null}
                  <div className='mt-4px text-11px text-[color:var(--color-text-3)]'>
                    {t(laneItemKindLabelKey(item.kind), {
                      defaultValue: item.kind,
                    })}{' '}
                    · {agents.find((agent) => agent.slotId === item.laneId)?.agentName ?? item.laneId}
                  </div>
                </div>
                <div className='shrink-0 text-11px text-[color:var(--color-text-3)]'>{formatEventTime(item.timestamp)}</div>
              </div>
            ))}
          </div>
        ) : (
          <div className='mt-10px rounded-10px bg-[var(--color-fill-1)] px-12px py-12px text-12px text-[color:var(--color-text-3)]'>
            {t('team.runtime.executionOverviewTimelineEmpty', {
              defaultValue: 'Runtime timeline will appear here once orchestration events start flowing.',
            })}
          </div>
        )}
      </div>
    </div>
  );
}
