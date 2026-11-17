import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PolicyModule } from '../policy/policy.module';
import { StudioController } from './studio.controller';
import { StudioService } from './studio.service';

/**
 * Studio module: workspace view draft → preview → publish → rollback.
 * AuthModule cho guard phiên trên controller; PolicyModule cung cấp
 * PolicyService cho tính online/freshness của thiết bị.
 */
@Module({
  imports: [AuthModule, PolicyModule],
  controllers: [StudioController],
  providers: [StudioService],
  exports: [StudioService],
})
export class StudioModule {}
