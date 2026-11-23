import { z } from 'zod';

/**
 * Trạng thái vận hành công khai của API.
 *
 * `database=down` vẫn trả HTTP 200 với `status=degraded` để health checker đọc
 * được nội dung; đây không phải chỉ số sức khỏe người dùng và không lộ cấu hình.
 */
export const healthStatusSchema = z
  .object({
    status: z.enum(['ok', 'degraded']),
    database: z.enum(['up', 'down']),
    ai: z.enum(['provider_configured', 'template_fallback']),
    version: z.string().min(1).max(40),
  })
  .strict();
export type HealthStatus = z.infer<typeof healthStatusSchema>;
