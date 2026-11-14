import { Controller, Get, Param, Query, Res, UseGuards } from '@nestjs/common';
import { idSchema, type UserSummary } from '@annhien/contracts';
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
import type { Response } from 'express';
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
