import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { telemetryEnvelopeSchema, ingestAckSchema, type TelemetryEnvelope } from '@annhien/contracts/telemetry';
import type { DeviceRow } from '../database/schema';
import { DeviceAuthGuard } from '../devices/device-auth.guard';
import { CurrentDevice } from '../devices/device-auth.decorator';
import { Public } from '../auth/auth.decorators';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { TelemetryIngestService } from './telemetry-ingest.service';

@Public()
@Controller()
export class IngestController {
  constructor(private readonly ingest: TelemetryIngestService) {}

  /**
   * POST /ingest/telemetry — xác thực thiết bị bằng x-device-id + x-device-key.
   * 202 kèm ack accepted/duplicate/rejected; mẫu cách ly trả accepted +
   * `code=QUARANTINED` (không được dùng cho thống kê). 409 khi xung đột
   * idempotency; 429 khi vượt rate.
   */
  @Post('ingest/telemetry')
  @HttpCode(202)
  @UseGuards(DeviceAuthGuard)
  async telemetry(
    @CurrentDevice() device: DeviceRow,
    @Body(new ZodValidationPipe(telemetryEnvelopeSchema)) envelope: TelemetryEnvelope,
  ) {
    const outcome = await this.ingest.ingest(device, envelope, 'http');
    const receivedAt = outcome.receivedAt.toISOString();
    if (outcome.kind === 'accepted') {
      const quarantined = outcome.quarantineReason !== undefined;
      return ingestAckSchema.parse({
        status: 'accepted',
        sourceMessageId: envelope.message_id,
        receivedAt,
        incidentId: null,
        acceptedRevision: null,
        code: quarantined ? 'QUARANTINED' : null,
        message: quarantined
          ? 'Bản tin đã được lưu tạm để kiểm tra thời gian đo; chưa dùng cho thống kê.'
          : null,
      });
    }
    if (outcome.kind === 'duplicate') {
      return ingestAckSchema.parse({
        status: 'duplicate',
        sourceMessageId: envelope.message_id,
        receivedAt,
        incidentId: null,
        acceptedRevision: null,
        code: 'DUPLICATE',
        message: 'Bản tin này đã được ghi trước đó.',
      });
    }
    return ingestAckSchema.parse({
      status: 'rejected',
      sourceMessageId: envelope.message_id,
      receivedAt,
      incidentId: null,
      acceptedRevision: null,
      code: outcome.code,
      message: outcome.message,
    });
  }
}
