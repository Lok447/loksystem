import { ipcBridge } from '@/common';
import { configService } from '@/common/config/configService';
import type { IProvider } from '@/common/config/storage';
import { hasSpecificModelCapability } from '@/renderer/utils/model/modelCapabilities';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import useSWR from 'swr';

export interface ModelProviderListResult {
  providers: IProvider[];
  getAvailableModels: (provider: IProvider) => string[];
  formatModelLabel: (provider: { platform?: string } | undefined, modelName?: string) => string;
}

/**
 * Shared hook that builds the provider list for conversation and channel settings.
 */
export const useModelProviderList = (): ModelProviderListResult => {
  const { data: modelConfig, mutate } = useSWR('model.config.shared', () => ipcBridge.mode.getModelConfig.invoke());

  const availableModelsCacheRef = useRef(new Map<string, string[]>());

  useEffect(() => {
    availableModelsCacheRef.current.clear();
  }, [modelConfig]);

  useEffect(() => {
    return configService.subscribe('model.config', () => {
      void mutate();
    });
  }, [mutate]);

  const getAvailableModels = useCallback((provider: IProvider): string[] => {
    const modelEnabledKey = provider.modelEnabled ? JSON.stringify(provider.modelEnabled) : 'all-enabled';
    const cacheKey = `${provider.id}-${(provider.model || []).join(',')}-${modelEnabledKey}`;
    const cache = availableModelsCacheRef.current;
    if (cache.has(cacheKey)) {
      return cache.get(cacheKey)!;
    }

    const result: string[] = [];
    for (const modelName of provider.model || []) {
      const isModelEnabled = provider.modelEnabled?.[modelName] !== false;
      if (!isModelEnabled) continue;

      const functionCalling = hasSpecificModelCapability(provider, modelName, 'function_calling');
      const excluded = hasSpecificModelCapability(provider, modelName, 'excludeFromPrimary');
      if ((functionCalling === true || functionCalling === undefined) && excluded !== true) {
        result.push(modelName);
      }
    }

    cache.set(cacheKey, result);
    return result;
  }, []);

  const providers = useMemo(() => {
    const list = (Array.isArray(modelConfig) ? modelConfig : []).filter((provider) => provider.enabled !== false);
    return list.filter((provider) => getAvailableModels(provider).length > 0);
  }, [getAvailableModels, modelConfig]);

  const formatModelLabel = useCallback(
    (_provider: { platform?: string } | undefined, modelName?: string) => modelName || '',
    []
  );

  return { providers, getAvailableModels, formatModelLabel };
};
