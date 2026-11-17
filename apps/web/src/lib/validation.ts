import type { ZodError, ZodIssue } from 'zod';
import { isApiError } from './api';

export interface FieldErrorMap {
  /** Lỗi gắn theo trường: { email, password, displayName, ... } */
  fields: Record<string, string>;
  /** Lỗi chung không gắn được vào trường cụ thể */
  general: string[];
}

const FIELD_PATHS = ['email', 'password', 'displayName', 'confirmPassword'] as const;

function isEmptyValue(value: unknown): boolean {
  return String(value ?? '').trim() === '';
}

/**
 * Chuyển lỗi zod sang thông điệp tiếng Việt gắn theo trường.
 * Giới hạn (min/max) đọc trực tiếp từ issue để không hard-code luật
 * đã khai báo trong packages/contracts.
 */
function messageFor(path: string, issue: ZodIssue, value: unknown): string {
  switch (path) {
    case 'email':
      if (isEmptyValue(value)) return 'Vui lòng nhập email.';
      if (issue.code === 'too_big') return `Email quá dài (tối đa ${issue.maximum} ký tự).`;
      return 'Email chưa hợp lệ.';
    case 'password':
      if (isEmptyValue(value)) return 'Vui lòng nhập mật khẩu.';
      if (issue.code === 'too_small') return `Mật khẩu cần ít nhất ${issue.minimum} ký tự.`;
      if (issue.code === 'too_big') return `Mật khẩu quá dài (tối đa ${issue.maximum} ký tự).`;
      return 'Mật khẩu chưa hợp lệ.';
    case 'displayName':
      if (isEmptyValue(value)) return 'Vui lòng nhập tên hiển thị.';
      if (issue.code === 'too_big') return `Tên hiển thị quá dài (tối đa ${issue.maximum} ký tự).`;
      return 'Tên hiển thị chưa hợp lệ.';
    case 'confirmPassword':
      return 'Mật khẩu nhập lại không khớp.';
    default:
      return issue.message;
  }
}

export function fieldErrorMap(error: ZodError, values: Record<string, unknown>): FieldErrorMap {
  const fields: Record<string, string> = {};
  const general: string[] = [];
  for (const issue of error.issues) {
    const path = issue.path.join('.');
    const message = messageFor(path, issue, values[path]);
    if (FIELD_PATHS.includes(path as (typeof FIELD_PATHS)[number])) {
      fields[path] ??= message;
    } else {
      general.push(message);
    }
  }
  return { fields, general };
}

/**
 * Chuyển lỗi zod của schema nghiệp vụ bất kỳ sang FieldErrorMap.
 * `overrides` cho phép màn hình đặt thông điệp tiếng Việt theo trường
 * (dùng issue để đọc giới hạn min/max từ hợp đồng, không hard-code).
 */
export function zodFieldErrorMap(
  error: ZodError,
  values: Record<string, unknown>,
  overrides?: Record<string, (issue: ZodIssue, value: unknown) => string>,
): FieldErrorMap {
  const fields: Record<string, string> = {};
  const general: string[] = [];
  for (const issue of error.issues) {
    const path = issue.path.map(String).join('.');
    const value = values[path];
    const message = (overrides?.[path] ?? (() => issue.message))(issue, value);
    if (path) {
      fields[path] ??= message;
    } else {
      general.push(message);
    }
  }
  return { fields, general };
}

/**
 * Lỗi VALIDATION_FAILED từ API có `details: [{ path, message }]`
 * (xem zodDetails trong packages/contracts). Gắn vào đúng trường khi khớp.
 */
export function apiValidationFieldErrors(error: unknown): FieldErrorMap | null {
  if (!isApiError(error) || error.code !== 'VALIDATION_FAILED' || !Array.isArray(error.details)) {
    return null;
  }
  const fields: Record<string, string> = {};
  const general: string[] = [];
  for (const raw of error.details) {
    const item = raw as { path?: unknown; message?: unknown };
    const path = typeof item.path === 'string' ? item.path : undefined;
    const message = typeof item.message === 'string' ? item.message : 'Giá trị chưa hợp lệ.';
    if (path && FIELD_PATHS.includes(path as (typeof FIELD_PATHS)[number])) {
      fields[path] ??= message;
    } else {
      general.push(message);
    }
  }
  return { fields, general };
}
