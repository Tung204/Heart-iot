import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { MeasurementsModule } from '../measurements/measurements.module';
import { PolicyModule } from '../policy/policy.module';
import { RemindersModule } from '../reminders/reminders.module';
import { CareRulesController } from './care-rules.controller';
import { CareRulesService } from './care-rules.service';
import { CareSchedulerService } from './care-scheduler.service';

@Module({
  imports: [AuthModule, PolicyModule, MeasurementsModule, RemindersModule],
  controllers: [CareRulesController],
  providers: [CareRulesService, CareSchedulerService],
  exports: [CareRulesService, CareSchedulerService],
})
export class CareRulesModule {}
