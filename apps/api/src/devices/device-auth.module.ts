import { Module } from '@nestjs/common';
import { DeviceAuthGuard } from './device-auth.guard';
import { DeviceAuthService } from './device-auth.service';

/** Phần xác thực thiết bị dùng chung cho ingest telemetry và ingest sự kiện. */
@Module({
  providers: [DeviceAuthService, DeviceAuthGuard],
  exports: [DeviceAuthService, DeviceAuthGuard],
})
export class DeviceAuthModule {}
