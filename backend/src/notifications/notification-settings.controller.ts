import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Param,
  Post,
  Put,
} from '@nestjs/common';
import { idSchema, type UserSummary } from '@heart-iot/contracts';
import {
  notificationPreferencesUpdateSchema,
  pushSubscriptionInputSchema,
  type NotificationPreferencesUpdate,
  type PushSubscriptionInput,
} from '@heart-iot/contracts/notification-preferences';
import { CurrentUser } from '../auth/auth.decorators';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { NotificationSettingsService } from './notification-settings.service';

@Controller('me')
export class NotificationSettingsController {
  constructor(private readonly settings: NotificationSettingsService) {}

  @Get('notification-preferences')
  getPreferences(@CurrentUser() user: UserSummary) {
    return this.settings.getPreferences(user.id);
  }

  @Put('notification-preferences')
  updatePreferences(
    @CurrentUser() user: UserSummary,
    @Body(new ZodValidationPipe(notificationPreferencesUpdateSchema))
    body: NotificationPreferencesUpdate,
  ) {
    return this.settings.updatePreferences(user.id, body);
  }

  @Get('push-subscriptions')
  listSubscriptions(@CurrentUser() user: UserSummary) {
    return this.settings.listSubscriptions(user.id);
  }

  @Post('push-subscriptions')
  addSubscription(
    @CurrentUser() user: UserSummary,
    @Body(new ZodValidationPipe(pushSubscriptionInputSchema)) body: PushSubscriptionInput,
    @Headers('user-agent') userAgent?: string,
  ) {
    return this.settings.addSubscription(user.id, body, userAgent);
  }

  @Delete('push-subscriptions/:id')
  @HttpCode(204)
  async removeSubscription(
    @CurrentUser() user: UserSummary,
    @Param('id', new ZodValidationPipe(idSchema)) subscriptionId: string,
  ): Promise<void> {
    await this.settings.removeSubscription(user.id, subscriptionId);
  }
}
