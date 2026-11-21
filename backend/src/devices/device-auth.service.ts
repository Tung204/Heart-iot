import { Inject, Injectable } from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import type { DeviceRow } from '../database/schema';
import { DB, type AppDb } from '../database/database';
import { devices } from '../database/schema';
import { sha256 } from '../auth/password';
import { AppError } from '../common/app-error';

export const DEVICE_AUTH_FAILED_MESSAGE = 'Thiết bị không được xác thực.';

@Injectable()
export class DeviceAuthService {
  constructor(@Inject(DB) private readonly db: AppDb) {}

  /** Xác thực thiết bị bằng cặp id + khóa thô; DB chỉ lưu hash. */
  async authenticate(deviceId: string, rawKey: string): Promise<DeviceRow> {
    const rows = await this.db
      .select()
      .from(devices)
      .where(and(eq(devices.id, deviceId), eq(devices.status, 'active')))
      .limit(1);
    const device = rows[0];
    if (!device) throw new AppError('DEVICE_AUTH_FAILED', DEVICE_AUTH_FAILED_MESSAGE, 401);
    const expected = Buffer.from(device.credentialHash, 'hex');
    const actual = Buffer.from(sha256(rawKey), 'hex');
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
      throw new AppError('DEVICE_AUTH_FAILED', DEVICE_AUTH_FAILED_MESSAGE, 401);
    }
    return device;
  }
}
