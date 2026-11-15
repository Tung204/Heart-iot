import { Controller, Get, Param, Query, Res, UseGuards } from '@nestjs/common';
import { idSchema, zodDetails, type UserSummary } from '@annhien/contracts';
import {
  dailySummaryQuerySchema,
  exportQuerySchema,
  measurementsQuerySchema,
  measurementsResponseSchema,
  dailySummarySchema,
  type DailySummaryQuery,
  type ExportQuery,
  type MeasurementsQuery,
} from '@annhien/contracts/measurements';
import { insightsQuerySchema, insightsResponseSchema } from '@annhien/contracts/insights';
import type { Response } from 'express';
import { AppError } from '../common/app-error';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { SessionGuard } from '../auth/session.guard';
import { CurrentUser } from '../auth/auth.decorators';
import { MeasurementsService } from './measurements.service';

const idPipe = new ZodValidationPipe(idSchema);

@Controller()
@UseGuards(SessionGuard)
export class MeasurementsController {
  constructor(private readonly measurements: MeasurementsService) {}

  @Get('subjects/:id/measurements')
  async list(
    @CurrentUser() user: UserSummary,
    @Param('id', idPipe) subjectId: string,
    @Query(new ZodValidationPipe(measurementsQuerySchema)) query: MeasurementsQuery,
  ) {
    const result = await this.measurements.list(user.id, subjectId, query);
    return measurementsResponseSchema.parse(result);
  }

  @Get('subjects/:id/daily-summary')
  async dailySummary(
    @CurrentUser() user: UserSummary,
    @Param('id', idPipe) subjectId: string,
    @Query(new ZodValidationPipe(dailySummaryQuerySchema)) query: DailySummaryQuery,
  ) {
    const result = await this.measurements.dailySummary(user.id, subjectId, query.date);
    return dailySummarySchema.parse(result);
  }

  @Get('subjects/:id/insights')
  async insights(
    @CurrentUser() user: UserSummary,
    @Param('id', idPipe) subjectId: string,
    @Query() rawQuery: Record<string, unknown>,
  ) {
    // `insightsQuerySchema` là nguồn luật duy nhất cho `days` (mặc định 7, 7..30).
    // Spec v2 yêu cầu 400 khi tham số ngoài khoảng; toàn bộ lỗi query ở endpoint
    // này trả 400 để phân biệt với lỗi dữ liệu nghiệp vụ (422) — xem handoff.
    const parsed = insightsQuerySchema.safeParse({ ...rawQuery });
    if (!parsed.success) {
      throw new AppError(
        'VALIDATION_FAILED',
        'Tham số truy vấn không hợp lệ.',
        400,
        zodDetails(parsed.error),
      );
    }
    const result = await this.measurements.insights(user.id, subjectId, parsed.data);
    return insightsResponseSchema.parse(result);
  }

  @Get('subjects/:id/export.csv')
  async exportCsv(
    @CurrentUser() user: UserSummary,
    @Param('id', idPipe) subjectId: string,
    @Query(new ZodValidationPipe(exportQuerySchema)) query: ExportQuery,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.measurements.exportCsv(user.id, subjectId, query);
    res.set('Content-Type', 'text/csv; charset=utf-8');
    res.set('Content-Disposition', `attachment; filename="${result.filename}"`);
    return '\uFEFF' + result.csv;
  }
}
