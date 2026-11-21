import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PolicyModule } from '../policy/policy.module';
import { OpenAiCompatibleAdapter, ASSISTANT_AI_ADAPTER } from './assistant-adapter';
import { AssistantController } from './assistant.controller';
import { AssistantService } from './assistant.service';

/**
 * Module trợ lý AI: tóm tắt khoảng dữ liệu + hỏi đáp trên số liệu tổng hợp.
 * AuthModule cho guard phiên trên controller; PolicyModule để coverage dùng cùng
 * nhịp tim kỳ vọng với measurements; adapter qua token để test override bằng fake
 * (không gọi mạng thật).
 */
@Module({
  imports: [AuthModule, PolicyModule],
  controllers: [AssistantController],
  providers: [
    AssistantService,
    { provide: ASSISTANT_AI_ADAPTER, useClass: OpenAiCompatibleAdapter },
  ],
  exports: [AssistantService],
})
export class AssistantModule {}
