/**
 * @license
 * Copyright 2025 LokSystem (loksystem.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { CoreServiceError } from '@process/core/shared/CoreServiceError';

export class CoreAuthValidator {
  public static requirePasswordChangeInput(currentPassword: string, newPassword: string): void {
    if (!currentPassword || !newPassword) {
      throw new CoreServiceError('Current password and new password are required', 400, 'invalid_request');
    }
  }

  public static rejectWeakPassword(errors: string[]): never {
    const error = new CoreServiceError(
      'New password does not meet security requirements',
      400,
      'weak_password'
    ) as CoreServiceError & { details?: string[] };
    error.details = errors;
    throw error;
  }

  public static requireQrToken(qrToken: string): void {
    if (!qrToken) {
      throw new CoreServiceError('QR token is required', 400, 'invalid_request');
    }
  }
}
