/**
 * @license
 * Copyright 2025 LokSystem (loksystem.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import crypto from 'crypto';
import type { Request } from 'express';
import type { IncomingMessage } from 'http';
import * as cookie from 'cookie';

export const AUTH_DEVICE_COOKIE_NAME = 'loksystem-device';
export const AUTH_DEVICE_ID_HEADER = 'x-loksystem-device-id';
export const AUTH_DEVICE_NAME_HEADER = 'x-loksystem-device-name';

export interface AuthSessionContext {
  deviceId?: string | null;
  deviceName?: string | null;
}

export interface ResolvedAuthSessionContext extends AuthSessionContext {
  deviceId: string;
  deviceName: string;
  wasGenerated: boolean;
}

function normalizeDeviceId(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const normalized = trimmed.replace(/[^a-zA-Z0-9._-]/g, '');
  if (!normalized) {
    return null;
  }
  return normalized.slice(0, 128);
}

function normalizeDeviceName(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim().replace(/\s+/g, ' ');
  if (!trimmed) {
    return null;
  }
  return trimmed.slice(0, 255);
}

function deriveDeviceName(headers: Record<string, string | string[] | undefined>, explicitName?: string | null): string {
  const normalizedExplicitName = normalizeDeviceName(explicitName);
  if (normalizedExplicitName) {
    return normalizedExplicitName;
  }

  const userAgentHeader = headers['user-agent'];
  const userAgent = Array.isArray(userAgentHeader) ? userAgentHeader[0] : userAgentHeader;
  const normalizedUserAgent = normalizeDeviceName(userAgent);
  if (normalizedUserAgent) {
    return normalizedUserAgent;
  }

  return 'web-client';
}

function parseCookieHeader(header: string | undefined): Record<string, string> {
  if (typeof header !== 'string' || header.trim() === '') {
    return {};
  }
  try {
    return cookie.parse(header);
  } catch {
    return {};
  }
}

function resolveHeadersDeviceId(
  headers: Record<string, string | string[] | undefined>,
  cookieValue?: string | undefined
): { deviceId: string; wasGenerated: boolean } {
  const headerValue = headers[AUTH_DEVICE_ID_HEADER];
  const normalizedHeaderValue = normalizeDeviceId(Array.isArray(headerValue) ? headerValue[0] : headerValue);
  if (normalizedHeaderValue) {
    return {
      deviceId: normalizedHeaderValue,
      wasGenerated: false,
    };
  }

  const normalizedCookieValue = normalizeDeviceId(cookieValue);
  if (normalizedCookieValue) {
    return {
      deviceId: normalizedCookieValue,
      wasGenerated: false,
    };
  }

  return {
    deviceId: crypto.randomUUID(),
    wasGenerated: true,
  };
}

export function resolveRequestAuthSessionContext(req: Pick<Request, 'headers' | 'cookies'>): ResolvedAuthSessionContext {
  const cookieDeviceId =
    typeof req.cookies?.[AUTH_DEVICE_COOKIE_NAME] === 'string' ? req.cookies[AUTH_DEVICE_COOKIE_NAME] : undefined;
  const { deviceId, wasGenerated } = resolveHeadersDeviceId(
    req.headers as Record<string, string | string[] | undefined>,
    cookieDeviceId
  );
  const headerDeviceName = req.headers[AUTH_DEVICE_NAME_HEADER];

  return {
    deviceId,
    deviceName: deriveDeviceName(
      req.headers as Record<string, string | string[] | undefined>,
      Array.isArray(headerDeviceName) ? headerDeviceName[0] : headerDeviceName
    ),
    wasGenerated,
  };
}

export function resolveWebSocketAuthSessionContext(req: IncomingMessage): ResolvedAuthSessionContext {
  const cookies = parseCookieHeader(typeof req.headers.cookie === 'string' ? req.headers.cookie : undefined);
  const { deviceId, wasGenerated } = resolveHeadersDeviceId(
    req.headers as Record<string, string | string[] | undefined>,
    cookies[AUTH_DEVICE_COOKIE_NAME]
  );
  const headerDeviceName = req.headers[AUTH_DEVICE_NAME_HEADER];

  return {
    deviceId,
    deviceName: deriveDeviceName(
      req.headers as Record<string, string | string[] | undefined>,
      Array.isArray(headerDeviceName) ? headerDeviceName[0] : headerDeviceName
    ),
    wasGenerated,
  };
}
