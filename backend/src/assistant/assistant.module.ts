import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { MaintenanceModule } from '../maintenance/maintenance.module';
import { PolicyModule } from '../policy/policy.module';
import { RemindersModule } from '../reminders/reminders.module';
import { OpenAiCompatibleAdapter, ASSISTANT_AI_ADAPTER } from './assistant-adapter';
import { AssistantController } from './assistant.controller';
import { AssistantService } from './assistant.service';
import { AssistantActionsService } from './assistant-actions.service';

/**
 * Module trợ lý AI: tóm tắt khoảng dữ liệu + hỏi đáp trên số liệu tổng hợp.
 * AuthModule cho guard phiên trên controller; PolicyModule để coverage dùng cùng
 * nhịp tim kỳ vọng với measurements; MaintenanceModule cho nháp việc bảo trì;
 * adapter qua token để test override bằng fake (không gọi mạng thật).
 */
@Module({
  imports: [AuthModule, PolicyModule, RemindersModule, MaintenanceModule],
  controllers: [AssistantController],
  providers: [
    AssistantService,
    AssistantActionsService,
    { provide: ASSISTANT_AI_ADAPTER, useClass: OpenAiCompatibleAdapter },
  ],
  exports: [AssistantService, AssistantActionsService],
})
export class AssistantModule {}
