/**
 * @license
 * Copyright 2025 LokSystem (loksystem.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { WEBUI_DEFAULT_PORT } from '@/common/config/constants';

const VITE_DEV_SERVER_PORT = '5173';

type LocationLike = Pick<Location, 'host' | 'hostname' | 'port' | 'protocol'>;

export function isWebRuntimeDevServer(locationLike: LocationLike): boolean {
  return locationLike.port === VITE_DEV_SERVER_PORT;
}

export function getWebRuntimeServerOrigin(locationLike: LocationLike): string {
  const protocol = locationLike.protocol === 'https:' ? 'https:' : 'http:';
  if (isWebRuntimeDevServer(locationLike)) {
    return `${protocol}//${locationLike.hostname}:${WEBUI_DEFAULT_PORT}`;
  }

  if (locationLike.host) {
    return `${protocol}//${locationLike.host}`;
  }

  return `${protocol}//${locationLike.hostname}:${WEBUI_DEFAULT_PORT}`;
}

export function getWebRuntimeWebSocketUrl(locationLike: LocationLike): string {
  const protocol = locationLike.protocol === 'https:' ? 'wss:' : 'ws:';
  const origin = getWebRuntimeServerOrigin(locationLike);
  return origin.replace(/^https?:/, protocol);
}

export function resolveWebRuntimeServerPath(path: string, locationLike: LocationLike): string {
  if (!path.startsWith('/')) {
    return path;
  }

  if (!isWebRuntimeDevServer(locationLike)) {
    return path;
  }

  return `${getWebRuntimeServerOrigin(locationLike)}${path}`;
}
