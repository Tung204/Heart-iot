import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser, Public } from '../auth/auth.decorators';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { incidentEnvelopeSchema, type IncidentEnvelope } from '@heart-iot/contracts/telemetry';
import {
  acknowledgeAlertSchema,
  alertsQuerySchema,
  resolveAlertSchema,
  type AcknowledgeAlert,
  type AlertsQuery,
  type ResolveAlert,
} from '@heart-iot/contracts/incidents';
import { idSchema, type UserSummary } from '@heart-iot/contracts';
import { DeviceAuthGuard, type AuthenticatedDeviceRequest } from '../devices/device-auth.guard';
import { IncidentsService } from './incidents.service';

@Controller()
export class IncidentsController {
  constructor(private readonly incidents: IncidentsService) {}

  /** Ingest sự kiện thiết bị; xác thực bằng header thiết bị, không cần phiên người dùng. */
  @Public()
  @UseGuards(DeviceAuthGuard)
  @Post('ingest/events')
  @HttpCode(202)
  async ingest(
    @Body(new ZodValidationPipe(incidentEnvelopeSchema)) body: IncidentEnvelope,
    @Req() req: AuthenticatedDeviceRequest,
  ) {
    return this.incidents.ingestEvent(req.device!, body);
  }

  @Get('subjects/:id/alerts')
  list(
    @CurrentUser() user: UserSummary,
    @Param('id', new ZodValidationPipe(idSchema)) subjectId: string,
    @Query(new ZodValidationPipe(alertsQuerySchema)) query: AlertsQuery,
  ) {
    return this.incidents.listAlerts(user.id, subjectId, query);
  }

  @Get('alerts/:id')
  get(
    @CurrentUser() user: UserSummary,
    @Param('id', new ZodValidationPipe(idSchema)) alertId: string,
  ) {
    return this.incidents.getAlert(user.id, alertId);
  }

  @Post('alerts/:id/acknowledge')
  @HttpCode(200)
  acknowledge(
    @CurrentUser() user: UserSummary,
    @Param('id', new ZodValidationPipe(idSchema)) alertId: string,
    @Body(new ZodValidationPipe(acknowledgeAlertSchema)) body: AcknowledgeAlert,
  ) {
    return this.incidents.acknowledgeAlert(user.id, alertId, body);
  }

  @Post('alerts/:id/resolve')
  @HttpCode(200)
  resolve(
    @CurrentUser() user: UserSummary,
    @Param('id', new ZodValidationPipe(idSchema)) alertId: string,
    @Body(new ZodValidationPipe(resolveAlertSchema)) body: ResolveAlert,
  ) {
    return this.incidents.resolveAlert(user.id, alertId, body);
  }
}
