/**
 * @license
 * Copyright 2025 LokSystem (loksystem.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Lightning } from '@icon-park/react';
import type { SiderTooltipProps } from '@renderer/utils/ui/siderTooltip';
import { MANAGEMENT_LABELS } from '@renderer/constants/managementUi';
import SiderQuickAccessEntry from './SiderQuickAccessEntry';

interface SiderCapabilitiesEntryProps {
  isMobile: boolean;
  isActive: boolean;
  collapsed: boolean;
  siderTooltipProps: SiderTooltipProps;
  onClick: () => void;
}

const SiderCapabilitiesEntry: React.FC<SiderCapabilitiesEntryProps> = (props) => {
  return <SiderQuickAccessEntry {...props} label={MANAGEMENT_LABELS.capabilities} icon={<Lightning />} />;
};

export default SiderCapabilitiesEntry;
