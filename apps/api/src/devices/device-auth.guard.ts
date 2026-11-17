import {
  Inject,
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import type { DeviceRow } from '../database/schema';
import type { Request } from 'express';
import { AppError } from '../common/app-error';
import { DeviceAuthService } from './device-auth.service';

export type AuthenticatedDeviceRequest = Request & { device?: DeviceRow };

@Injectable()
export class DeviceAuthGuard implements CanActivate {
  constructor(@Inject(DeviceAuthService) private readonly auth: DeviceAuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedDeviceRequest>();
    const deviceId = request.header('x-device-id');
    const deviceKey = request.header('x-device-key');
    if (!deviceId || !deviceKey) {
      throw new AppError('DEVICE_AUTH_FAILED', 'Thiếu x-device-id hoặc x-device-key.', 401);
    }
    const device = await this.auth.authenticate(deviceId, deviceKey);
    const body = request.body as { device_id?: unknown } | undefined;
    if (body && typeof body.device_id === 'string' && body.device_id !== device.id) {
      throw AppError.forbidden('device_id trong payload không khớp thiết bị đã xác thực.');
    }
    request.device = device;
    return true;
  }
}
