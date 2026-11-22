import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { MaintenanceController } from './maintenance.controller';
import { MaintenanceService } from './maintenance.service';

/**
 * MaintenanceModule — công việc bảo trì (wave 3 be-admin).
 * AuthModule chỉ để resolve SessionGuard dùng trên controller (guard dùng
 * AuthService); DB/Access/Audit là module global.
 * Đã nối vào AppModule; AssistantModule dùng lại MaintenanceService cho nháp task.
 */
@Module({
  imports: [AuthModule],
  controllers: [MaintenanceController],
  providers: [MaintenanceService],
  exports: [MaintenanceService],
})
export class MaintenanceModule {}
