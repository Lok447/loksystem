/**
 * @license
 * Copyright 2025 LokSystem (loksystem.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { AionrsModelSelection, UseAionrsModelSelectionOptions } from '../aionrs/useAionrsModelSelection';
import { useAionrsModelSelection } from '../aionrs/useAionrsModelSelection';
import BaseLokCliChat from '../aionrs/AionrsChat';
import BaseLokCliSendBox from '../aionrs/AionrsSendBox';
import BaseLokCliModelSelector from '../aionrs/AionrsModelSelector';

export type LokCliModelSelection = AionrsModelSelection;
export type UseLokCliModelSelectionOptions = UseAionrsModelSelectionOptions;

export const useLokCliModelSelection = (options: UseLokCliModelSelectionOptions): LokCliModelSelection =>
  useAionrsModelSelection(options);

export const LokCliRuntimeChat = BaseLokCliChat;
export const LokCliRuntimeSendBox = BaseLokCliSendBox;
export const LokCliRuntimeModelSelector = BaseLokCliModelSelector;
