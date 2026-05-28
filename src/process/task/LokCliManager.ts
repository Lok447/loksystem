/**
 * @license
 * Copyright 2025 LokSystem (loksystem.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { AionrsManager } from './AionrsManager';
import type { TProviderWithModel } from '@/common/config/storage';

type LokCliManagerData = ConstructorParameters<typeof AionrsManager>[0];

/**
 * Transitional runtime wrapper for LokCLI conversations.
 *
 * User-facing routing has already converged on `lokcli`, while the underlying
 * provider-backed runtime still temporarily reuses the mature AionrsManager
 * execution path. This wrapper gives process-side routing a dedicated LokCLI
 * identity so we can continue the Hermes migration without exposing `aionrs`
 * as the primary concept.
 */
export class LokCliManager extends AionrsManager {
  constructor(data: LokCliManagerData, model: TProviderWithModel) {
    super(data, model, 'lokcli');
  }
}

