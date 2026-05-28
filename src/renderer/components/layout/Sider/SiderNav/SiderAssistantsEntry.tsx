/**
 * @license
 * Copyright 2025 LokSystem (loksystem.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Robot } from '@icon-park/react';
import type { SiderTooltipProps } from '@renderer/utils/ui/siderTooltip';
import { MANAGEMENT_LABELS } from '@renderer/constants/managementUi';
import SiderQuickAccessEntry from './SiderQuickAccessEntry';

interface SiderAssistantsEntryProps {
  isMobile: boolean;
  isActive: boolean;
  collapsed: boolean;
  siderTooltipProps: SiderTooltipProps;
  onClick: () => void;
}

const SiderAssistantsEntry: React.FC<SiderAssistantsEntryProps> = (props) => {
  return <SiderQuickAccessEntry {...props} label={MANAGEMENT_LABELS.assistants} icon={<Robot />} />;
};

export default SiderAssistantsEntry;
