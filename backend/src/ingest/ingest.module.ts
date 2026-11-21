import { Module } from '@nestjs/common';
import { DeviceAuthModule } from '../devices/device-auth.module';
import { IncidentsModule } from '../incidents/incidents.module';
import { IngestController } from './ingest.controller';
import { MqttIngestService } from './mqtt-ingest.service';
import { TelemetryIngestService } from './telemetry-ingest.service';

@Module({
  imports: [DeviceAuthModule, IncidentsModule],
  controllers: [IngestController],
  providers: [TelemetryIngestService, MqttIngestService],
  exports: [TelemetryIngestService, MqttIngestService],
})
export class IngestModule {}
