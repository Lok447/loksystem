/**
 * @license
 * Copyright 2025 LokSystem (loksystem.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Express, Request, Response } from 'express';
import { getCoreHttpErrorResponse, sendCoreHttpErrorResponse } from '@process/adapters/http';
import { CoreAuthService } from '@process/core/auth';
import { CoreServiceError } from '@process/core/shared';
import { AuthMiddleware } from '@process/webserver/auth/middleware/AuthMiddleware';
import { AUTH_CONFIG, getCookieOptions } from '../config/constants';
import { TokenUtils } from '@process/webserver/auth/middleware/TokenMiddleware';
import { createAppError } from '../middleware/errorHandler';
import { authRateLimiter, authenticatedActionLimiter, apiRateLimiter } from '../middleware/security';
import { AUTH_DEVICE_COOKIE_NAME, resolveRequestAuthSessionContext } from '@process/webserver/auth/sessionContext';

/**
 * QR 登录页面 HTML（静态，不包含用户输入）
 * QR login page HTML (static, no user input embedded)
 * JavaScript 直接从 URL 参数读取 token，避免 XSS
 * JavaScript reads token directly from URL params to prevent XSS
 */
const QR_LOGIN_PAGE_HTML = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>QR Login - LokSystem</title>
  <style>
    body { font-family: 'Segoe UI', 'Microsoft YaHei', sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; background: linear-gradient(135deg, #edf7f2 0%, #f8f1df 100%); }
    .container { text-align: center; padding: 40px; background: rgba(255,255,255,0.92); border: 1px solid rgba(20,94,67,0.12); border-radius: 18px; box-shadow: 0 18px 50px rgba(20,94,67,0.16); max-width: 400px; }
    .logo { width: 72px; height: 72px; object-fit: contain; border-radius: 12px; margin-bottom: 14px; }
    .brand { color: #145e43; font-weight: 700; letter-spacing: 0.04em; margin-bottom: 12px; }
    .loading { color: #145e43; font-size: 18px; }
    .success { color: #27ae60; }
    .error { color: #e74c3c; }
    .spinner { border: 3px solid #dce8df; border-top: 3px solid #145e43; border-radius: 50%; width: 40px; height: 40px; animation: spin 1s linear infinite; margin: 20px auto; }
    @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
    h2 { margin-bottom: 16px; }
    p { color: #666; margin-top: 12px; }
  </style>
</head>
<body>
  <div class="container" id="content">
    <img class="logo" src="/pwa/lok-icon-192.png" alt="Lok logo">
    <div class="brand">LokSystem WebUI</div>
    <div class="spinner"></div>
    <p class="loading">Verifying... / 验证中...</p>
  </div>
  <script>
    (async function() {
      var container = document.getElementById('content');
      var params = new URLSearchParams(window.location.search);
      var qrToken = params.get('token');
      if (!qrToken) {
        container.innerHTML = '<h2 class="error">Invalid QR Code</h2><p>The QR code is invalid or missing.</p><p>二维码无效或缺失。</p>';
        return;
      }
      try {
        var response = await fetch('/api/auth/qr-login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ qrToken: qrToken }),
          credentials: 'include'
        });
        var data = await response.json();
        if (data.success) {
          container.innerHTML = '<h2 class="success">Login Successful!</h2><p>Redirecting... / 登录成功，正在跳转...</p>';
          setTimeout(function() { window.location.href = '/'; }, 1000);
        } else {
          // XSS 安全修复：使用 textContent 而非 innerHTML 插入错误消息
          // XSS Security fix: Use textContent instead of innerHTML for error message
          var h2 = document.createElement('h2');
          h2.className = 'error';
          h2.textContent = 'Login Failed';
          var p1 = document.createElement('p');
          p1.textContent = data.error || 'QR code expired or invalid';
          var p2 = document.createElement('p');
          p2.textContent = '二维码已过期或无效，请重新扫描。';
          container.innerHTML = '';
          container.appendChild(h2);
          container.appendChild(p1);
          container.appendChild(p2);
        }
      } catch (e) {
        container.innerHTML = '<h2 class="error">Error</h2><p>Network error. Please try again.</p><p>网络错误，请重试。</p>';
      }
    })();
  </script>
</body>
</html>`;

/**
 * Register authentication routes.
 */
export function registerAuthRoutes(app: Express): void {
  app.post('/login', authRateLimiter, AuthMiddleware.validateLoginInput, async (req: Request, res: Response) => {
    try {
      const { username, password } = req.body;
      const sessionContext = resolveRequestAuthSessionContext(req);
      const result = await CoreAuthService.login(username, password, sessionContext);

      res.cookie(AUTH_CONFIG.COOKIE.NAME, result.token, {
        ...getCookieOptions(req),
        maxAge: AUTH_CONFIG.TOKEN.COOKIE_MAX_AGE,
      });
      res.cookie(AUTH_DEVICE_COOKIE_NAME, sessionContext.deviceId, {
        ...getCookieOptions(req),
        httpOnly: false,
        maxAge: AUTH_CONFIG.TOKEN.COOKIE_MAX_AGE,
      });

      res.json({
        success: true,
        message: 'Login successful',
        user: result.user,
        token: result.token,
      });
    } catch (error) {
      console.error('Login error:', error);
      sendCoreHttpErrorResponse(res, error, { messageField: 'message' });
    }
  });

  app.post(
    '/logout',
    apiRateLimiter,
    AuthMiddleware.authenticateToken,
    authenticatedActionLimiter,
    async (req: Request, res: Response) => {
      const token = TokenUtils.extractFromRequest(req);
      await CoreAuthService.logout(token);

      res.clearCookie(AUTH_CONFIG.COOKIE.NAME);
      res.clearCookie(AUTH_DEVICE_COOKIE_NAME);
      res.json({ success: true, message: 'Logged out successfully' });
    }
  );

  app.get('/api/auth/status', apiRateLimiter, async (_req: Request, res: Response) => {
    try {
      const status = await CoreAuthService.getStatus();
      res.json({
        success: true,
        ...status,
      });
    } catch (error) {
      console.error('Auth status error:', error);
      sendCoreHttpErrorResponse(res, error);
    }
  });

  app.get(
    '/api/auth/user',
    apiRateLimiter,
    AuthMiddleware.authenticateToken,
    authenticatedActionLimiter,
    (req: Request, res: Response) => {
      res.json({
        success: true,
        user: req.user,
      });
    }
  );

  app.post(
    '/api/auth/change-password',
    apiRateLimiter,
    AuthMiddleware.authenticateToken,
    authenticatedActionLimiter,
    async (req: Request, res: Response) => {
      try {
        const { currentPassword, newPassword } = req.body;

        await CoreAuthService.changePassword({
          userId: req.user!.id,
          currentPassword,
          newPassword,
        });

        res.json({
          success: true,
          message: 'Password changed successfully',
        });
      } catch (error) {
        console.error('Change password error:', error);
        sendCoreHttpErrorResponse(res, error, { includeDetails: true });
      }
    }
  );

  app.post('/api/auth/refresh', apiRateLimiter, authenticatedActionLimiter, async (req: Request, res: Response) => {
    try {
      const bodyToken = typeof req.body?.token === 'string' ? req.body.token : null;
      const token = bodyToken ?? TokenUtils.extractFromRequest(req);

      if (!token) {
        res.status(400).json({
          success: false,
          error: 'Token is required',
        });
        return;
      }

      const sessionContext = resolveRequestAuthSessionContext(req);
      const newToken = await CoreAuthService.refreshToken(token, sessionContext);

      if (!bodyToken && typeof req.cookies?.[AUTH_CONFIG.COOKIE.NAME] === 'string') {
        res.cookie(AUTH_CONFIG.COOKIE.NAME, newToken, {
          ...getCookieOptions(req),
          maxAge: AUTH_CONFIG.TOKEN.COOKIE_MAX_AGE,
        });
      }
      res.cookie(AUTH_DEVICE_COOKIE_NAME, sessionContext.deviceId, {
        ...getCookieOptions(req),
        httpOnly: false,
        maxAge: AUTH_CONFIG.TOKEN.COOKIE_MAX_AGE,
      });

      res.json({
        success: true,
        token: newToken,
      });
    } catch (error) {
      console.error('Token refresh error:', error);
      sendCoreHttpErrorResponse(res, error);
    }
  });

  app.get('/api/ws-token', apiRateLimiter, authenticatedActionLimiter, async (req: Request, res: Response, next) => {
    try {
      const sessionToken = TokenUtils.extractFromRequest(req);

      if (!sessionToken) {
        return next(createAppError('Unauthorized: Invalid or missing session', 401, 'unauthorized'));
      }

      const result = await CoreAuthService.getWebSocketToken(sessionToken);
      res.json({
        success: true,
        wsToken: result.wsToken,
        expiresIn: result.expiresIn,
      });
    } catch (error) {
      if (error instanceof CoreServiceError) {
        const authError = getCoreHttpErrorResponse(error);
        return next(createAppError(authError.message, authError.statusCode, error.code));
      }
      next(error);
    }
  });

  app.post('/api/auth/qr-login', authRateLimiter, async (req: Request, res: Response) => {
    try {
      const { qrToken } = req.body;
      const clientIP = req.ip || req.socket.remoteAddress || '';
      const sessionContext = resolveRequestAuthSessionContext(req);
      const result = await CoreAuthService.loginWithQrToken(qrToken, clientIP, sessionContext);

      res.cookie(AUTH_CONFIG.COOKIE.NAME, result.token, {
        ...getCookieOptions(req),
        maxAge: AUTH_CONFIG.TOKEN.COOKIE_MAX_AGE,
      });
      res.cookie(AUTH_DEVICE_COOKIE_NAME, sessionContext.deviceId, {
        ...getCookieOptions(req),
        httpOnly: false,
        maxAge: AUTH_CONFIG.TOKEN.COOKIE_MAX_AGE,
      });

      res.json({
        success: true,
        user: result.user,
        token: result.token,
      });
    } catch (error) {
      console.error('QR login error:', error);
      sendCoreHttpErrorResponse(res, error);
    }
  });

  app.get('/qr-login', (_req: Request, res: Response) => {
    res.send(QR_LOGIN_PAGE_HTML);
  });
}

export default registerAuthRoutes;
