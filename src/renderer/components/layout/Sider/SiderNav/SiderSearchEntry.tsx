/**
 * @license
 * Copyright 2025 LokSystem (loksystem.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Tooltip } from '@arco-design/web-react';
import classNames from 'classnames';
import ConversationSearchPopover from '@renderer/pages/conversation/GroupedHistory/ConversationSearchPopover';
import type { SiderTooltipProps } from '@renderer/utils/ui/siderTooltip';
import { MANAGEMENT_LABELS } from '@renderer/constants/managementUi';

interface SiderSearchEntryProps {
  isMobile: boolean;
  collapsed: boolean;
  siderTooltipProps: SiderTooltipProps;
  onConversationSelect: () => void;
  onSessionClick?: () => void;
}

const SiderSearchEntry: React.FC<SiderSearchEntryProps> = ({
  isMobile,
  collapsed,
  siderTooltipProps,
  onConversationSelect,
  onSessionClick,
}) => {
  if (collapsed) {
    return (
      <Tooltip {...siderTooltipProps} content={MANAGEMENT_LABELS.search} position='right'>
        <div className='w-full'>
          <ConversationSearchPopover
            onSessionClick={onSessionClick}
            onConversationSelect={onConversationSelect}
            label={MANAGEMENT_LABELS.search}
            buttonClassName='!w-full !h-40px !py-0 !px-0 !justify-center !rd-8px !hover:bg-fill-3 !active:bg-fill-4'
          />
        </div>
      </Tooltip>
    );
  }

  return (
    <Tooltip {...siderTooltipProps} content={MANAGEMENT_LABELS.search} position='right'>
      <div className='w-full'>
        <ConversationSearchPopover
          onSessionClick={onSessionClick}
          onConversationSelect={onConversationSelect}
          label={MANAGEMENT_LABELS.search}
          fullWidth
          buttonClassName={classNames(isMobile && 'sider-action-btn-mobile')}
        />
      </div>
    </Tooltip>
  );
};

export default SiderSearchEntry;
