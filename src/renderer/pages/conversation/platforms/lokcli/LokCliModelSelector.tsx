/**
 * @license
 * Copyright 2025 LokSystem (loksystem.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import AionrsModelSelector from '../aionrs/AionrsModelSelector';
import type { LokCliModelSelection } from './useLokCliModelSelection';

const LokCliModelSelector: React.FC<{
  selection?: LokCliModelSelection;
  disabled?: boolean;
  label?: string;
  variant?: 'header' | 'settings';
}> = (props) => {
  return <AionrsModelSelector {...props} />;
};

export default LokCliModelSelector;
