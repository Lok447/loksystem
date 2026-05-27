/**
 * @license
 * Copyright 2025 LokSystem (loksystem.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IProvider } from './storage';
import { configService } from './configService';

const PROVIDER_KEY = 'model.config';

const normalizeProviderList = (providers: IProvider[] | undefined): IProvider[] => {
  if (!Array.isArray(providers)) {
    return [];
  }
  return providers.map((provider) => ({
    ...provider,
    enabled: provider.enabled ?? true,
    model: Array.isArray(provider.model) ? provider.model : [],
  }));
};

export const providerService = {
  async list(): Promise<IProvider[]> {
    const providers = await configService.get(PROVIDER_KEY);
    return normalizeProviderList(providers);
  },

  async getById(providerId: string): Promise<IProvider | undefined> {
    const providers = await this.list();
    return providers.find((provider: IProvider) => provider.id === providerId);
  },

  async replaceAll(providers: IProvider[]): Promise<IProvider[]> {
    const normalized = normalizeProviderList(providers);
    await configService.set(PROVIDER_KEY, normalized);
    return normalized;
  },

  async upsert(provider: IProvider): Promise<IProvider[]> {
    const current = await this.list();
    const next = current.some((item: IProvider) => item.id === provider.id)
      ? current.map((item: IProvider) => (item.id === provider.id ? { ...item, ...provider } : item))
      : [...current, provider];
    return this.replaceAll(next);
  },

  async remove(providerId: string): Promise<IProvider[]> {
    const current = await this.list();
    return this.replaceAll(current.filter((item: IProvider) => item.id !== providerId));
  },

  async updateModelHealth(
    providerId: string,
    modelName: string,
    health: NonNullable<IProvider['modelHealth']>[string]
  ): Promise<IProvider[]> {
    const current = await this.list();
    const next = current.map((item: IProvider) => {
      if (item.id !== providerId) {
        return item;
      }
      const nextModelHealth = {
        ...(item.modelHealth || {}),
        [modelName]: health,
      } as NonNullable<IProvider['modelHealth']>;
      const nextItem: IProvider = {
        ...item,
        modelHealth: nextModelHealth,
      };
      return nextItem;
    });
    return this.replaceAll(next);
  },

  async clearAllModelHealth(): Promise<IProvider[]> {
    const current = await this.list();
    const next = current.map((item: IProvider) => {
      const nextItem: IProvider = {
        ...item,
        modelHealth: undefined,
      };
      return nextItem;
    });
    return this.replaceAll(next);
  },
};
