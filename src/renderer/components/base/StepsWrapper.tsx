/**
 * @license
 * Copyright 2025 LokSystem (loksystem.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Steps } from '@arco-design/web-react';
import type { StepsProps } from '@arco-design/web-react/es/Steps';
import React from 'react';

interface StepsWrapperProps extends StepsProps {
  className?: string;
}

const StepsWrapper: React.FC<StepsWrapperProps> & { Step: typeof Steps.Step } = ({ className, ...props }) => {
  return <Steps {...props} className={`loksystem-steps ${className || ''}`} />;
};

StepsWrapper.Step = Steps.Step;

export default StepsWrapper;
