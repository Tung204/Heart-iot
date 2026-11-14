import { randomInt } from 'node:crypto';

/**
 * Sinh mã/token thiết bị.
 * - deviceKey: 32 byte ngẫu nhiên base64url, trả một lần duy nhất.
 * - claimCode: 9 ký tự, bảng con của A-Z2-9 (bỏ 0, 1 và I, O để dễ đọc).
 */

export const CLAIM_CODE_LENGTH = 9;
export const CLAIM_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const CLAIM_CODE_TTL_MS = 15 * 60 * 1000;

export function generateClaimCode(length: number = CLAIM_CODE_LENGTH): string {
  let code = '';
  for (let i = 0; i < length; i += 1) {
    code += CLAIM_CODE_ALPHABET[randomInt(0, CLAIM_CODE_ALPHABET.length)];
  }
  return code;
}
