import { Body, Controller, Get, HttpCode, Param, Post, Query, UseGuards } from '@nestjs/common';
import { idSchema, type UserSummary } from '@heart-iot/contracts';
import {
  assistantAnswerSchema,
  assistantAskSchema,
  assistantSummaryQuerySchema,
  assistantSummarySchema,
  type AssistantAsk,
  type AssistantSummaryQuery,
} from '@heart-iot/contracts/assistant';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { SessionGuard } from '../auth/session.guard';
import { CurrentUser } from '../auth/auth.decorators';
import { AssistantService } from './assistant.service';

const idPipe = new ZodValidationPipe(idSchema);

@Controller()
@UseGuards(SessionGuard)
export class AssistantController {
  constructor(private readonly assistant: AssistantService) {}

  @Get('subjects/:id/assistant/summary')
  async summary(
    @CurrentUser() user: UserSummary,
    @Param('id', idPipe) subjectId: string,
    @Query(new ZodValidationPipe(assistantSummaryQuerySchema)) query: AssistantSummaryQuery,
  ) {
    const result = await this.assistant.getSummary(user.id, subjectId, query);
    return assistantSummarySchema.parse(result);
  }

  @Post('subjects/:id/assistant/ask')
  @HttpCode(200)
  async ask(
    @CurrentUser() user: UserSummary,
    @Param('id', idPipe) subjectId: string,
    @Body(new ZodValidationPipe(assistantAskSchema)) input: AssistantAsk,
  ) {
    const result = await this.assistant.ask(user.id, subjectId, input);
    return assistantAnswerSchema.parse(result);
  }
}
