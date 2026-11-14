/**
 * Bộ sinh số giả ngẫu nhiên có seed cố định để kịch bản demo lặp lại được.
 * Không dùng cho mục đích bảo mật.
 */

export const DEFAULT_SEED = 20261114;

/** mulberry32 — nhỏ, tất định, đủ dùng cho dữ liệu tổng hợp. */
export function createSeededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Số nguyên ngẫu nhiên trong [min, max] (bao gồm hai đầu). */
export function randomInt(rand: () => number, min: number, max: number): number {
  if (max <= min) {
    return min;
  }
  return min + Math.floor(rand() * (max - min + 1));
}
