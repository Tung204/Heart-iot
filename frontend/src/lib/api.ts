import { apiErrorSchema, type ErrorCode } from '@heart-iot/contracts';
import type { ZodType } from 'zod';

/** Mã lỗi ngoài hợp đồng server: lỗi mạng / phản hồi lệch hợp đồng. */
export type ApiErrorCode = ErrorCode | 'NETWORK_ERROR' | 'CONTRACT_MISMATCH';

export class ApiError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode;
  readonly requestId: string | null;
  readonly details: unknown;

  constructor(options: {
    message: string;
    status: number;
    code: ApiErrorCode;
    requestId?: string | null;
    details?: unknown;
    cause?: unknown;
  }) {
    super(options.message, { cause: options.cause });
    this.name = 'ApiError';
    this.status = options.status;
    this.code = options.code;
    this.requestId = options.requestId ?? null;
    this.details = options.details;
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

export function isUnauthorizedError(error: unknown): boolean {
  return isApiError(error) && error.status === 401;
}

export function isNotFoundError(error: unknown): boolean {
  return isApiError(error) && (error.status === 404 || error.code === 'NOT_FOUND');
}

/** Lỗi cạnh tranh phiên bản (409 CONFLICT) — UI cần đề nghị tải lại, không tự ghi đè. */
export function isConflictError(error: unknown): boolean {
  return isApiError(error) && (error.status === 409 || error.code === 'CONFLICT');
}

export function getApiErrorMessage(
  error: unknown,
  fallback = 'Đã có lỗi xảy ra. Vui lòng thử lại.',
): string {
  return isApiError(error) ? error.message : fallback;
}

/**
 * Base URL của API. Mặc định `/api/v1` (qua Vite proxy khi dev).
 * Có thể ghi đè bằng VITE_API_BASE_URL (ví dụ `https://api.example.com/api/v1`).
 */
export const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? '/api/v1').replace(/\/+$/, '');

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  signal?: AbortSignal;
}

/**
 * Gọi API với phiên bằng cookie (`credentials: 'include'`).
 * Lỗi server parse theo envelope `{ code, message, requestId, details? }`
 * (packages/contracts). Lỗi mạng KHÔNG bị nuốt: bọc thành ApiError
 * code NETWORK_ERROR và giữ `cause` gốc để chẩn đoán.
 */
export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, signal } = options;
  const headers: Record<string, string> = {};
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method,
      credentials: 'include',
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
  } catch (cause) {
    throw new ApiError({
      message: 'Không kết nối được máy chủ. Kiểm tra kết nối mạng và thử lại.',
      status: 0,
      code: 'NETWORK_ERROR',
      cause,
    });
  }

  if (response.status === 204) {
    return undefined as T;
  }

  let data: unknown;
  const text = await response.text();
  if (text) {
    try {
      data = JSON.parse(text) as unknown;
    } catch (cause) {
      throw new ApiError({
        message: `Máy chủ trả về dữ liệu không hợp lệ (HTTP ${response.status}).`,
        status: response.status,
        code: 'CONTRACT_MISMATCH',
        cause,
      });
    }
  }

  if (!response.ok) {
    const parsed = apiErrorSchema.safeParse(data);
    if (parsed.success) {
      const { code, message, requestId, details } = parsed.data;
      throw new ApiError({ message, status: response.status, code, requestId, details });
    }
    throw new ApiError({
      message: `Yêu cầu không thành công (HTTP ${response.status}).`,
      status: response.status,
      code: 'INTERNAL',
      requestId: null,
      details: data,
    });
  }

  return data as T;
}

/**
 * Kiểm phản hồi khớp zod schema dùng chung. Lệch hợp đồng báo lỗi rõ ràng
 * thay vì trả dữ liệu mù cho UI.
 */
export function parseResponse<T>(schema: ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new ApiError({
      message: 'Phản hồi máy chủ không khớp hợp đồng dữ liệu.',
      status: 0,
      code: 'CONTRACT_MISMATCH',
      details: data,
    });
  }
  return result.data;
}
