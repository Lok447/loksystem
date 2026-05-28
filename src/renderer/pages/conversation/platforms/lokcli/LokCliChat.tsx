/**
 * @license
 * Copyright 2025 LokSystem (loksystem.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import AionrsChat from '../aionrs/AionrsChat';
import type { LokCliModelSelection } from './useLokCliModelSelection';

const LokCliChat: React.FC<{
  conversation_id: string;
  workspace: string;
  modelSelection: LokCliModelSelection;
  teamId?: string;
  agentSlotId?: string;
  sessionMode?: string;
  emptySlot?: React.ReactNode;
}> = (props) => {
  return <AionrsChat {...props} />;
};

export default LokCliChat;
