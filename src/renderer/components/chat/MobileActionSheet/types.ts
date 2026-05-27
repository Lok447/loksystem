/**
 * @license
 * Copyright 2025 LokSystem (loksystem.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ReactNode } from 'react';

export interface MobileActionSheetOption {
  key: string;
  label: ReactNode;
  description?: ReactNode;
  active?: boolean;
}

export interface MobileActionSheetSubMenu {
  title: ReactNode;
  options: MobileActionSheetOption[];
  onSelect: (key: string) => void;
  emptyText?: ReactNode;
  selectable?: boolean;
}

export interface MobileActionSheetEntry {
  key: string;
  icon?: ReactNode;
  label: ReactNode;
  description?: ReactNode;
  meta?: ReactNode;
  variant?: 'primary' | 'muted';
  dividerBefore?: boolean;
  submenu?: MobileActionSheetSubMenu;
  onClick?: () => void;
  disabled?: boolean;
}

export interface MobileActionSheetProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  entries: MobileActionSheetEntry[];
}
