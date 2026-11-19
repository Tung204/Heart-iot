import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { idSchema, type UserSummary } from '@heart-iot/contracts';
import {
  visitReportQuerySchema,
  type VisitReport,
  type VisitReportQuery,
} from '@heart-iot/contracts/reports';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { CurrentUser } from '../auth/auth.decorators';
import { SessionGuard } from '../auth/session.guard';
import { VisitReportService } from './visit-report.service';

const idPipe = new ZodValidationPipe(idSchema);

/**
 * Phiếu đi khám — `/subjects/:id/visit-report?from&to` (FR-16, FR-22).
 * Quyền như các API đọc số đo: chủ hồ sơ hoặc người thân có
 * `canViewMeasurements`; thiếu quyền → 403, admin/người ngoài không link → 404.
 */
@Controller()
@UseGuards(SessionGuard)
export class VisitReportController {
  constructor(private readonly reports: VisitReportService) {}

  @Get('subjects/:id/visit-report')
  get(
    @CurrentUser() user: UserSummary,
    @Param('id', idPipe) subjectId: string,
    @Query(new ZodValidationPipe(visitReportQuerySchema)) query: VisitReportQuery,
  ): Promise<VisitReport> {
    return this.reports.build(user, subjectId, query);
  }
}
