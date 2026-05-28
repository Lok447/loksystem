/**
 * @license
 * Copyright 2025 LokSystem (loksystem.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  useAionrsModelSelection,
  type AionrsModelSelection,
  type UseAionrsModelSelectionOptions,
} from '../aionrs/useAionrsModelSelection';

export type LokCliModelSelection = AionrsModelSelection;
export type UseLokCliModelSelectionOptions = UseAionrsModelSelectionOptions;

export const useLokCliModelSelection = (options: UseLokCliModelSelectionOptions): LokCliModelSelection =>
  useAionrsModelSelection(options);
