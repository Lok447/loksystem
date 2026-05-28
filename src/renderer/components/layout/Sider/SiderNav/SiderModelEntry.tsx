/**
 * @license
 * Copyright 2025 LokSystem (loksystem.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { LinkCloud } from '@icon-park/react';
import type { SiderTooltipProps } from '@renderer/utils/ui/siderTooltip';
import { MANAGEMENT_LABELS } from '@renderer/constants/managementUi';
import SiderQuickAccessEntry from './SiderQuickAccessEntry';

interface SiderModelEntryProps {
  isMobile: boolean;
  isActive: boolean;
  collapsed: boolean;
  siderTooltipProps: SiderTooltipProps;
  onClick: () => void;
}

const SiderModelEntry: React.FC<SiderModelEntryProps> = ({
  isMobile,
  isActive,
  collapsed,
  siderTooltipProps,
  onClick,
}) => {
  return (
    <SiderQuickAccessEntry
      isMobile={isMobile}
      isActive={isActive}
      collapsed={collapsed}
      siderTooltipProps={siderTooltipProps}
      onClick={onClick}
      label={MANAGEMENT_LABELS.model}
      icon={<LinkCloud />}
    />
  );
};

export default SiderModelEntry;
