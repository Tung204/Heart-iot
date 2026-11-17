import type { ErrorCode } from '@heart-iot/contracts';

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details?: unknown;

  constructor(code: ErrorCode, message: string, status: number, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.status = status;
    this.details = details;
  }

  static unauthenticated(message = 'Bạn cần đăng nhập để tiếp tục.'): AppError {
    return new AppError('UNAUTHENTICATED', message, 401);
  }

  static forbidden(message = 'Bạn không có quyền thực hiện thao tác này.', details?: unknown): AppError {
    return new AppError('FORBIDDEN', message, 403, details);
  }

  /** Dùng cho tài nguyên riêng tư: không tiết lộ tài nguyên có tồn tại hay không. */
  static notFound(message = 'Không tìm thấy dữ liệu.', details?: unknown): AppError {
    return new AppError('NOT_FOUND', message, 404, details);
  }

  static conflict(message: string, details?: unknown): AppError {
    return new AppError('CONFLICT', message, 409, details);
  }

  static validation(message: string, details?: unknown): AppError {
    return new AppError('VALIDATION_FAILED', message, 422, details);
  }

  static rateLimited(message = 'Bạn thao tác quá nhanh, vui lòng thử lại sau.'): AppError {
    return new AppError('RATE_LIMITED', message, 429);
  }
}
