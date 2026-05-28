/**
 * @license
 * Copyright 2025 LokSystem (loksystem.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IConfigStorageRefer } from './storage';

type ConfigKey = keyof IConfigStorageRefer;

type ConfigReader = <K extends ConfigKey>(key: K) => Promise<IConfigStorageRefer[K] | undefined>;
type ConfigWriter = <K extends ConfigKey>(key: K, value: IConfigStorageRefer[K]) => Promise<unknown>;

export type LokCliConfig = NonNullable<IConfigStorageRefer['lokcli.config']>;
export type LokCliDefaultModel = NonNullable<IConfigStorageRefer['lokcli.defaultModel']>;
export type ProviderBackedStoredModel =
  | IConfigStorageRefer['lokcli.defaultModel']
  | IConfigStorageRefer['gemini.defaultModel'];

export const isLokCliProviderBackend = (backend?: string): boolean => backend === 'hermes' || backend === 'aionrs';

export const isProviderBackedAgent = (backend?: string): boolean =>
  backend === 'gemini' || isLokCliProviderBackend(backend);

export async function readLokCliConfig(read: ConfigReader): Promise<IConfigStorageRefer['lokcli.config'] | undefined> {
  return read('lokcli.config');
}

export async function writeLokCliConfig(write: ConfigWriter, value: LokCliConfig): Promise<void> {
  await write('lokcli.config', value);
}

export async function readLokCliDefaultModel(
  read: ConfigReader
): Promise<IConfigStorageRefer['lokcli.defaultModel'] | IConfigStorageRefer['gemini.defaultModel'] | undefined> {
  const lokcliDefaultModel = await read('lokcli.defaultModel');
  if (lokcliDefaultModel) return lokcliDefaultModel;

  return read('gemini.defaultModel');
}

export async function writeLokCliDefaultModel(write: ConfigWriter, value: LokCliDefaultModel): Promise<void> {
  await write('lokcli.defaultModel', value);
}

export function getStoredProviderModelId(savedModel: ProviderBackedStoredModel): string | undefined {
  if (!savedModel) return undefined;
  if (typeof savedModel === 'string') return savedModel;
  if (typeof savedModel === 'object' && typeof savedModel.useModel === 'string') {
    return savedModel.useModel;
  }
  return undefined;
}
