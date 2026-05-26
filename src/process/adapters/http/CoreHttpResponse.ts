/**
 * @license
 * Copyright 2025 LokSystem (loksystem.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Response } from 'express';
import { CoreServiceError } from '@process/core/shared';

export interface CoreHttpErrorResponse {
  statusCode: number;
  message: string;
  details?: string[];
}

export function getCoreHttpErrorResponse(error: unknown, fallbackMessage = 'Internal server error'): CoreHttpErrorResponse {
  if (error instanceof CoreServiceError) {
    const details = Array.isArray((error as { details?: unknown }).details)
      ? ((error as { details?: string[] }).details ?? [])
      : undefined;

    return {
      statusCode: error.statusCode,
      message: error.message,
      ...(details ? { details } : {}),
    };
  }

  return {
    statusCode: 500,
    message: fallbackMessage,
  };
}

export function sendCoreHttpErrorResponse(
  res: Response,
  error: unknown,
  options: {
    messageField?: 'error' | 'message' | 'msg';
    fallbackMessage?: string;
    includeDetails?: boolean;
  } = {}
): void {
  const {
    messageField = 'error',
    fallbackMessage,
    includeDetails = false,
  } = options;
  const coreError = getCoreHttpErrorResponse(error, fallbackMessage);

  res.status(coreError.statusCode).json({
    success: false,
    [messageField]: coreError.message,
    ...(includeDetails && coreError.details ? { details: coreError.details } : {}),
  });
}
