import { Module } from '@nestjs/common';
import { NotificationSettingsController } from './notification-settings.controller';
import { NotificationSettingsService } from './notification-settings.service';
import { NotificationsController } from './notifications.controller';
import { NotificationService } from './notifications.service';
import { PUSH_TRANSPORT, WebPushTransport } from './push-transport';

@Module({
  controllers: [NotificationsController, NotificationSettingsController],
  providers: [
    NotificationService,
    NotificationSettingsService,
    { provide: PUSH_TRANSPORT, useClass: WebPushTransport },
  ],
  exports: [NotificationService, NotificationSettingsService],
})
export class NotificationsModule {}
