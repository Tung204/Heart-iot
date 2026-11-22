import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RetentionModule } from '../retention/retention.module';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

/**
 * AdminModule — tài khoản, audit, policy động, tổng quan (wave 3 be-admin).
 * AuthModule chỉ để resolve SessionGuard dùng trên controller; DB/Access/Audit/
 * Policy là module global. PolicyModule cần được import khi chạy test rời
 * (createModuleTestApp); RetentionModule cung cấp preview retention chỉ đọc.
 */
@Module({
  imports: [AuthModule, RetentionModule],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
