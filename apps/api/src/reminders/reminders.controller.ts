import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { idSchema, type UserSummary } from '@heart-iot/contracts';
import {
  createReminderSchema,
  reminderCompletionQuerySchema,
  reminderCompletionWriteSchema,
  reminderTodayQuerySchema,
  updateReminderSchema,
  type CreateReminderInput,
  type ReminderCompletionQuery,
  type ReminderCompletionResult,
  type ReminderCompletionWrite,
  type ReminderDay,
  type ReminderList,
  type ReminderSummary,
  type ReminderTodayQuery,
  type UpdateReminderInput,
} from '@heart-iot/contracts/reminders';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { CurrentUser } from '../auth/auth.decorators';
import { SessionGuard } from '../auth/session.guard';
import { RemindersService } from './reminders.service';

const idPipe = new ZodValidationPipe(idSchema);

/**
 * Lịch nhắc chăm sóc — `/subjects/:id/reminders`.
 *
 * - Xem danh sách + occurrence hôm nay: chủ hồ sơ hoặc người thân có
 *   `canViewMeasurements` (thiếu quyền → 403, admin/người ngoài → 404).
 * - Tạo/sửa/xoá: chỉ chủ hồ sơ (204 cho DELETE).
 * - Đánh dấu đã thực hiện/bỏ qua + hoàn tác: như quyền xem, idempotent theo
 *   khoá `(reminderId, date, time)`.
 */
@Controller()
@UseGuards(SessionGuard)
export class RemindersController {
  constructor(private readonly reminders: RemindersService) {}

  @Get('subjects/:id/reminders')
  list(
    @CurrentUser() user: UserSummary,
    @Param('id', idPipe) subjectId: string,
  ): Promise<ReminderList> {
    return this.reminders.list(user, subjectId);
  }

  @Get('subjects/:id/reminders/today')
  day(
    @CurrentUser() user: UserSummary,
    @Param('id', idPipe) subjectId: string,
    @Query(new ZodValidationPipe(reminderTodayQuerySchema)) query: ReminderTodayQuery,
  ): Promise<ReminderDay> {
    return this.reminders.day(user, subjectId, query.date);
  }

  @Post('subjects/:id/reminders')
  create(
    @CurrentUser() user: UserSummary,
    @Param('id', idPipe) subjectId: string,
    @Body(new ZodValidationPipe(createReminderSchema)) body: CreateReminderInput,
  ): Promise<ReminderSummary> {
    return this.reminders.create(user, subjectId, body);
  }

  @Patch('subjects/:id/reminders/:reminderId')
  update(
    @CurrentUser() user: UserSummary,
    @Param('id', idPipe) subjectId: string,
    @Param('reminderId', idPipe) reminderId: string,
    @Body(new ZodValidationPipe(updateReminderSchema)) body: UpdateReminderInput,
  ): Promise<ReminderSummary> {
    return this.reminders.update(user, subjectId, reminderId, body);
  }

  @Delete('subjects/:id/reminders/:reminderId')
  @HttpCode(204)
  async remove(
    @CurrentUser() user: UserSummary,
    @Param('id', idPipe) subjectId: string,
    @Param('reminderId', idPipe) reminderId: string,
  ): Promise<void> {
    await this.reminders.remove(user, subjectId, reminderId);
  }

  @Post('subjects/:id/reminders/:reminderId/completions')
  @HttpCode(200)
  complete(
    @CurrentUser() user: UserSummary,
    @Param('id', idPipe) subjectId: string,
    @Param('reminderId', idPipe) reminderId: string,
    @Body(new ZodValidationPipe(reminderCompletionWriteSchema)) body: ReminderCompletionWrite,
  ): Promise<ReminderCompletionResult> {
    return this.reminders.complete(user, subjectId, reminderId, body);
  }

  @Delete('subjects/:id/reminders/:reminderId/completions')
  @HttpCode(204)
  async uncomplete(
    @CurrentUser() user: UserSummary,
    @Param('id', idPipe) subjectId: string,
    @Param('reminderId', idPipe) reminderId: string,
    @Query(new ZodValidationPipe(reminderCompletionQuerySchema)) query: ReminderCompletionQuery,
  ): Promise<void> {
    await this.reminders.uncomplete(user, subjectId, reminderId, query.date, query.time);
  }
}
