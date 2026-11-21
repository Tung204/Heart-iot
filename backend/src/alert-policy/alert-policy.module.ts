import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AlertPolicyController } from './alert-policy.controller';
import { AlertPolicyService } from './alert-policy.service';
import { AlertEscalationScheduler } from './alert-escalation.scheduler';

@Module({
  imports: [AuthModule],
  controllers: [AlertPolicyController],
  providers: [AlertPolicyService, AlertEscalationScheduler],
  exports: [AlertPolicyService, AlertEscalationScheduler],
})
export class AlertPolicyModule {}
