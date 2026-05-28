/**
 * @license
 * Copyright 2025 LokSystem (loksystem.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import type { LokCliModelSelection } from './useLokCliModelSelection';
import { LokCliRuntimeModelSelector } from './LokCliShared';

const LokCliModelSelector: React.FC<{
  selection?: LokCliModelSelection;
  disabled?: boolean;
  label?: string;
  variant?: 'header' | 'settings';
}> = (props) => {
  return <LokCliRuntimeModelSelector {...props} />;
};

export default LokCliModelSelector;
