import { Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { idSchema, type UserSummary } from '@heart-iot/contracts';
import { CurrentUser } from '../auth/auth.decorators';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { NotificationService } from './notifications.service';

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationService) {}

  @Get()
  list(@CurrentUser() user: UserSummary) {
    return this.notifications.listNotifications(user.id);
  }

  @Post(':id/read')
  @HttpCode(204)
  async read(
    @CurrentUser() user: UserSummary,
    @Param('id', new ZodValidationPipe(idSchema)) notificationId: string,
  ): Promise<void> {
    await this.notifications.markRead(user.id, notificationId);
  }
}
