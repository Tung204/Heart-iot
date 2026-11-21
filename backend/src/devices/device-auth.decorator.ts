import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { DeviceRow } from '../database/schema';

export const CurrentDevice = createParamDecorator((_data: unknown, ctx: ExecutionContext): DeviceRow => {
  const request = ctx.switchToHttp().getRequest<{ device?: DeviceRow }>();
  if (!request.device) throw new Error('CurrentDevice chỉ dùng sau DeviceAuthGuard');
  return request.device;
});
