import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { AppEnv } from '../config/env';
import { AppError } from './app-error';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Cookie phiên dùng SameSite=Lax. Với phương thức ghi, nếu trình duyệt gửi Origin
 * khác origin của web thì từ chối. Request không có Origin (curl, test, thiết bị)
 * được xử lý bởi cơ chế xác thực riêng, không dựa vào cookie.
 */
export function createOriginCheckMiddleware(env: AppEnv): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (SAFE_METHODS.has(req.method)) {
      next();
      return;
    }
    const origin = req.header('origin');
    if (origin && origin !== env.WEB_ORIGIN) {
      next(AppError.forbidden('Origin không được phép cho thao tác ghi.'));
      return;
    }
    next();
  };
}
