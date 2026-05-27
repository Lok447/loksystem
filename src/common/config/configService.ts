/**
 * @license
 * Copyright 2025 LokSystem (loksystem.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ConfigStorage, type IConfigStorageRefer } from './storage';

export type ConfigKey = keyof IConfigStorageRefer;
export type ConfigValue<K extends ConfigKey> = IConfigStorageRefer[K];
export type ConfigChange<K extends ConfigKey = ConfigKey> = {
  key: K;
  value: IConfigStorageRefer[K] | undefined;
};

type ConfigListener<K extends ConfigKey = ConfigKey> = (change: ConfigChange<K>) => void;

const cache = new Map<ConfigKey, IConfigStorageRefer[ConfigKey] | undefined>();
const listeners = new Map<ConfigKey, Set<ConfigListener>>();
const globalListeners = new Set<ConfigListener>();
const pending = new Map<ConfigKey, Promise<IConfigStorageRefer[ConfigKey] | undefined>>();

const emitChange = <K extends ConfigKey>(key: K, value: IConfigStorageRefer[K] | undefined): void => {
  const change: ConfigChange<K> = { key, value };
  listeners.get(key)?.forEach((listener) => {
    listener(change);
  });
  globalListeners.forEach((listener) => {
    listener(change as ConfigChange);
  });
};

const readFromStorage = async <K extends ConfigKey>(key: K): Promise<IConfigStorageRefer[K] | undefined> => {
  const stored = (await ConfigStorage.get(key)) as IConfigStorageRefer[K] | undefined;
  cache.set(key, stored);
  return stored;
};

export const configService = {
  async get<K extends ConfigKey>(key: K, options?: { force?: boolean }): Promise<IConfigStorageRefer[K] | undefined> {
    if (!options?.force && cache.has(key)) {
      return cache.get(key) as IConfigStorageRefer[K] | undefined;
    }

    const pendingRead = pending.get(key);
    if (pendingRead && !options?.force) {
      return pendingRead as Promise<IConfigStorageRefer[K] | undefined>;
    }

    const task = readFromStorage(key).finally(() => {
      pending.delete(key);
    });
    pending.set(key, task);
    return task as Promise<IConfigStorageRefer[K] | undefined>;
  },

  getCached<K extends ConfigKey>(key: K): IConfigStorageRefer[K] | undefined {
    return cache.get(key) as IConfigStorageRefer[K] | undefined;
  },

  async set<K extends ConfigKey>(key: K, value: IConfigStorageRefer[K]): Promise<IConfigStorageRefer[K]> {
    await ConfigStorage.set(key, value);
    cache.set(key, value);
    emitChange(key, value);
    return value;
  },

  async remove<K extends ConfigKey>(key: K): Promise<void> {
    await ConfigStorage.remove(key);
    cache.delete(key);
    emitChange(key, undefined);
  },

  async refresh<K extends ConfigKey>(key: K): Promise<IConfigStorageRefer[K] | undefined> {
    const value = await this.get(key, { force: true });
    emitChange(key, value);
    return value;
  },

  subscribe<K extends ConfigKey>(key: K, listener: ConfigListener<K>): () => void {
    const typedListener = listener as ConfigListener;
    const keyListeners = listeners.get(key) ?? new Set<ConfigListener>();
    keyListeners.add(typedListener);
    listeners.set(key, keyListeners);
    return () => {
      const currentListeners = listeners.get(key);
      currentListeners?.delete(typedListener);
      if (currentListeners && currentListeners.size === 0) {
        listeners.delete(key);
      }
    };
  },

  subscribeAll(listener: ConfigListener): () => void {
    globalListeners.add(listener);
    return () => {
      globalListeners.delete(listener);
    };
  },

  notify<K extends ConfigKey>(key: K, value: IConfigStorageRefer[K] | undefined): void {
    cache.set(key, value);
    emitChange(key, value);
  },
};

export const loadConfigValue = <K extends ConfigKey>(
  key: K,
  fallback: NonNullable<IConfigStorageRefer[K]>
): Promise<NonNullable<IConfigStorageRefer[K]>> => {
  return configService.get(key).then((value) => (value ?? fallback) as NonNullable<IConfigStorageRefer[K]>);
};
