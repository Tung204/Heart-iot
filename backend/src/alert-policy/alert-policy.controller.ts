import { Body, Controller, Get, HttpCode, Param, Post, Put, UseGuards } from '@nestjs/common';
import { idSchema, type UserSummary } from '@heart-iot/contracts';
import type { AlertPolicyPreview, AlertPolicyView } from '@heart-iot/contracts/alert-policy';
import { CurrentUser } from '../auth/auth.decorators';
import { SessionGuard } from '../auth/session.guard';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { AlertPolicyService } from './alert-policy.service';

const uuidPipe = new ZodValidationPipe(idSchema);

/**
 * Chính sách leo thang cảnh báo (V10) — chỉ chủ hồ sơ.
 * Preview chỉ trả các mốc trong ứng dụng, không ghi dữ liệu hay gửi thông báo.
 */
@Controller()
@UseGuards(SessionGuard)
export class AlertPolicyController {
  constructor(private readonly policy: AlertPolicyService) {}

  @Get('subjects/:id/alert-policy')
  get(
    @CurrentUser() user: UserSummary,
    @Param('id', uuidPipe) subjectId: string,
  ): Promise<AlertPolicyView> {
    return this.policy.get(user, subjectId);
  }

  @Put('subjects/:id/alert-policy')
  put(
    @CurrentUser() user: UserSummary,
    @Param('id', uuidPipe) subjectId: string,
    @Body() body: unknown,
  ): Promise<AlertPolicyView> {
    return this.policy.update(user, subjectId, body);
  }

  @Post('subjects/:id/alert-policy/previews')
  @HttpCode(200)
  preview(
    @CurrentUser() user: UserSummary,
    @Param('id', uuidPipe) subjectId: string,
  ): Promise<AlertPolicyPreview> {
    return this.policy.preview(user, subjectId);
  }
}
