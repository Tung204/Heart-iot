import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AdminDevicesController, SubjectDevicesController } from './devices.controller';
import { DevicesService } from './devices.service';

@Module({
  imports: [AuthModule],
  controllers: [AdminDevicesController, SubjectDevicesController],
  providers: [DevicesService],
  exports: [DevicesService],
})
export class DevicesModule {}
