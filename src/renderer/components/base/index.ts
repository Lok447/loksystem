/**
 * @license
 * Copyright 2025 LokSystem (loksystem.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * LokSystem 基础组件库统一导出 / LokSystem base components unified exports
 *
 * 提供所有基础组件和类型的统一导出入口
 * Provides unified export entry for all base components and types
 */

// ==================== 组件导出 / Component Exports ====================

export { default as LokModal } from './LokModal';
export { default as LokCollapse } from './LokCollapse';
export { default as LokSelect } from './LokSelect';
export { default as LokScrollArea } from './LokScrollArea';
export { default as LokSteps } from './LokSteps';

// ==================== 类型导出 / Type Exports ====================

// LokModal 类型 / LokModal types
export type {
  ModalSize,
  ModalHeaderConfig,
  ModalFooterConfig,
  ModalContentStyleConfig,
  LokModalProps,
} from './LokModal';
export { MODAL_SIZES } from './LokModal';

// LokCollapse 类型 / LokCollapse types
export type { LokCollapseProps, LokCollapseItemProps } from './LokCollapse';

// LokSelect 类型 / LokSelect types
export type { LokSelectProps } from './LokSelect';

// LokSteps 类型 / LokSteps types
export type { LokStepsProps } from './LokSteps';
