import { Body, Controller, Get, HttpCode, Param, Post, Query, UseGuards } from '@nestjs/common';
import { idSchema, type UserSummary } from '@heart-iot/contracts';
import {
  assistantAnswerSchema,
  assistantAskSchema,
  assistantDraftFromTextSchema,
  assistantDraftSchema,
  assistantCapabilitiesSchema,
  createAssistantDraftSchema,
  assistantSummaryQuerySchema,
  assistantSummarySchema,
  type AssistantAsk,
  type AssistantDraftFromTextInput,
  type AssistantSummaryQuery,
  type CreateAssistantDraftInput,
} from '@heart-iot/contracts/assistant';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { SessionGuard } from '../auth/session.guard';
import { CurrentUser } from '../auth/auth.decorators';
import { AssistantService } from './assistant.service';
import { AssistantActionsService } from './assistant-actions.service';

const idPipe = new ZodValidationPipe(idSchema);

@Controller()
@UseGuards(SessionGuard)
export class AssistantController {
  constructor(
    private readonly assistant: AssistantService,
    private readonly actions: AssistantActionsService,
  ) {}

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

  /** Việc trợ lý được/không được làm — chỉ trả sau khi kiểm quyền hồ sơ. */
  @Get('subjects/:id/assistant/capabilities')
  async capabilities(
    @CurrentUser() user: UserSummary,
    @Param('id', idPipe) subjectId: string,
  ) {
    const result = await this.actions.capabilities(user, subjectId);
    return assistantCapabilitiesSchema.parse(result);
  }

  /** Tạo nháp lịch nhắc — KHÔNG ghi care_reminders. */
  @Post('subjects/:id/assistant/drafts')
  @HttpCode(201)
  async createDraft(
    @CurrentUser() user: UserSummary,
    @Param('id', idPipe) subjectId: string,
    @Body(new ZodValidationPipe(createAssistantDraftSchema)) input: CreateAssistantDraftInput,
  ) {
    const result = await this.actions.createDraft(user, subjectId, input);
    return assistantDraftSchema.parse(result);
  }

  /** Nháp từ câu lệnh đơn giản — parser rule-based, vẫn phải confirm mới ghi. */
  @Post('subjects/:id/assistant/drafts/from-text')
  @HttpCode(201)
  async createDraftFromText(
    @CurrentUser() user: UserSummary,
    @Param('id', idPipe) subjectId: string,
    @Body(new ZodValidationPipe(assistantDraftFromTextSchema)) input: AssistantDraftFromTextInput,
  ) {
    const result = await this.actions.createDraftFromText(user, subjectId, input);
    return assistantDraftSchema.parse(result);
  }

  @Get('assistant/drafts/:id')
  async getDraft(@CurrentUser() user: UserSummary, @Param('id', idPipe) draftId: string) {
    const result = await this.actions.getDraft(user, draftId);
    return assistantDraftSchema.parse(result);
  }

  /** Xác nhận nháp = lưu lịch nhắc; lặp lại không tạo bản ghi trùng. */
  @Post('assistant/drafts/:id/confirm')
  @HttpCode(200)
  async confirmDraft(@CurrentUser() user: UserSummary, @Param('id', idPipe) draftId: string) {
    const result = await this.actions.confirm(user, draftId);
    return assistantDraftSchema.parse(result);
  }

  /** Hủy nháp — không tác động dữ liệu nghiệp vụ. */
  @Post('assistant/drafts/:id/cancel')
  @HttpCode(200)
  async cancelDraft(@CurrentUser() user: UserSummary, @Param('id', idPipe) draftId: string) {
    const result = await this.actions.cancel(user, draftId);
    return assistantDraftSchema.parse(result);
  }
}
