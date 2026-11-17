import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';
import {
  DEFAULT_POLICY_VALUE,
  policyValueSchema,
  type PolicyKey,
  type PolicyValue,
  type PolicyView,
} from '@heart-iot/contracts/policies';
import { DB, type AppDb } from '../database/database';
import { policyConfigs } from '../database/schema';
import { sha256 } from '../auth/password';

/**
 * PolicyService — nguồn cấu hình runtime dùng chung (thiết bị, ingest, đo lường).
 * Đọc bản ghi active mới nhất key `device_runtime` từ `policy_configs`; bản ghi
 * thiếu hoặc không parse được theo `policyValueSchema` thì fallback về mặc định
 * có nhãn nguồn rõ ràng. Wave 1 chưa có endpoint admin cập nhật policy.
 */

/** Canonical JSON cho digest: thứ tự khóa cố định theo schema, không phụ thuộc thứ tự input. */
export function canonicalPolicyJson(value: PolicyValue): string {
  return JSON.stringify({
    heartbeatIntervalSeconds: value.heartbeatIntervalSeconds,
    offlineAfterSeconds: value.offlineAfterSeconds,
    dataFreshAfterSeconds: value.dataFreshAfterSeconds,
    lateEventMinutes: value.lateEventMinutes,
    maxTelemetryPerMinute: value.maxTelemetryPerMinute,
  });
}

export function computePolicyDigest(value: PolicyValue): string {
  return sha256(canonicalPolicyJson(value));
}

export function defaultPolicyView(key: PolicyKey): PolicyView {
  return {
    key,
    version: 0,
    source: 'default',
    value: DEFAULT_POLICY_VALUE,
    digest: computePolicyDigest(DEFAULT_POLICY_VALUE),
  };
}

@Injectable()
export class PolicyService {
  private readonly logger = new Logger(PolicyService.name);

  constructor(@Inject(DB) private readonly db: AppDb) {}

  async getActive(key: PolicyKey = 'device_runtime'): Promise<PolicyView> {
    const rows = await this.db
      .select()
      .from(policyConfigs)
      .where(
        and(
          eq(policyConfigs.key, key),
          eq(policyConfigs.scope, 'global'),
          eq(policyConfigs.status, 'active'),
        ),
      )
      .orderBy(desc(policyConfigs.version))
      .limit(1);
    const row = rows[0];
    if (!row) return defaultPolicyView(key);

    const parsed = policyValueSchema.safeParse(row.value);
    if (!parsed.success) {
      this.logger.warn(
        `Policy ${key} v${row.version} không hợp lệ theo policyValueSchema, dùng giá trị mặc định.`,
      );
      return defaultPolicyView(key);
    }
    return {
      key,
      version: row.version,
      source: 'database',
      value: parsed.data,
      digest: row.digest,
    };
  }
}
