import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DeviceAuthModule } from '../devices/device-auth.module';
import { IncidentsController } from './incidents.controller';
import { IncidentsService } from './incidents.service';

/**
 * Cảnh báo: state machine ingest + xem/xác nhận/đóng + realtime + outbox.
 *
 * Không đăng ký APP_GUARD/APP_FILTER ở đây: AppModule đã có global
 * SessionGuard + ApiExceptionFilter. Test dùng createModuleTestApp tự thêm
 * filter/guard nếu cần.
 */
@Module({
  imports: [DeviceAuthModule, AuthModule],
  controllers: [IncidentsController],
  providers: [
    IncidentsService,
  ],
  exports: [IncidentsService],
})
export class IncidentsModule {}
