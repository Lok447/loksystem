/**
 * @license
 * Copyright 2025 LokSystem (loksystem.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import type { LokCliModelSelection } from './useLokCliModelSelection';
import { LokCliRuntimeChat } from './LokCliShared';

const LokCliChat: React.FC<{
  conversation_id: string;
  workspace: string;
  modelSelection: LokCliModelSelection;
  teamId?: string;
  agentSlotId?: string;
  sessionMode?: string;
  emptySlot?: React.ReactNode;
}> = (props) => {
  return <LokCliRuntimeChat {...props} />;
};

export default LokCliChat;
