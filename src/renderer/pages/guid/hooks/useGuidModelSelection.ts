/**
 * @license
 * Copyright 2025 LokSystem (loksystem.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { readLokCliDefaultModel, writeLokCliDefaultModel } from '@/common/config/lokcliCompatibility';
import type { IProvider, TProviderWithModel } from '@/common/config/storage';
import { configService } from '@/common/config/configService';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import useSWR from 'swr';
import { hasAvailableModels } from '../utils/modelUtils';

const buildModelKey = (providerId?: string, modelName?: string) => {
  if (!providerId || !modelName) return null;
  return `${providerId}:${modelName}`;
};

const isModelKeyAvailable = (key: string | null, providers?: IProvider[]) => {
  if (!key || !providers || providers.length === 0) return false;
  return providers.some((provider) => {
    if (!provider.id || !provider.model?.length) return false;
    return provider.model.some((modelName) => buildModelKey(provider.id, modelName) === key);
  });
};

export type GuidModelSelectionResult = {
  modelList: IProvider[];
  currentModel: TProviderWithModel | undefined;
  setCurrentModel: (modelInfo: TProviderWithModel) => Promise<void>;
};

/**
 * Hook that manages LokCLI model selection for the Guid page.
 */
export const useGuidModelSelection = (): GuidModelSelectionResult => {
  const { data: modelConfig } = useSWR('model.config.welcome', () =>
    ipcBridge.mode.getModelConfig.invoke().then((data) => (data || []).filter((platform) => !!platform.model.length))
  );

  const modelList = useMemo(() => (modelConfig || []).filter(hasAvailableModels), [modelConfig]);

  const [currentModel, _setCurrentModel] = useState<TProviderWithModel>();
  const selectedModelKeyRef = useRef<string | null>(null);
  const prevStorageKeyRef = useRef<string | null>(null);

  const setCurrentModel = useCallback(
    async (modelInfo: TProviderWithModel) => {
      selectedModelKeyRef.current = buildModelKey(modelInfo.id, modelInfo.useModel);
      await writeLokCliDefaultModel(configService.set, { id: modelInfo.id, useModel: modelInfo.useModel }).catch(
        (error) => {
        console.error('Failed to save default model:', error);
        }
      );
      _setCurrentModel(modelInfo);
    },
    []
  );

  useEffect(() => {
    const setDefaultModel = async () => {
      if (!modelList || modelList.length === 0) {
        return;
      }

      const providerNamespace = 'lokcli';
      const agentChanged = prevStorageKeyRef.current !== null && prevStorageKeyRef.current !== providerNamespace;
      prevStorageKeyRef.current = providerNamespace;
      if (agentChanged) {
        selectedModelKeyRef.current = null;
      }

      const currentKey = selectedModelKeyRef.current || buildModelKey(currentModel?.id, currentModel?.useModel);
      if (!agentChanged && isModelKeyAvailable(currentKey, modelList)) {
        if (!selectedModelKeyRef.current && currentKey) {
          selectedModelKeyRef.current = currentKey;
        }
        return;
      }

      const savedModel = await readLokCliDefaultModel(configService.get);
      const isNewFormat = savedModel && typeof savedModel === 'object' && 'id' in savedModel;

      let defaultModel: IProvider | undefined;
      let resolvedUseModel: string;

      if (isNewFormat) {
        const { id, useModel } = savedModel;
        const exactMatch = modelList.find((model) => model.id === id);
        if (exactMatch && exactMatch.model.includes(useModel)) {
          defaultModel = exactMatch;
          resolvedUseModel = useModel;
        } else {
          defaultModel = modelList[0];
          resolvedUseModel = defaultModel?.model[0] ?? '';
        }
      } else if (typeof savedModel === 'string') {
        defaultModel = modelList.find((model) => model.model.includes(savedModel)) || modelList[0];
        resolvedUseModel = defaultModel?.model.includes(savedModel) ? savedModel : (defaultModel?.model[0] ?? '');
      } else {
        defaultModel = modelList[0];
        resolvedUseModel = defaultModel?.model[0] ?? '';
      }

      if (!defaultModel || !resolvedUseModel) return;

      await setCurrentModel({
        ...defaultModel,
        useModel: resolvedUseModel,
      });
    };

    setDefaultModel().catch((error) => {
      console.error('Failed to set default model:', error);
    });
  }, [currentModel?.id, currentModel?.useModel, modelList, setCurrentModel]);

  return {
    modelList,
    currentModel,
    setCurrentModel,
  };
};
