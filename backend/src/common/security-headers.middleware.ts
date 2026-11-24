import type { NextFunction, Request, Response } from 'express';

/**
 * Header bảo vệ mặc định cho API JSON/SSE.
 *
 * API không trả HTML, nên CSP chặt `default-src 'none'` không ảnh hưởng web;
 * `frame-ancestors 'none'` và `X-Frame-Options: DENY` chặn nhúng response.
 * Không đặt HSTS vì repo chưa cấu hình TLS; không đặt CORP để tránh chặn
 * frontend khác origin hợp lệ đã được CORS cho phép. `Cache-Control: no-store`
 * ngăn cache trung gian/browser lưu response sức khỏe.
 */
export function securityHeadersMiddleware(
  _req: Request,
  res: Response,
  next: NextFunction,
): void {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
  );
  next();
}
