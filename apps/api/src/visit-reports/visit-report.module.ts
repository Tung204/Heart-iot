import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { VisitReportController } from './visit-report.controller';
import { VisitReportService } from './visit-report.service';

/**
 * VisitReportModule — phiếu đi khám 1 trang + điểm chú ý (FR-16, FR-22).
 * AuthModule để resolve SessionGuard; DB/Access/Policy là module @Global.
 */
@Module({
  imports: [AuthModule],
  controllers: [VisitReportController],
  providers: [VisitReportService],
})
export class VisitReportModule {}
