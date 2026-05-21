import { describe, expect, it } from 'vitest';

import {
  getWebRuntimeServerOrigin,
  getWebRuntimeWebSocketUrl,
  isWebRuntimeDevServer,
  resolveWebRuntimeServerPath,
} from '@/common/utils/webRuntimeOrigin';

describe('webRuntimeOrigin', () => {
  it('treats the Vite renderer port as a dev-server frontend origin', () => {
    expect(
      isWebRuntimeDevServer({
        protocol: 'http:',
        hostname: 'localhost',
        host: 'localhost:5173',
        port: '5173',
      })
    ).toBe(true);
  });

  it('maps dev-server requests to the WebUI backend origin', () => {
    const locationLike = {
      protocol: 'http:',
      hostname: 'localhost',
      host: 'localhost:5173',
      port: '5173',
    };

    expect(getWebRuntimeServerOrigin(locationLike)).toBe('http://localhost:25809');
    expect(getWebRuntimeWebSocketUrl(locationLike)).toBe('ws://localhost:25809');
    expect(resolveWebRuntimeServerPath('/api/auth/user', locationLike)).toBe('http://localhost:25809/api/auth/user');
  });

  it('keeps same-origin paths unchanged for real WebUI hosts', () => {
    const locationLike = {
      protocol: 'http:',
      hostname: 'localhost',
      host: 'localhost:25809',
      port: '25809',
    };

    expect(getWebRuntimeServerOrigin(locationLike)).toBe('http://localhost:25809');
    expect(resolveWebRuntimeServerPath('/login', locationLike)).toBe('/login');
  });
});
