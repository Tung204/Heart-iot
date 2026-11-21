import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RemindersController } from './reminders.controller';
import { RemindersService } from './reminders.service';

/**
 * RemindersModule — lịch nhắc chăm sóc (FR-15 phần web).
 * AuthModule chỉ để resolve SessionGuard; DB/Access/Audit là module @Global.
 */
@Module({
  imports: [AuthModule],
  controllers: [RemindersController],
  providers: [RemindersService],
  exports: [RemindersService],
})
export class RemindersModule {}
