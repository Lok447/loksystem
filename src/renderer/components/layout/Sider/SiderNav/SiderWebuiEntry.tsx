/**
 * @license
 * Copyright 2025 LokSystem (loksystem.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Communication, Earth } from '@icon-park/react';
import { isElectronDesktop } from '@renderer/utils/platform';
import type { SiderTooltipProps } from '@renderer/utils/ui/siderTooltip';
import { MANAGEMENT_LABELS } from '@renderer/constants/managementUi';
import SiderQuickAccessEntry from './SiderQuickAccessEntry';

interface SiderWebuiEntryProps {
  isMobile: boolean;
  isActive: boolean;
  collapsed: boolean;
  siderTooltipProps: SiderTooltipProps;
  onClick: () => void;
}

const SiderWebuiEntry: React.FC<SiderWebuiEntryProps> = (props) => {
  const icon = isElectronDesktop() ? <Earth /> : <Communication />;

  return <SiderQuickAccessEntry {...props} label={MANAGEMENT_LABELS.webui} icon={icon} />;
};

export default SiderWebuiEntry;
