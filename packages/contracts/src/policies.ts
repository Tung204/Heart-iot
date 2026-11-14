import { z } from 'zod';

/**
 * Policy cấu hình runtime của thiết bị — wave 1 be-data.
 * Nguồn active lấy từ bảng `policy_configs` (key=device_runtime, scope=global,
 * status=active, version mới nhất); không có bản ghi hợp lệ thì dùng mặc định.
 * Không có endpoint admin cập nhật trong wave này.
 */

export const policyValueSchema = z
  .object({
    heartbeatIntervalSeconds: z.number().int().min(5).max(300),
    offlineAfterSeconds: z.number().int().min(10).max(3600),
    dataFreshAfterSeconds: z.number().int().min(5).max(600),
    lateEventMinutes: z.number().int().min(1).max(1440),
    maxTelemetryPerMinute: z.number().int().min(1).max(6000),
  })
  .strict();
export type PolicyValue = z.infer<typeof policyValueSchema>;

export const DEFAULT_POLICY_VALUE: PolicyValue = {
  heartbeatIntervalSeconds: 15,
  offlineAfterSeconds: 45,
  dataFreshAfterSeconds: 30,
  lateEventMinutes: 5,
  maxTelemetryPerMinute: 240,
};

export const policyKeys = ['device_runtime'] as const;
export type PolicyKey = (typeof policyKeys)[number];
export const POLICY_KEY_DEVICE_RUNTIME: PolicyKey = 'device_runtime';

export const policySchema = z.object({
  key: z.string().min(1),
  version: z.number().int().nonnegative(),
  source: z.enum(['default', 'database']),
  value: policyValueSchema,
  digest: z.string().min(1),
});
export type PolicyView = z.infer<typeof policySchema>;
