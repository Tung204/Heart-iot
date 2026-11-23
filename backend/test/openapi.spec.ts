import 'reflect-metadata';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { AdminController } from '../src/admin/admin.controller';
import { AlertPolicyController } from '../src/alert-policy/alert-policy.controller';
import { AuthController } from '../src/auth/auth.controller';
import { StudioController } from '../src/studio/studio.controller';
import { AssistantController } from '../src/assistant/assistant.controller';
import { CareController } from '../src/care/care.controller';
import { CareRulesController } from '../src/care-rules/care-rules.controller';
import { AdminDevicesController, SubjectDevicesController } from '../src/devices/devices.controller';
import { EmergencyContactsController } from '../src/emergency-contacts/emergency-contacts.controller';
import { IncidentsController } from '../src/incidents/incidents.controller';
import { MaintenanceController } from '../src/maintenance/maintenance.controller';
import { NotificationSettingsController } from '../src/notifications/notification-settings.controller';
import { NotificationsController } from '../src/notifications/notifications.controller';
import { MeasurementsController } from '../src/measurements/measurements.controller';
import { RemindersController } from '../src/reminders/reminders.controller';
import { SubjectsController } from '../src/subjects/subjects.controller';
import { VisitReportController } from '../src/visit-reports/visit-report.controller';

/**
 * Hợp đồng OpenAPI một phần phải khớp route thật của các controller đang phủ.
 * Test đọc metadata decorator, không mở app/DB; thêm route mới phải cập nhật
 * `packages/contracts/scripts/generate-openapi.mjs` và sinh lại artifact.
 */

type ControllerClass = new (...args: any[]) => object;

const METHOD_NAMES: Partial<Record<RequestMethod, string>> = {
  [RequestMethod.GET]: 'get',
  [RequestMethod.POST]: 'post',
  [RequestMethod.PUT]: 'put',
  [RequestMethod.PATCH]: 'patch',
  [RequestMethod.DELETE]: 'delete',
};

function pathValues(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === 'string') return [value];
  return [''];
}

function routesOf(controller: ControllerClass): string[] {
  const bases = pathValues(Reflect.getMetadata(PATH_METADATA, controller));
  const routes: string[] = [];
  for (const name of Object.getOwnPropertyNames(controller.prototype)) {
    if (name === 'constructor') continue;
    const handler = controller.prototype[name] as object;
    const method = METHOD_NAMES[Reflect.getMetadata(METHOD_METADATA, handler) as RequestMethod];
    if (!method) continue;
    for (const base of bases) {
      for (const path of pathValues(Reflect.getMetadata(PATH_METADATA, handler))) {
        const joined = [base, path]
          .filter(Boolean)
          .join('/')
          .replace(/^\/+|\/+$/g, '')
          .replace(/\/+/g, '/');
        const route = `/${joined}`.replace(/\/+/g, '/').replace(/:([A-Za-z0-9_]+)/g, '{$1}');
        routes.push(`${method} ${route}`);
      }
    }
  }
  return routes.sort();
}

const spec = JSON.parse(
  readFileSync(resolve(__dirname, '../../docs/api/openapi.v1.json'), 'utf8'),
) as { paths: Record<string, Record<string, unknown>> };

const HTTP_METHODS = new Set(['get', 'post', 'put', 'patch', 'delete']);
const documented: string[] = [];
for (const [path, item] of Object.entries(spec.paths)) {
  for (const method of Object.keys(item)) {
    if (HTTP_METHODS.has(method)) documented.push(`${method} ${path}`);
  }
}

describe('OpenAPI một phần — khớp route controller', () => {
  it('phủ đúng toàn bộ route của mười tám controller đang phủ, không thừa/thiếu', () => {
    const controllerRoutes = [
      ...routesOf(AdminController),
      ...routesOf(AdminDevicesController),
      ...routesOf(AssistantController),
      ...routesOf(SubjectsController),
      ...routesOf(MeasurementsController),
      ...routesOf(VisitReportController),
      ...routesOf(IncidentsController),
      ...routesOf(SubjectDevicesController),
      ...routesOf(CareController),
      ...routesOf(RemindersController),
      ...routesOf(EmergencyContactsController),
      ...routesOf(MaintenanceController),
      ...routesOf(AlertPolicyController),
      ...routesOf(CareRulesController),
      ...routesOf(NotificationsController),
      ...routesOf(NotificationSettingsController),
      ...routesOf(AuthController),
      ...routesOf(StudioController),
    ].sort();
    expect(documented.sort()).toEqual(controllerRoutes);
  });
});
