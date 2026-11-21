import { Body, Controller, Get, HttpCode, Param, Post, Put, UseGuards } from '@nestjs/common';
import { idSchema, type UserSummary } from '@heart-iot/contracts';
import {
  careRuleKindSchema,
  type CareRuleKind,
  type CareRulePreview,
  type CareRuleView,
} from '@heart-iot/contracts/care-rules';
import { CurrentUser } from '../auth/auth.decorators';
import { SessionGuard } from '../auth/session.guard';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { CareRulesService } from './care-rules.service';

const uuidPipe = new ZodValidationPipe(idSchema);
const kindPipe = new ZodValidationPipe(careRuleKindSchema);

/**
 * Quy tắc chăm sóc chủ động (V9.2) — chỉ chủ hồ sơ.
 * `POST .../previews` chỉ trả lịch kiểm tra 7 ngày tới, không ghi dữ liệu.
 */
@Controller()
@UseGuards(SessionGuard)
export class CareRulesController {
  constructor(private readonly rules: CareRulesService) {}

  @Get('subjects/:id/care-rules/:kind')
  get(
    @CurrentUser() user: UserSummary,
    @Param('id', uuidPipe) subjectId: string,
    @Param('kind', kindPipe) kind: CareRuleKind,
  ): Promise<CareRuleView> {
    return this.rules.get(user, subjectId, kind);
  }

  @Put('subjects/:id/care-rules/:kind')
  put(
    @CurrentUser() user: UserSummary,
    @Param('id', uuidPipe) subjectId: string,
    @Param('kind', kindPipe) kind: CareRuleKind,
    @Body() body: unknown,
  ): Promise<CareRuleView> {
    return this.rules.update(user, subjectId, kind, body);
  }

  @Post('subjects/:id/care-rules/:kind/previews')
  @HttpCode(200)
  preview(
    @CurrentUser() user: UserSummary,
    @Param('id', uuidPipe) subjectId: string,
    @Param('kind', kindPipe) kind: CareRuleKind,
  ): Promise<CareRulePreview> {
    return this.rules.preview(user, subjectId, kind);
  }
}
