import { AppError } from './app-error';

export type CursorValue = Record<string, string | number>;

export function encodeCursor(value: CursorValue): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

export function decodeCursor(cursor: string): CursorValue {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('cursor không phải object');
    }
    const result: CursorValue = {};
    for (const [key, item] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof item === 'string' || typeof item === 'number') result[key] = item;
    }
    return result;
  } catch {
    throw AppError.validation('Cursor phân trang không hợp lệ.');
  }
}
