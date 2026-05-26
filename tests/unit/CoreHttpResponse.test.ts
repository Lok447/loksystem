/**
 * @license
 * Copyright 2025 LokSystem (loksystem.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi } from 'vitest';
import { CoreServiceError } from '@process/core/shared';
import { getCoreHttpErrorResponse, sendCoreHttpErrorResponse } from '@process/adapters/http';

describe('CoreHttpResponse adapter', () => {
  it('maps CoreServiceError to HTTP status and message', () => {
    const error = new CoreServiceError('Workspace mismatch', 403, 'workspace_mismatch');

    expect(getCoreHttpErrorResponse(error)).toEqual({
      statusCode: 403,
      message: 'Workspace mismatch',
    });
  });

  it('preserves validation details when a core error carries them', () => {
    const error = new CoreServiceError('Weak password', 400, 'weak_password') as CoreServiceError & {
      details?: string[];
    };
    error.details = ['Use at least 8 characters'];

    expect(getCoreHttpErrorResponse(error)).toEqual({
      statusCode: 400,
      message: 'Weak password',
      details: ['Use at least 8 characters'],
    });
  });

  it('keeps non-core errors behind the configured fallback message', () => {
    expect(getCoreHttpErrorResponse(new Error('database password leaked'))).toEqual({
      statusCode: 500,
      message: 'Internal server error',
    });
  });

  it('sends the selected response message field without changing route response shape', () => {
    const res = {
      status: vi.fn(() => res),
      json: vi.fn(),
    } as unknown as Parameters<typeof sendCoreHttpErrorResponse>[0];

    sendCoreHttpErrorResponse(res, new CoreServiceError('Missing file', 400, 'missing_file'), {
      messageField: 'msg',
    });

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      msg: 'Missing file',
    });
  });
});
