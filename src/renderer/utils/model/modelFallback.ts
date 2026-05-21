import type { IProvider } from '@/common/config/storage';

/**
 * Score a model name for fallback priority.
 * Lower scores are preferred (lighter models first).
 */
export const scoreModel = (modelName: string): number => {
  const lower = modelName.toLowerCase();
  let score = 0;
  if (lower.includes('lite')) score -= 2;
  if (lower.includes('flash')) score -= 1;
  if (lower.includes('pro')) score += 2;
  return score;
};

export type ResolveFallbackParams = {
  currentModel: { id: string; useModel: string } | undefined;
  providers: IProvider[];
  getAvailableModels: (provider: IProvider) => string[];
  exhaustedModels: Set<string>;
};

/**
 * Find a fallback model when the current model's quota is exhausted.
 * Returns the provider and model name to switch to, or null if no
 * fallback is available.
 */
export const resolveFallbackTarget = (params: ResolveFallbackParams): { provider: IProvider; model: string } | null => {
  const { currentModel, providers, getAvailableModels, exhaustedModels } = params;

  if (!currentModel) return null;
  const provider = providers.find((item) => item.id === currentModel.id);
  if (!provider) return null;

  const candidates = getAvailableModels(provider).filter(
    (model) => model && model !== currentModel.useModel && !exhaustedModels.has(model) && model !== 'manual'
  );

  if (!candidates.length) return null;
  const sortedCandidates = [...candidates].toSorted((a, b) => {
    const scoreA = scoreModel(a);
    const scoreB = scoreModel(b);
    if (scoreA !== scoreB) return scoreA - scoreB;
    return a.localeCompare(b);
  });
  return { provider, model: sortedCandidates[0] };
};
