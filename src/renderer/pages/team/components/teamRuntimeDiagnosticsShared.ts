import { getRendererCoreClient } from '@/common/coreClient';
import type {
  CoreTeamRecoveryExecutionDto,
  CoreTeamRecoveryPreparationDto,
  CoreTeamRuntimeDiagnosticsDto,
} from '@process/core/shared/CoreContracts';
import { useMemo, useState } from 'react';
import useSWR from 'swr';

export async function fetchTeamRuntimeDiagnostics(teamId: string): Promise<CoreTeamRuntimeDiagnosticsDto | null> {
  const response = await getRendererCoreClient().teams.getRuntimeDiagnostics(teamId);
  if (!response.success) {
    throw new Error(response.msg || 'Failed to load team runtime diagnostics');
  }
  return response.data ?? null;
}

export function summarizeRuntimeValue(value: string | number | undefined): string {
  if (value === undefined || value === null || value === '') return '-';
  return String(value);
}

export function useTeamRuntimeDiagnostics(teamId: string) {
  const [preparedRecovery, setPreparedRecovery] = useState<CoreTeamRecoveryPreparationDto | null>(null);
  const [executedRecovery, setExecutedRecovery] = useState<CoreTeamRecoveryExecutionDto | null>(null);

  const swr = useSWR(teamId ? ['team-runtime-diagnostics', teamId] : null, () => fetchTeamRuntimeDiagnostics(teamId));

  const activeDiagnostics = executedRecovery?.diagnostics ?? preparedRecovery?.diagnostics ?? swr.data ?? null;
  const activeExecutionInfo =
    executedRecovery?.executionInfo ?? preparedRecovery?.executionInfo ?? activeDiagnostics?.executionInfo;
  const activeRecoveryPlan =
    executedRecovery?.recoveryPlan ?? preparedRecovery?.recoveryPlan ?? activeExecutionInfo?.recoveryPlan;

  const derived = useMemo(
    () => ({
      diagnostics: activeDiagnostics,
      executionInfo: activeExecutionInfo,
      recoveryPlan: activeRecoveryPlan,
      preparedRecovery,
      executedRecovery,
    }),
    [activeDiagnostics, activeExecutionInfo, activeRecoveryPlan, preparedRecovery, executedRecovery]
  );

  return {
    ...swr,
    ...derived,
    preparedRecovery,
    executedRecovery,
    setPreparedRecovery,
    setExecutedRecovery,
  };
}
