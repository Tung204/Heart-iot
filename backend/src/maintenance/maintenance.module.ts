import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { MaintenanceController } from './maintenance.controller';
import { MaintenanceService } from './maintenance.service';

/**
 * MaintenanceModule — công việc bảo trì (wave 3 be-admin).
 * AuthModule chỉ để resolve SessionGuard dùng trên controller (guard dùng
 * AuthService); DB/Access/Audit là module global.
 * Chưa nối vào AppModule (thuộc lead); test dùng createModuleTestApp(MaintenanceModule).
 */
@Module({
  imports: [AuthModule],
  controllers: [MaintenanceController],
  providers: [MaintenanceService],
})
export class MaintenanceModule {}
