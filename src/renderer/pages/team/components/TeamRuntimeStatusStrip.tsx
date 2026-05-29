import { getRendererCoreClient } from '@/common/coreClient';
import { Button, Message, Spin } from '@arco-design/web-react';
import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { summarizeRuntimeValue, useTeamRuntimeDiagnostics } from './teamRuntimeDiagnosticsShared';

type Props = {
  teamId: string;
};

export default function TeamRuntimeStatusStrip({ teamId }: Props) {
  const { t } = useTranslation();
  const [prepareLoading, setPrepareLoading] = useState(false);
  const [executeLoading, setExecuteLoading] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const {
    diagnostics: activeDiagnostics,
    executionInfo: activeExecutionInfo,
    recoveryPlan: activeRecoveryPlan,
    preparedRecovery,
    executedRecovery,
    setPreparedRecovery,
    setExecutedRecovery,
    isLoading,
    error,
    mutate,
  } = useTeamRuntimeDiagnostics(teamId);
  const summaryItems = activeDiagnostics?.summary?.slice(0, 6) ?? [];
  const planSteps = activeRecoveryPlan?.steps ?? [];
  const hasExecutableRecovery =
    activeRecoveryPlan !== undefined &&
    activeRecoveryPlan !== null &&
    activeRecoveryPlan.status !== 'not_available';

  const lastActionSummary = useMemo(() => {
    if (executedRecovery) {
      return executedRecovery.status === 'executed'
        ? t('team.runtime.recovery.executed', { defaultValue: 'Recovery executed' })
        : executedRecovery.status === 'already_running'
          ? t('team.runtime.recovery.alreadyRunning', { defaultValue: 'Runtime already running' })
          : t('team.runtime.recovery.notAvailable', { defaultValue: 'Recovery not available' });
    }

    if (preparedRecovery) {
      return preparedRecovery.recoveryPlan.status === 'not_available'
        ? t('team.runtime.recovery.notAvailable', { defaultValue: 'Recovery not available' })
        : t('team.runtime.recovery.prepared', { defaultValue: 'Recovery prepared' });
    }

    return t('team.runtime.statusStripSubtitle', {
      defaultValue: 'Recovery stays available in the background while the team view focuses on execution.',
    });
  }, [executedRecovery, preparedRecovery, t]);

  const handleRefresh = async () => {
    await mutate();
  };

  const handlePrepareRecovery = async () => {
    setPrepareLoading(true);
    try {
      const response = await getRendererCoreClient().teams.prepareRecoverySession(teamId);
      if (!response.success || !response.data) {
        throw new Error(response.msg || 'Failed to prepare recovery');
      }

      setPreparedRecovery(response.data);
      setExecutedRecovery(null);
      await mutate();
      Message.success(
        response.data.recoveryPlan.status === 'not_available'
          ? t('team.runtime.recoveryPreparedNoPlan', {
              defaultValue: 'Recovery check complete: no replayable snapshot is available yet.',
            })
          : t('team.runtime.recoveryPrepared', {
              defaultValue: 'Recovery plan prepared.',
            })
      );
    } catch (prepareError) {
      Message.error(prepareError instanceof Error ? prepareError.message : String(prepareError));
    } finally {
      setPrepareLoading(false);
    }
  };

  const handleExecuteRecovery = async () => {
    setExecuteLoading(true);
    try {
      const response = await getRendererCoreClient().teams.executeRecoveryPlan(teamId);
      if (!response.success || !response.data) {
        throw new Error(response.msg || 'Failed to execute recovery');
      }

      setExecutedRecovery(response.data);
      if (response.data.status === 'already_running') {
        Message.success(t('team.runtime.recoveryAlreadyRunningToast', { defaultValue: 'Team runtime is already active.' }));
      } else if (response.data.status === 'not_available') {
        Message.success(t('team.runtime.recoveryUnavailableToast', { defaultValue: 'Recovery is not available for this team yet.' }));
      } else {
        Message.success(t('team.runtime.recoveryExecutedToast', { defaultValue: 'Recovery plan executed.' }));
      }
      await mutate();
    } catch (executeError) {
      Message.error(executeError instanceof Error ? executeError.message : String(executeError));
    } finally {
      setExecuteLoading(false);
    }
  };

  return (
    <div className='shrink-0 border-b border-solid border-[color:var(--border-base)] bg-[var(--color-fill-1)] px-12px py-8px'>
      <div className='flex flex-wrap items-center justify-between gap-10px'>
        <div className='flex min-w-0 flex-1 flex-wrap items-center gap-6px'>
          <span className='text-12px font-medium text-[color:var(--color-text-1)]'>
            {t('team.runtime.statusStripTitle', { defaultValue: 'Runtime' })}
          </span>
          <span className='rounded-full bg-[var(--color-bg-1)] px-8px py-4px text-11px text-[color:var(--color-text-2)]'>
            {t('team.runtime.executionChip', {
              defaultValue: '{{kind}} / {{state}}',
              kind: summarizeRuntimeValue(activeExecutionInfo?.executionKind),
              state: summarizeRuntimeValue(activeExecutionInfo?.state),
            })}
          </span>
          <span className='rounded-full bg-[var(--color-bg-1)] px-8px py-4px text-11px text-[color:var(--color-text-2)]'>
            {t('team.runtime.recoveryChip', {
              defaultValue: 'Recovery {{status}}',
              status: summarizeRuntimeValue(activeRecoveryPlan?.status),
            })}
          </span>
          <span className='rounded-full bg-[var(--color-bg-1)] px-8px py-4px text-11px text-[color:var(--color-text-2)]'>
            {t('team.runtime.pendingChip', {
              defaultValue: 'Pending {{pending}}',
              pending: activeDiagnostics?.taskDiagnostics.pending ?? 0,
            })}
          </span>
          <span className='min-w-0 truncate text-12px text-[color:var(--color-text-3)]'>{lastActionSummary}</span>
        </div>
        <div className='flex flex-wrap items-center gap-8px'>
          {isLoading && !activeDiagnostics ? <Spin loading size={14 as never} /> : null}
          <Button size='mini' onClick={() => setShowDetails((value) => !value)}>
            {showDetails
              ? t('team.runtime.hideDetails', { defaultValue: 'Hide Details' })
              : t('team.runtime.showDetails', { defaultValue: 'Details' })}
          </Button>
          <Button size='mini' onClick={handleRefresh}>
            {t('team.runtime.refresh', { defaultValue: 'Refresh' })}
          </Button>
          <Button size='mini' loading={prepareLoading} onClick={handlePrepareRecovery}>
            {t('team.runtime.prepareRecovery', { defaultValue: 'Prepare Recovery' })}
          </Button>
          <Button size='mini' type='primary' loading={executeLoading} disabled={!hasExecutableRecovery} onClick={handleExecuteRecovery}>
            {t('team.runtime.executeRecovery', { defaultValue: 'Execute Recovery' })}
          </Button>
        </div>
      </div>

      {error ? (
        <div className='mt-8px rounded-8px border border-solid border-[color:var(--color-danger-3)] bg-[color:var(--color-danger-1)] px-10px py-8px text-12px text-[color:var(--color-danger-6)]'>
          {error instanceof Error ? error.message : String(error)}
        </div>
      ) : null}

      {showDetails ? (
        <div className='mt-8px rounded-10px border border-solid border-[color:var(--border-base)] bg-[var(--color-bg-1)] px-10px py-10px'>
          <div className='grid gap-8px md:grid-cols-2 xl:grid-cols-4'>
            <div className='rounded-8px bg-[var(--color-fill-1)] px-10px py-8px'>
              <div className='text-11px uppercase tracking-[0.04em] text-[color:var(--color-text-3)]'>
                {t('team.runtime.executionState', { defaultValue: 'Execution' })}
              </div>
              <div className='mt-4px text-12px text-[color:var(--color-text-1)]'>
                {summarizeRuntimeValue(activeExecutionInfo?.executionKind)} / {summarizeRuntimeValue(activeExecutionInfo?.state)}
              </div>
            </div>
            <div className='rounded-8px bg-[var(--color-fill-1)] px-10px py-8px'>
              <div className='text-11px uppercase tracking-[0.04em] text-[color:var(--color-text-3)]'>
                {t('team.runtime.orchestrationMode', { defaultValue: 'Orchestration' })}
              </div>
              <div className='mt-4px text-12px text-[color:var(--color-text-1)]'>
                {summarizeRuntimeValue(activeExecutionInfo?.orchestrationMode)}
              </div>
            </div>
            <div className='rounded-8px bg-[var(--color-fill-1)] px-10px py-8px'>
              <div className='text-11px uppercase tracking-[0.04em] text-[color:var(--color-text-3)]'>
                {t('team.runtime.recoveryState', { defaultValue: 'Recovery' })}
              </div>
              <div className='mt-4px text-12px text-[color:var(--color-text-1)]'>
                {summarizeRuntimeValue(activeRecoveryPlan?.status)} / {summarizeRuntimeValue(activeRecoveryPlan?.mode)}
              </div>
            </div>
            <div className='rounded-8px bg-[var(--color-fill-1)] px-10px py-8px'>
              <div className='text-11px uppercase tracking-[0.04em] text-[color:var(--color-text-3)]'>
                {t('team.runtime.tasks', { defaultValue: 'Tasks' })}
              </div>
              <div className='mt-4px text-12px text-[color:var(--color-text-1)]'>
                {t('team.runtime.taskSummary', {
                  defaultValue: 'Pending {{pending}}, waiting {{waiting}}',
                  pending: activeDiagnostics?.taskDiagnostics.pending ?? 0,
                  waiting: activeDiagnostics?.taskDiagnostics.waiting.length ?? 0,
                })}
              </div>
            </div>
          </div>

          <div className='mt-8px flex flex-wrap gap-6px'>
            <span className='rounded-full bg-[var(--color-fill-1)] px-8px py-4px text-11px text-[color:var(--color-text-2)]'>
              {t('team.runtime.degradedMembers', {
                defaultValue: 'Degraded members: {{count}}',
                count: activeDiagnostics?.degradedMembers.length ?? 0,
              })}
            </span>
            {activeExecutionInfo?.recovery?.lastKnownState ? (
              <span className='rounded-full bg-[var(--color-fill-1)] px-8px py-4px text-11px text-[color:var(--color-text-2)]'>
                {t('team.runtime.lastKnownState', {
                  defaultValue: 'Last known state: {{state}}',
                  state: activeExecutionInfo.recovery.lastKnownState,
                })}
              </span>
            ) : null}
          </div>

          {activeRecoveryPlan?.blockers.length ? (
            <div className='mt-10px text-12px text-[color:var(--color-text-2)]'>
              <div className='font-medium text-[color:var(--color-text-1)]'>
                {t('team.runtime.blockers', { defaultValue: 'Blockers' })}
              </div>
              <ul className='mb-0 mt-4px pl-18px'>
                {activeRecoveryPlan.blockers.map((blocker) => (
                  <li key={blocker}>{blocker}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {planSteps.length ? (
            <div className='mt-10px text-12px text-[color:var(--color-text-2)]'>
              <div className='font-medium text-[color:var(--color-text-1)]'>
                {t('team.runtime.planSteps', { defaultValue: 'Plan Steps' })}
              </div>
              <ul className='mb-0 mt-4px pl-18px'>
                {planSteps.map((step) => (
                  <li key={step.id}>
                    {step.title} [{step.status}]
                    {step.detail ? ` - ${step.detail}` : ''}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {executedRecovery?.actionsApplied.length ? (
            <div className='mt-10px text-12px text-[color:var(--color-text-2)]'>
              <div className='font-medium text-[color:var(--color-text-1)]'>
                {t('team.runtime.actionsApplied', { defaultValue: 'Actions Applied' })}
              </div>
              <div className='mt-4px'>{executedRecovery.actionsApplied.join(', ')}</div>
            </div>
          ) : null}

          {executedRecovery?.replayMessage ? (
            <div className='mt-10px text-12px text-[color:var(--color-text-2)]'>
              <div className='font-medium text-[color:var(--color-text-1)]'>
                {t('team.runtime.replayMessage', { defaultValue: 'Replay Message' })}
              </div>
              <pre className='mt-4px whitespace-pre-wrap rounded-6px bg-[var(--color-fill-2)] px-8px py-8px text-11px leading-18px text-[color:var(--color-text-2)]'>
                {executedRecovery.replayMessage}
              </pre>
            </div>
          ) : null}

          {summaryItems.length ? (
            <div className='mt-10px text-12px text-[color:var(--color-text-2)]'>
              <div className='font-medium text-[color:var(--color-text-1)]'>
                {t('team.runtime.summary', { defaultValue: 'Summary' })}
              </div>
              <div className='mt-4px flex flex-wrap gap-6px'>
                {summaryItems.map((item) => (
                  <span key={item} className='rounded-full bg-[var(--color-fill-2)] px-8px py-4px text-11px'>
                    {item}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
