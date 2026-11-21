import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { AccessModule } from './access/access.module';
import { AlertPolicyModule } from './alert-policy/alert-policy.module';
import { AdminModule } from './admin/admin.module';
import { AuditModule } from './access/audit.module';
import { AssistantModule } from './assistant/assistant.module';
import { AuthModule } from './auth/auth.module';
import { SessionGuard } from './auth/session.guard';
import { CareModule } from './care/care.module';
import { CareRulesModule } from './care-rules/care-rules.module';
import { ApiExceptionFilter } from './common/api-exception.filter';
import { DatabaseModule } from './database/database.module';
import { DevicesModule } from './devices/devices.module';
import { EmergencyContactsModule } from './emergency-contacts/emergency-contacts.module';
import { HealthModule } from './health/health.module';
import { IncidentsModule } from './incidents/incidents.module';
import { IngestModule } from './ingest/ingest.module';
import { MaintenanceModule } from './maintenance/maintenance.module';
import { MeasurementsModule } from './measurements/measurements.module';
import { NotificationsModule } from './notifications/notifications.module';
import { PolicyModule } from './policy/policy.module';
import { RealtimeModule } from './realtime/realtime.module';
import { RemindersModule } from './reminders/reminders.module';
import { StudioModule } from './studio/studio.module';
import { SubjectsModule } from './subjects/subjects.module';
import { VisitReportModule } from './visit-reports/visit-report.module';

@Module({
  imports: [
    DatabaseModule,
    AuditModule,
    AccessModule,
    AuthModule,
    PolicyModule,
    HealthModule,
    SubjectsModule,
    CareModule,
    DevicesModule,
    EmergencyContactsModule,
    IngestModule,
    MeasurementsModule,
    IncidentsModule,
    NotificationsModule,
    RealtimeModule,
    StudioModule,
    AssistantModule,
    MaintenanceModule,
    RemindersModule,
    CareRulesModule,
    AlertPolicyModule,
    VisitReportModule,
    AdminModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: SessionGuard },
    { provide: APP_FILTER, useClass: ApiExceptionFilter },
  ],
})
export class AppModule {}
