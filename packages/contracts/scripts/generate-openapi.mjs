/**
 * Sinh OpenAPI 3.1 **một phần** cho quản trị, trợ lý, hồ sơ, số đo và phiếu đi khám từ schema Zod.
 *
 * Đây không phải toàn bộ API: chỉ các route được khai báo dưới đây. Mục đích là
 * giữ một artifact máy đọc được cho các hợp đồng mới, không thay đặc tả docs/04.
 * Chạy `pnpm --filter @heart-iot/contracts openapi:generate`; CI/check dùng
 * `openapi:check` để phát hiện artifact lệch schema.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { z } = require('zod');
const core = require('../dist/core.js');
const admin = require('../dist/admin.js');
const assistant = require('../dist/assistant.js');
const subjects = require('../dist/subjects.js');
const measurements = require('../dist/measurements.js');
const insights = require('../dist/insights.js');
const reports = require('../dist/reports.js');
const incidents = require('../dist/incidents.js');
const telemetry = require('../dist/telemetry.js');
const devices = require('../dist/devices.js');
const care = require('../dist/care.js');
const reminders = require('../dist/reminders.js');
const contacts = require('../dist/contacts.js');
const tasks = require('../dist/tasks.js');
const alertPolicy = require('../dist/alert-policy.js');
const careRules = require('../dist/care-rules.js');
const notifications = require('../dist/notifications.js');
const notificationPreferences = require('../dist/notification-preferences.js');

const here = dirname(fileURLToPath(import.meta.url));
const outputPath = resolve(here, '../../../docs/api/openapi.v1.json');

/** Bỏ `$schema` cấp schema; OpenAPI 3.1 dùng dialect ở document level. */
function toJsonSchema(schema, io = 'output') {
  const { $schema, ...rest } = z.toJSONSchema(schema, { io });
  return rest;
}

function ref(name) {
  return { $ref: `#/components/schemas/${name}` };
}

const errorResponse = (description) => ({
  description,
  content: { 'application/json': { schema: ref('ApiError') } },
});

function ok(schemaRef, description = 'Thành công') {
  return { description, content: { 'application/json': { schema: schemaRef } } };
}

function validation() {
  return errorResponse('Payload/query không hợp lệ theo hợp đồng');
}

function auth() {
  return {
    401: errorResponse('Chưa đăng nhập hoặc phiên hết hạn'),
    403: errorResponse('Không có quyền theo chính sách hồ sơ'),
  };
}

function notFound() {
  return errorResponse('Không tìm thấy tài nguyên hoặc không có quyền xem');
}

function conflict() {
  return errorResponse('Xung đột trạng thái/phiên bản hoặc nội dung đã thay đổi');
}

function pathId(name = 'id') {
  return {
    name,
    in: 'path',
    required: true,
    schema: { type: 'string', format: 'uuid' },
  };
}

function pathKey(name) {
  return {
    name,
    in: 'path',
    required: true,
    schema: { type: 'string', minLength: 1, maxLength: 80 },
  };
}

/** Token lời mời base64url; không phải UUID. */
function pathToken(name = 'token') {
  return {
    name,
    in: 'path',
    required: true,
    schema: { type: 'string', minLength: 20, maxLength: 256 },
  };
}

/** Path enum cho kind cấu hình. */
function pathEnum(name, values) {
  return { name, in: 'path', required: true, schema: { type: 'string', enum: values } };
}

/** Query params lấy từ schema input; default/optional giữ nguyên. */
function queryParams(schema) {
  const json = toJsonSchema(schema, 'input');
  const required = new Set(json.required ?? []);
  return Object.entries(json.properties ?? {}).map(([name, property]) => ({
    name,
    in: 'query',
    required: required.has(name),
    schema: property,
  }));
}

function body(schemaName) {
  return {
    required: true,
    content: { 'application/json': { schema: ref(schemaName) } },
  };
}

/** Header params lấy từ schema input, dùng cho ingest thiết bị. */
function headerParams(schema) {
  const json = toJsonSchema(schema, 'input');
  const required = new Set(json.required ?? []);
  return Object.entries(json.properties ?? {}).map(([name, property]) => ({
    name,
    in: 'header',
    required: required.has(name),
    schema: property,
  }));
}

const paths = {};

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------

paths['/admin/outbox/summary'] = {
  get: {
    tags: ['Admin'],
    operationId: 'adminOutboxSummary',
    summary: 'Tổng hợp outbox thông báo',
    description:
      'Chỉ đọc số đếm theo trạng thái/kênh/kind; không trả title/body/người nhận/endpoint hay lỗi gửi.',
    responses: { 200: ok(ref('AdminOutboxSummary')), ...auth() },
  },
};

paths['/admin/jobs'] = {
  get: {
    tags: ['Admin'],
    operationId: 'adminJobs',
    summary: 'Trạng thái các job nền',
    description:
      'Chỉ đọc `job_runs` của 3 job cố định; không chạy lại job, không audit, không trả nội dung sức khỏe.',
    responses: { 200: ok(ref('AdminJobs')), ...auth() },
  },
};

paths['/admin/retention/preview'] = {
  get: {
    tags: ['Admin'],
    operationId: 'adminRetentionPreview',
    summary: 'Xem trước phạm vi retention',
    description: 'Chỉ đếm theo cấu hình hiện tại; không xóa, không ghi `job_runs`.',
    responses: { 200: ok(ref('RetentionPreview')), ...auth() },
  },
};

paths['/admin/overview'] = {
  get: {
    tags: ['Admin'],
    operationId: 'adminOverview',
    summary: 'Tổng quan vận hành',
    responses: { 200: ok(ref('AdminOverview')), ...auth() },
  },
};

paths['/admin/users'] = {
  get: {
    tags: ['Admin'],
    operationId: 'adminListUsers',
    summary: 'Danh sách tài khoản',
    parameters: queryParams(admin.adminUserQuerySchema),
    responses: { 200: ok(ref('AdminUserList')), ...auth(), 422: validation() },
  },
};

paths['/admin/users/{id}/status'] = {
  patch: {
    tags: ['Admin'],
    operationId: 'adminUpdateUserStatus',
    summary: 'Khóa/mở khóa tài khoản',
    parameters: [pathId('id')],
    requestBody: body('UpdateUserStatus'),
    responses: {
      200: ok(ref('AdminUserSummary')),
      ...auth(),
      404: notFound(),
      409: conflict(),
      422: validation(),
    },
  },
};

paths['/admin/audit'] = {
  get: {
    tags: ['Admin'],
    operationId: 'adminListAudit',
    summary: 'Nhật ký audit đã lọc',
    parameters: queryParams(admin.auditQuerySchema),
    responses: { 200: ok(ref('AuditList')), ...auth(), 422: validation() },
  },
};

paths['/admin/policies/{key}'] = {
  get: {
    tags: ['Admin'],
    operationId: 'adminGetPolicy',
    summary: 'Bản policy đang active và lịch sử gần nhất',
    parameters: [pathKey('key')],
    responses: { 200: ok(ref('PolicyState')), ...auth(), 404: notFound() },
  },
  put: {
    tags: ['Admin'],
    operationId: 'adminPublishPolicy',
    summary: 'Publish policy theo CAS và preview digest',
    parameters: [pathKey('key')],
    requestBody: body('PolicyPublishRequest'),
    responses: {
      200: ok(ref('PolicyPublish')),
      ...auth(),
      404: notFound(),
      409: conflict(),
      422: validation(),
    },
  },
};

paths['/admin/policies/{key}/previews'] = {
  post: {
    tags: ['Admin'],
    operationId: 'adminPreviewPolicy',
    summary: 'Preview policy, không ghi DB',
    parameters: [pathKey('key')],
    requestBody: body('PolicyPreviewRequest'),
    responses: {
      200: ok(ref('PolicyPreview')),
      ...auth(),
      404: notFound(),
      409: conflict(),
      422: validation(),
    },
  },
};

// ---------------------------------------------------------------------------
// Trợ lý — capabilities và nháp hành động (FR-21)
// ---------------------------------------------------------------------------

const subjectParam = pathId('id');

paths['/subjects/{id}/assistant/summary'] = {
  get: {
    tags: ['Assistant'],
    operationId: 'assistantSummary',
    summary: 'Tóm tắt sức khỏe theo khoảng đã kiểm quyền',
    description:
      'Chỉ tổng hợp aggregate đã kiểm quyền; có dataQuality và fallback template, không phải chẩn đoán.',
    parameters: [subjectParam, ...queryParams(assistant.assistantSummaryQuerySchema)],
    responses: {
      200: ok(ref('AssistantSummary')),
      ...auth(),
      404: notFound(),
      422: validation(),
    },
  },
};

paths['/subjects/{id}/assistant/ask'] = {
  post: {
    tags: ['Assistant'],
    operationId: 'assistantAsk',
    summary: 'Hỏi đáp trên dữ liệu đã kiểm quyền',
    parameters: [subjectParam],
    requestBody: body('AssistantAsk'),
    responses: {
      200: ok(ref('AssistantAnswer')),
      ...auth(),
      404: notFound(),
      422: validation(),
    },
  },
};

paths['/subjects/{id}/assistant/capabilities'] = {
  get: {
    tags: ['Assistant'],
    operationId: 'assistantCapabilities',
    summary: 'Việc trợ lý được/không được làm trên hồ sơ',
    parameters: [subjectParam],
    responses: { 200: ok(ref('AssistantCapabilities')), ...auth(), 404: notFound() },
  },
};

paths['/subjects/{id}/assistant/drafts'] = {
  get: {
    tags: ['Assistant'],
    operationId: 'assistantListDrafts',
    summary: 'Nháp còn hiệu lực của chủ hồ sơ',
    parameters: [subjectParam, ...queryParams(assistant.assistantDraftListQuerySchema)],
    responses: {
      200: ok({ type: 'array', items: ref('AssistantDraft') }),
      ...auth(),
      404: notFound(),
      422: validation(),
    },
  },
  post: {
    tags: ['Assistant'],
    operationId: 'assistantCreateDraft',
    summary: 'Tạo nháp lịch nhắc (chưa ghi lịch)',
    parameters: [subjectParam],
    requestBody: body('CreateAssistantDraft'),
    responses: {
      201: ok(ref('AssistantDraft'), 'Đã tạo nháp'),
      ...auth(),
      404: notFound(),
      409: conflict(),
      422: validation(),
    },
  },
};

paths['/subjects/{id}/assistant/drafts/from-text'] = {
  post: {
    tags: ['Assistant'],
    operationId: 'assistantCreateDraftFromText',
    summary: 'Tạo nháp từ câu lệnh đơn giản (rule-based)',
    parameters: [subjectParam],
    requestBody: body('AssistantDraftFromText'),
    responses: {
      201: ok(ref('AssistantDraft'), 'Đã tạo nháp'),
      ...auth(),
      404: notFound(),
      409: conflict(),
      422: validation(),
    },
  },
};

paths['/assistant/drafts/{id}'] = {
  get: {
    tags: ['Assistant'],
    operationId: 'assistantGetDraft',
    summary: 'Xem nháp của chính mình',
    parameters: [pathId('id')],
    responses: { 200: ok(ref('AssistantDraft')), ...auth(), 404: notFound() },
  },
  patch: {
    tags: ['Assistant'],
    operationId: 'assistantUpdateDraft',
    summary: 'Sửa nháp trước khi xác nhận',
    parameters: [pathId('id')],
    requestBody: body('UpdateAssistantDraft'),
    responses: {
      200: ok(ref('AssistantDraft')),
      ...auth(),
      404: notFound(),
      409: conflict(),
      422: validation(),
    },
  },
};

paths['/assistant/drafts/{id}/confirm'] = {
  post: {
    tags: ['Assistant'],
    operationId: 'assistantConfirmDraft',
    summary: 'Xác nhận nháp, tạo lịch nhắc trong transaction',
    parameters: [pathId('id')],
    responses: {
      200: ok(ref('AssistantDraft')),
      ...auth(),
      404: notFound(),
      409: conflict(),
    },
  },
};

paths['/assistant/drafts/{id}/cancel'] = {
  post: {
    tags: ['Assistant'],
    operationId: 'assistantCancelDraft',
    summary: 'Hủy nháp chưa xác nhận',
    parameters: [pathId('id')],
    responses: {
      200: ok(ref('AssistantDraft')),
      ...auth(),
      404: notFound(),
      409: conflict(),
    },
  },
};

// ---------------------------------------------------------------------------
// Hồ sơ, số đo và phiếu đi khám
// ---------------------------------------------------------------------------

paths['/subjects'] = {
  get: {
    tags: ['Subjects'],
    operationId: 'listSubjects',
    summary: 'Danh sách hồ sơ người dùng được xem',
    responses: { 200: ok(ref('SubjectList')), ...auth() },
  },
  post: {
    tags: ['Subjects'],
    operationId: 'createSubject',
    summary: 'Tạo hồ sơ người được theo dõi',
    requestBody: body('CreateSubject'),
    responses: { 201: ok(ref('SubjectDetail'), 'Đã tạo hồ sơ'), ...auth(), 422: validation() },
  },
};

paths['/subjects/{id}'] = {
  get: {
    tags: ['Subjects'],
    operationId: 'getSubject',
    summary: 'Chi tiết hồ sơ theo quyền hiện tại',
    parameters: [subjectParam],
    responses: { 200: ok(ref('SubjectDetail')), ...auth(), 404: notFound() },
  },
  patch: {
    tags: ['Subjects'],
    operationId: 'updateSubject',
    summary: 'Cập nhật tên hiển thị/múi giờ của hồ sơ',
    parameters: [subjectParam],
    requestBody: body('UpdateSubject'),
    responses: { 200: ok(ref('SubjectDetail')), ...auth(), 404: notFound(), 422: validation() },
  },
};

paths['/subjects/{id}/archive'] = {
  post: {
    tags: ['Subjects'],
    operationId: 'archiveSubject',
    summary: 'Lưu trữ hồ sơ, thu hồi care link đang active',
    description: 'Không xóa telemetry/cảnh báo; trả 204 và không có body.',
    parameters: [subjectParam],
    requestBody: body('ArchiveSubject'),
    responses: {
      204: { description: 'Đã lưu trữ hồ sơ' },
      ...auth(),
      400: errorResponse('Tên xác nhận không khớp'),
      404: notFound(),
      409: conflict(),
      422: validation(),
    },
  },
};

paths['/subjects/{id}/deletion-requests'] = {
  post: {
    tags: ['Subjects'],
    operationId: 'requestSubjectDeletion',
    summary: 'Ghi nhận yêu cầu xóa dữ liệu (chưa xóa)',
    parameters: [subjectParam],
    requestBody: body('DeletionRequest'),
    responses: {
      202: ok(ref('DeletionRequestRecorded'), 'Đã ghi nhận yêu cầu, dữ liệu chưa bị xóa'),
      ...auth(),
      400: errorResponse('Tên xác nhận không khớp'),
      404: notFound(),
      422: validation(),
    },
  },
};

paths['/subjects/{id}/measurements'] = {
  get: {
    tags: ['Measurements'],
    operationId: 'listMeasurements',
    summary: 'Timeline số đo trong khoảng đã kiểm quyền',
    parameters: [subjectParam, ...queryParams(measurements.measurementsQuerySchema)],
    responses: { 200: ok(ref('MeasurementsResponse')), ...auth(), 404: notFound(), 422: validation() },
  },
};

paths['/subjects/{id}/daily-summary'] = {
  get: {
    tags: ['Measurements'],
    operationId: 'getDailySummary',
    summary: 'Tổng hợp một ngày theo múi giờ hồ sơ',
    parameters: [subjectParam, ...queryParams(measurements.dailySummaryQuerySchema)],
    responses: { 200: ok(ref('DailySummary')), ...auth(), 404: notFound(), 422: validation() },
  },
};

paths['/subjects/{id}/insights'] = {
  get: {
    tags: ['Measurements'],
    operationId: 'getInsights',
    summary: 'Xu hướng nhiều ngày, ngày thiếu dữ liệu vẫn xuất hiện',
    parameters: [subjectParam, ...queryParams(insights.insightsQuerySchema)],
    responses: {
      200: ok(ref('InsightsResponse')),
      ...auth(),
      400: errorResponse('Tham số truy vấn không hợp lệ'),
      404: notFound(),
    },
  },
};

paths['/subjects/{id}/export.csv'] = {
  get: {
    tags: ['Measurements'],
    operationId: 'exportMeasurementsCsv',
    summary: 'Xuất CSV số đo đã kiểm quyền',
    parameters: [subjectParam, ...queryParams(measurements.exportQuerySchema)],
    responses: {
      200: {
        description: 'CSV UTF-8 có BOM',
        content: { 'text/csv': { schema: { type: 'string' } } },
      },
      ...auth(),
      404: notFound(),
      422: validation(),
    },
  },
};

paths['/subjects/{id}/visit-report'] = {
  get: {
    tags: ['Reports'],
    operationId: 'getVisitReport',
    summary: 'Phiếu đi khám tổng hợp, không chẩn đoán',
    parameters: [subjectParam, ...queryParams(reports.visitReportQuerySchema)],
    responses: { 200: ok(ref('VisitReport')), ...auth(), 404: notFound(), 422: validation() },
  },
};

// ---------------------------------------------------------------------------
// Cảnh báo / sự cố
// ---------------------------------------------------------------------------

paths['/ingest/events'] = {
  post: {
    tags: ['Incidents'],
    operationId: 'ingestIncidentEvent',
    summary: 'Thiết bị gửi sự kiện cảnh báo',
    description:
      'Xác thực bằng header thiết bị, không dùng phiên người dùng; ACK sau khi ghi DB trong transaction.',
    security: [],
    parameters: headerParams(telemetry.ingestHeadersSchema),
    requestBody: body('IngestEvent'),
    responses: {
      202: ok(ref('IngestAck'), 'Đã xử lý sự kiện (kể cả duplicate/rejected có ACK)'),
      401: errorResponse('Thiếu hoặc sai x-device-id/x-device-key'),
      422: validation(),
    },
  },
};

paths['/subjects/{id}/alerts'] = {
  get: {
    tags: ['Incidents'],
    operationId: 'listAlerts',
    summary: 'Danh sách cảnh báo đã kiểm quyền',
    parameters: [subjectParam, ...queryParams(incidents.alertsQuerySchema)],
    responses: { 200: ok(ref('IncidentList')), ...auth(), 404: notFound(), 422: validation() },
  },
};

paths['/alerts/{id}'] = {
  get: {
    tags: ['Incidents'],
    operationId: 'getAlert',
    summary: 'Chi tiết cảnh báo, sự kiện, hành động và người nhận',
    parameters: [pathId('id')],
    responses: { 200: ok(ref('IncidentDetail')), ...auth(), 404: notFound() },
  },
};

paths['/alerts/{id}/acknowledge'] = {
  post: {
    tags: ['Incidents'],
    operationId: 'acknowledgeAlert',
    summary: 'Xác nhận cảnh báo theo version',
    parameters: [pathId('id')],
    requestBody: body('AcknowledgeAlert'),
    responses: {
      200: ok(ref('IncidentDetail')),
      ...auth(),
      404: notFound(),
      409: conflict(),
      422: validation(),
    },
  },
};

paths['/alerts/{id}/resolve'] = {
  post: {
    tags: ['Incidents'],
    operationId: 'resolveAlert',
    summary: 'Đóng cảnh báo kèm lý do và kết quả',
    parameters: [pathId('id')],
    requestBody: body('ResolveAlert'),
    responses: {
      200: ok(ref('IncidentDetail')),
      ...auth(),
      404: notFound(),
      409: conflict(),
      422: validation(),
    },
  },
};

// ---------------------------------------------------------------------------
// Thiết bị
// ---------------------------------------------------------------------------

paths['/admin/devices'] = {
  post: {
    tags: ['Devices'],
    operationId: 'adminCreateDevice',
    summary: 'Tạo thiết bị và trả khóa/mã nhận một lần',
    description:
      'Response chứa `deviceKey` và `claimCode` chỉ trả một lần; không lưu khóa thô ở client quá lâu.',
    requestBody: body('CreateDevice'),
    responses: {
      201: ok(ref('DeviceCreated'), 'Đã tạo thiết bị'),
      ...auth(),
      409: conflict(),
      422: validation(),
    },
  },
  get: {
    tags: ['Devices'],
    operationId: 'adminListDevices',
    summary: 'Danh sách thiết bị cho quản trị',
    responses: { 200: ok(ref('DeviceList')), ...auth() },
  },
};

paths['/admin/devices/{id}/claim-code'] = {
  post: {
    tags: ['Devices'],
    operationId: 'adminIssueClaimCode',
    summary: 'Cấp lại mã nhận thiết bị',
    parameters: [pathId('id')],
    responses: {
      201: ok(ref('NewClaimCode'), 'Đã cấp mã mới'),
      ...auth(),
      404: notFound(),
      409: conflict(),
    },
  },
};

paths['/admin/devices/{id}/rotate-key'] = {
  post: {
    tags: ['Devices'],
    operationId: 'adminRotateDeviceKey',
    summary: 'Đổi khóa thiết bị, trả khóa mới một lần',
    parameters: [pathId('id')],
    responses: {
      200: ok(ref('RotateDeviceKey')),
      ...auth(),
      404: notFound(),
      409: conflict(),
    },
  },
};

paths['/subjects/{id}/devices/claim'] = {
  post: {
    tags: ['Devices'],
    operationId: 'claimDevice',
    summary: 'Nhận thiết bị vào hồ sơ bằng mã claim',
    parameters: [subjectParam],
    requestBody: body('ClaimDevice'),
    responses: {
      201: ok(ref('ClaimResult'), 'Đã gán thiết bị'),
      ...auth(),
      404: notFound(),
      409: conflict(),
      422: validation(),
    },
  },
};

paths['/subjects/{id}/devices'] = {
  get: {
    tags: ['Devices'],
    operationId: 'listSubjectDevices',
    summary: 'Thiết bị đang gán cho hồ sơ kèm trạng thái',
    parameters: [subjectParam],
    responses: { 200: ok(ref('SubjectDevicesResponse')), ...auth(), 404: notFound() },
  },
};

paths['/subjects/{id}/status'] = {
  get: {
    tags: ['Devices'],
    operationId: 'getSubjectStatus',
    summary: 'Trạng thái thiết bị và policy đang áp dụng',
    parameters: [subjectParam],
    responses: { 200: ok(ref('SubjectStatusResponse')), ...auth(), 404: notFound() },
  },
};

paths['/devices/{id}/release'] = {
  post: {
    tags: ['Devices'],
    operationId: 'releaseDevice',
    summary: 'Kết thúc gán thiết bị, không xóa lịch sử',
    parameters: [pathId('id')],
    requestBody: body('ReleaseDevice'),
    responses: {
      200: ok(ref('ReleaseResult')),
      ...auth(),
      404: notFound(),
      409: conflict(),
      422: validation(),
    },
  },
};

// ---------------------------------------------------------------------------
// Chia sẻ chăm sóc
// ---------------------------------------------------------------------------

paths['/subjects/{id}/invitations'] = {
  post: {
    tags: ['Care'],
    operationId: 'createCareInvitation',
    summary: 'Tạo lời mời chia sẻ quyền chăm sóc',
    description: 'Token chỉ trả một lần trong `InvitationCreated`; email đầy đủ chỉ chủ hồ sơ thấy.',
    parameters: [subjectParam],
    requestBody: body('CreateInvitation'),
    responses: {
      201: ok(ref('InvitationCreated'), 'Đã tạo lời mời'),
      ...auth(),
      404: notFound(),
      409: conflict(),
      422: validation(),
    },
  },
  get: {
    tags: ['Care'],
    operationId: 'listCareInvitations',
    summary: 'Danh sách lời mời của hồ sơ',
    parameters: [subjectParam],
    responses: { 200: ok(ref('InvitationList')), ...auth(), 404: notFound() },
  },
};

paths['/invitations/{token}'] = {
  get: {
    tags: ['Care'],
    operationId: 'getPublicInvitation',
    summary: 'Xem trước lời mời công khai',
    description: 'Không cần đăng nhập; không trả email người được mời hay dữ liệu sức khỏe.',
    security: [],
    parameters: [pathToken()],
    responses: { 200: ok(ref('PublicInvitation')), 404: notFound(), 422: validation() },
  },
};

paths['/invitations/{token}/accept'] = {
  post: {
    tags: ['Care'],
    operationId: 'acceptCareInvitation',
    summary: 'Chấp nhận lời mời, tạo care link',
    parameters: [pathToken()],
    responses: {
      201: ok(ref('CareLinkSummary'), 'Đã chấp nhận lời mời'),
      ...auth(),
      404: notFound(),
      409: conflict(),
      422: validation(),
    },
  },
};

paths['/subjects/{id}/care-links'] = {
  get: {
    tags: ['Care'],
    operationId: 'listCareLinks',
    summary: 'Danh sách care link active/revoked',
    parameters: [subjectParam],
    responses: { 200: ok(ref('CareLinkList')), ...auth(), 404: notFound() },
  },
};

paths['/subjects/{id}/care-links/{linkId}'] = {
  delete: {
    tags: ['Care'],
    operationId: 'revokeCareLink',
    summary: 'Thu hồi care link, đóng quyền ngay',
    parameters: [subjectParam, pathId('linkId')],
    responses: {
      204: { description: 'Đã thu hồi care link' },
      ...auth(),
      404: notFound(),
      409: conflict(),
    },
  },
};

// ---------------------------------------------------------------------------
// Lịch nhắc và tuân thủ
// ---------------------------------------------------------------------------

paths['/subjects/{id}/care/adherence'] = {
  get: {
    tags: ['Reminders'],
    operationId: 'getCareAdherence',
    summary: 'Tổng hợp tuân thủ lịch nhắc theo khoảng ngày',
    parameters: [subjectParam, ...queryParams(reminders.careAdherenceQuerySchema)],
    responses: { 200: ok(ref('CareAdherence')), ...auth(), 404: notFound(), 422: validation() },
  },
};

paths['/subjects/{id}/reminders'] = {
  get: {
    tags: ['Reminders'],
    operationId: 'listReminders',
    summary: 'Danh sách lịch nhắc của hồ sơ',
    parameters: [subjectParam],
    responses: { 200: ok(ref('ReminderList')), ...auth(), 404: notFound() },
  },
  post: {
    tags: ['Reminders'],
    operationId: 'createReminder',
    summary: 'Tạo lịch nhắc, chỉ chủ hồ sơ',
    parameters: [subjectParam],
    requestBody: body('CreateReminder'),
    responses: {
      201: ok(ref('ReminderSummary'), 'Đã tạo lịch nhắc'),
      ...auth(),
      404: notFound(),
      422: validation(),
    },
  },
};

paths['/subjects/{id}/reminders/today'] = {
  get: {
    tags: ['Reminders'],
    operationId: 'getReminderDay',
    summary: 'Occurrence của một ngày theo timezone hồ sơ',
    parameters: [subjectParam, ...queryParams(reminders.reminderTodayQuerySchema)],
    responses: { 200: ok(ref('ReminderDay')), ...auth(), 404: notFound(), 422: validation() },
  },
};

paths['/subjects/{id}/reminders/{reminderId}'] = {
  patch: {
    tags: ['Reminders'],
    operationId: 'updateReminder',
    summary: 'Sửa lịch nhắc, chỉ chủ hồ sơ',
    parameters: [subjectParam, pathId('reminderId')],
    requestBody: body('UpdateReminder'),
    responses: {
      200: ok(ref('ReminderSummary')),
      ...auth(),
      404: notFound(),
      422: validation(),
    },
  },
  delete: {
    tags: ['Reminders'],
    operationId: 'archiveReminder',
    summary: 'Lưu trữ mềm lịch nhắc, giữ lịch sử',
    parameters: [subjectParam, pathId('reminderId')],
    responses: { 204: { description: 'Đã lưu trữ lịch nhắc' }, ...auth(), 404: notFound() },
  },
};

paths['/subjects/{id}/reminders/{reminderId}/completions'] = {
  post: {
    tags: ['Reminders'],
    operationId: 'completeReminderOccurrence',
    summary: 'Đánh dấu đã làm/bỏ qua occurrence',
    parameters: [subjectParam, pathId('reminderId')],
    requestBody: body('ReminderCompletionWrite'),
    responses: {
      200: ok(ref('ReminderCompletionResult')),
      ...auth(),
      404: notFound(),
      422: validation(),
    },
  },
  delete: {
    tags: ['Reminders'],
    operationId: 'uncompleteReminderOccurrence',
    summary: 'Hoàn tác đánh dấu occurrence',
    parameters: [
      subjectParam,
      pathId('reminderId'),
      ...queryParams(reminders.reminderCompletionQuerySchema),
    ],
    responses: {
      204: { description: 'Đã hoàn tác đánh dấu' },
      ...auth(),
      404: notFound(),
      422: validation(),
    },
  },
};

// ---------------------------------------------------------------------------
// Liên hệ khẩn cấp và công việc bảo trì
// ---------------------------------------------------------------------------

paths['/subjects/{id}/emergency-contacts'] = {
  get: {
    tags: ['Contacts'],
    operationId: 'listEmergencyContacts',
    summary: 'Liên hệ khẩn cấp của hồ sơ',
    description: 'Chủ hồ sơ hoặc caregiver có `canReceiveAlerts`; dữ liệu nhạy cảm.',
    parameters: [subjectParam],
    responses: { 200: ok(ref('EmergencyContactList')), ...auth(), 404: notFound() },
  },
  post: {
    tags: ['Contacts'],
    operationId: 'createEmergencyContact',
    summary: 'Thêm liên hệ khẩn cấp, chỉ chủ hồ sơ',
    parameters: [subjectParam],
    requestBody: body('EmergencyContactUpdate'),
    responses: {
      201: ok(ref('EmergencyContact'), 'Đã thêm liên hệ'),
      ...auth(),
      404: notFound(),
      409: conflict(),
      422: validation(),
    },
  },
};

paths['/subjects/{id}/emergency-contacts/{contactId}'] = {
  patch: {
    tags: ['Contacts'],
    operationId: 'updateEmergencyContact',
    summary: 'Sửa liên hệ khẩn cấp, chỉ chủ hồ sơ',
    parameters: [subjectParam, pathId('contactId')],
    requestBody: body('EmergencyContactUpdate'),
    responses: {
      200: ok(ref('EmergencyContact')),
      ...auth(),
      404: notFound(),
      422: validation(),
    },
  },
  delete: {
    tags: ['Contacts'],
    operationId: 'deleteEmergencyContact',
    summary: 'Xóa liên hệ khẩn cấp, chỉ chủ hồ sơ',
    parameters: [subjectParam, pathId('contactId')],
    responses: { 204: { description: 'Đã xóa liên hệ' }, ...auth(), 404: notFound() },
  },
};

paths['/maintenance-tasks'] = {
  get: {
    tags: ['Maintenance'],
    operationId: 'listMaintenanceTasks',
    summary: 'Danh sách công việc bảo trì theo quyền',
    parameters: queryParams(tasks.maintenanceTaskQuerySchema),
    responses: { 200: ok(ref('MaintenanceTaskList')), ...auth(), 404: notFound(), 422: validation() },
  },
  post: {
    tags: ['Maintenance'],
    operationId: 'createMaintenanceTask',
    summary: 'Tạo việc bảo trì cho thiết bị đang gắn',
    requestBody: body('CreateTask'),
    responses: {
      201: ok(ref('MaintenanceTaskSummary'), 'Đã tạo việc bảo trì'),
      ...auth(),
      404: notFound(),
      422: validation(),
    },
  },
};

paths['/maintenance-tasks/{id}/close'] = {
  post: {
    tags: ['Maintenance'],
    operationId: 'closeMaintenanceTask',
    summary: 'Đóng việc bảo trì kèm lý do',
    parameters: [pathId('id')],
    requestBody: body('CloseTask'),
    responses: {
      200: ok(ref('MaintenanceTaskSummary')),
      ...auth(),
      404: notFound(),
      409: conflict(),
      422: validation(),
    },
  },
};

// ---------------------------------------------------------------------------
// Cấu hình chính sách chăm sóc
// ---------------------------------------------------------------------------

paths['/subjects/{id}/alert-policy'] = {
  get: {
    tags: ['Policies'],
    operationId: 'getAlertPolicy',
    summary: 'Chính sách leo thang cảnh báo của hồ sơ',
    parameters: [subjectParam],
    responses: { 200: ok(ref('AlertPolicyView')), ...auth(), 404: notFound() },
  },
  put: {
    tags: ['Policies'],
    operationId: 'updateAlertPolicy',
    summary: 'Cập nhật chính sách leo thang, chỉ chủ hồ sơ',
    parameters: [subjectParam],
    requestBody: body('AlertEscalationConfig'),
    responses: {
      200: ok(ref('AlertPolicyView')),
      ...auth(),
      404: notFound(),
      409: conflict(),
      422: validation(),
    },
  },
};

paths['/subjects/{id}/alert-policy/previews'] = {
  post: {
    tags: ['Policies'],
    operationId: 'previewAlertPolicy',
    summary: 'Xem trước mốc/người nhận, không ghi DB',
    parameters: [subjectParam],
    responses: { 200: ok(ref('AlertPolicyPreview')), ...auth(), 404: notFound() },
  },
};

paths['/subjects/{id}/care-rules/{kind}'] = {
  get: {
    tags: ['Policies'],
    operationId: 'getCareRule',
    summary: 'Quy tắc chăm sóc chủ động theo loại',
    parameters: [subjectParam, pathEnum('kind', ['inactivity', 'care_digest'])],
    responses: { 200: ok(ref('CareRuleView')), ...auth(), 404: notFound(), 422: validation() },
  },
  put: {
    tags: ['Policies'],
    operationId: 'updateCareRule',
    summary: 'Cập nhật quy tắc chăm sóc, chỉ chủ hồ sơ',
    parameters: [subjectParam, pathEnum('kind', ['inactivity', 'care_digest'])],
    requestBody: body('CareRuleConfig'),
    responses: {
      200: ok(ref('CareRuleView')),
      ...auth(),
      404: notFound(),
      409: conflict(),
      422: validation(),
    },
  },
};

paths['/subjects/{id}/care-rules/{kind}/previews'] = {
  post: {
    tags: ['Policies'],
    operationId: 'previewCareRule',
    summary: 'Xem trước 7 ngày áp dụng, không ghi DB',
    parameters: [subjectParam, pathEnum('kind', ['inactivity', 'care_digest'])],
    responses: { 200: ok(ref('CareRulePreview')), ...auth(), 404: notFound(), 422: validation() },
  },
};

// ---------------------------------------------------------------------------
// Thông báo và Web Push
// ---------------------------------------------------------------------------

paths['/notifications'] = {
  get: {
    tags: ['Notifications'],
    operationId: 'listNotifications',
    summary: 'Hộp thư trong ứng dụng của tài khoản',
    responses: { 200: ok(ref('NotificationList')), ...auth() },
  },
};

paths['/notifications/{id}/read'] = {
  post: {
    tags: ['Notifications'],
    operationId: 'markNotificationRead',
    summary: 'Đánh dấu một thông báo đã đọc',
    parameters: [pathId('id')],
    responses: { 204: { description: 'Đã đánh dấu đã đọc' }, ...auth(), 404: notFound() },
  },
};

paths['/me/notification-preferences'] = {
  get: {
    tags: ['Notifications'],
    operationId: 'getNotificationPreferences',
    summary: 'Tuỳ chọn kênh thông báo và khóa VAPID công khai',
    responses: { 200: ok(ref('NotificationPreferences')), ...auth() },
  },
  put: {
    tags: ['Notifications'],
    operationId: 'updateNotificationPreferences',
    summary: 'Bật/tắt Web Push; in-app luôn bật',
    requestBody: body('NotificationPreferencesUpdate'),
    responses: { 200: ok(ref('NotificationPreferences')), ...auth(), 422: validation() },
  },
};

paths['/me/push-subscriptions'] = {
  get: {
    tags: ['Notifications'],
    operationId: 'listPushSubscriptions',
    summary: 'Danh sách subscription chỉ trả id và host',
    responses: { 200: ok(ref('PushSubscriptionList')), ...auth() },
  },
  post: {
    tags: ['Notifications'],
    operationId: 'addPushSubscription',
    summary: 'Đăng ký Web Push; endpoint phải HTTPS',
    requestBody: body('PushSubscriptionInput'),
    responses: {
      201: ok(ref('PushSubscriptionView'), 'Đã đăng ký subscription'),
      ...auth(),
      409: conflict(),
      422: validation(),
    },
  },
};

paths['/me/push-subscriptions/{id}'] = {
  delete: {
    tags: ['Notifications'],
    operationId: 'removePushSubscription',
    summary: 'Xóa subscription của chính tài khoản',
    parameters: [pathId('id')],
    responses: { 204: { description: 'Đã xóa subscription' }, ...auth(), 404: notFound() },
  },
};

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

const componentSchemas = {
  ApiError: core.apiErrorSchema,
  AdminUserSummary: admin.adminUserSummarySchema,
  AdminUserList: admin.adminUserListSchema,
  UpdateUserStatus: admin.updateUserStatusSchema,
  AuditList: admin.auditListSchema,
  AdminJobs: admin.adminJobsSchema,
  AdminOutboxSummary: admin.adminOutboxSummarySchema,
  RetentionPreview: admin.retentionPreviewSchema,
  AdminOverview: admin.adminOverviewSchema,
  PolicyState: admin.policyStateSchema,
  PolicyPreviewRequest: admin.policyPreviewRequestSchema,
  PolicyPreview: admin.policyPreviewSchema,
  PolicyPublishRequest: admin.policyPublishRequestSchema,
  PolicyPublish: admin.policyPublishSchema,
  AssistantCapabilities: assistant.assistantCapabilitiesSchema,
  AssistantSummary: assistant.assistantSummarySchema,
  AssistantAsk: assistant.assistantAskSchema,
  AssistantAnswer: assistant.assistantAnswerSchema,
  AssistantDraft: assistant.assistantDraftSchema,
  CreateAssistantDraft: assistant.createAssistantDraftSchema,
  AssistantDraftFromText: assistant.assistantDraftFromTextSchema,
  UpdateAssistantDraft: assistant.updateAssistantDraftSchema,
  SubjectSummary: subjects.subjectSummarySchema,
  SubjectList: subjects.subjectListSchema,
  SubjectDetail: subjects.subjectDetailSchema,
  CreateSubject: subjects.createSubjectSchema,
  UpdateSubject: subjects.updateSubjectSchema,
  ArchiveSubject: subjects.archiveSubjectSchema,
  DeletionRequest: subjects.deletionRequestSchema,
  DeletionRequestRecorded: subjects.deletionRequestRecordedSchema,
  MeasurementsResponse: measurements.measurementsResponseSchema,
  DailySummary: measurements.dailySummarySchema,
  InsightsResponse: insights.insightsResponseSchema,
  VisitReport: reports.visitReportSchema,
  IncidentSummary: incidents.incidentSummarySchema,
  IncidentList: incidents.incidentListSchema,
  IncidentDetail: incidents.incidentDetailSchema,
  AcknowledgeAlert: incidents.acknowledgeAlertSchema,
  ResolveAlert: incidents.resolveAlertSchema,
  IngestEvent: telemetry.incidentEnvelopeSchema,
  IngestAck: telemetry.ingestAckSchema,
  CreateDevice: devices.createDeviceSchema,
  DeviceCreated: devices.deviceCreatedSchema,
  DeviceList: devices.deviceListSchema,
  NewClaimCode: devices.newClaimCodeResponseSchema,
  RotateDeviceKey: devices.rotateDeviceKeySchema,
  ClaimDevice: devices.claimDeviceSchema,
  ClaimResult: devices.claimResultSchema,
  SubjectDevicesResponse: measurements.subjectDevicesResponseSchema,
  SubjectStatusResponse: measurements.subjectStatusResponseSchema,
  ReleaseDevice: devices.releaseDeviceSchema,
  ReleaseResult: devices.releaseResultSchema,
  CreateInvitation: care.createInvitationSchema,
  InvitationCreated: care.invitationCreatedSchema,
  InvitationList: care.invitationListSchema,
  PublicInvitation: care.publicInvitationSchema,
  CareLinkSummary: care.careLinkSummarySchema,
  CareLinkList: care.careLinkListSchema,
  ReminderSummary: reminders.reminderSchema,
  ReminderList: reminders.reminderListSchema,
  CreateReminder: reminders.createReminderSchema,
  UpdateReminder: reminders.updateReminderSchema,
  ReminderDay: reminders.reminderDaySchema,
  ReminderCompletionWrite: reminders.reminderCompletionWriteSchema,
  ReminderCompletionResult: reminders.reminderCompletionResultSchema,
  CareAdherence: reminders.careAdherenceSchema,
  EmergencyContact: contacts.emergencyContactSchema,
  EmergencyContactList: contacts.emergencyContactListSchema,
  EmergencyContactUpdate: contacts.emergencyContactUpdateSchema,
  MaintenanceTaskSummary: tasks.maintenanceTaskSummarySchema,
  MaintenanceTaskList: tasks.maintenanceTaskListSchema,
  CreateTask: tasks.createTaskSchema,
  CloseTask: tasks.closeTaskSchema,
  AlertPolicyView: alertPolicy.alertPolicyViewSchema,
  AlertPolicyPreview: alertPolicy.alertPolicyPreviewSchema,
  AlertEscalationConfig: alertPolicy.alertEscalationConfigSchema,
  CareRuleView: careRules.careRuleViewSchema,
  CareRulePreview: careRules.careRulePreviewSchema,
  CareRuleConfig: careRules.careRuleConfigSchema,
  NotificationList: notifications.notificationListSchema,
  NotificationPreferences: notificationPreferences.notificationPreferencesSchema,
  NotificationPreferencesUpdate: notificationPreferences.notificationPreferencesUpdateSchema,
  PushSubscriptionInput: notificationPreferences.pushSubscriptionInputSchema,
  PushSubscriptionView: notificationPreferences.pushSubscriptionViewSchema,
  PushSubscriptionList: notificationPreferences.pushSubscriptionListSchema,
};

const components = { schemas: {} };
for (const name of Object.keys(componentSchemas).sort()) {
  const io = [
    'CreateAssistantDraft',
    'AssistantDraftFromText',
    'AssistantAsk',
    'UpdateAssistantDraft',
    'UpdateUserStatus',
    'PolicyPreviewRequest',
    'PolicyPublishRequest',
    'CreateSubject',
    'UpdateSubject',
    'ArchiveSubject',
    'DeletionRequest',
    'AcknowledgeAlert',
    'ResolveAlert',
    'IngestEvent',
    'CreateDevice',
    'ClaimDevice',
    'ReleaseDevice',
    'CreateInvitation',
    'CreateReminder',
    'UpdateReminder',
    'ReminderCompletionWrite',
    'EmergencyContactUpdate',
    'CreateTask',
    'CloseTask',
    'AlertEscalationConfig',
    'CareRuleConfig',
    'NotificationPreferencesUpdate',
    'PushSubscriptionInput',
  ].includes(name)
    ? 'input'
    : 'output';
  components.schemas[name] = toJsonSchema(componentSchemas[name], io);
}

const sortedPaths = {};
for (const key of Object.keys(paths).sort()) sortedPaths[key] = paths[key];

const document = {
  openapi: '3.1.0',
  info: {
    title: 'Heart-IoT API — quản trị, trợ lý và dữ liệu sức khỏe (một phần)',
    version: '1.0.0',
    description:
      'Artifact sinh từ schema Zod cho nhóm quản trị, FR-21, hồ sơ, số đo và phiếu đi khám. Không phải toàn bộ API; đặc tả nghiệp vụ đầy đủ ở docs/04. Cookie phiên dùng tên `an_session`.',
  },
  servers: [{ url: '/api/v1' }],
  tags: [
    { name: 'Admin', description: 'Quản trị kỹ thuật; không tự mở dữ liệu sức khỏe.' },
    { name: 'Assistant', description: 'Trợ lý chỉ tạo nháp; xác nhận mới ghi nghiệp vụ.' },
    { name: 'Subjects', description: 'Hồ sơ người được theo dõi và quyền theo vai trò.' },
    { name: 'Measurements', description: 'Số đo, tổng hợp và CSV đã kiểm quyền; không nội suy.' },
    { name: 'Reports', description: 'Phiếu đi khám tổng hợp, không thay thế chẩn đoán.' },
    { name: 'Incidents', description: 'Cảnh báo, ACK/đóng theo version; không tự đóng hộ người dùng.' },
    { name: 'Devices', description: 'Thiết bị, khóa/mã chỉ trả một lần; không xóa lịch sử khi thu hồi.' },
    { name: 'Care', description: 'Chia sẻ quyền chăm sóc; token lời mời chỉ trả một lần.' },
    { name: 'Reminders', description: 'Lịch nhắc, occurrence và tuân thủ; không gợi ý liều.' },
    { name: 'Contacts', description: 'Liên hệ khẩn cấp là dữ liệu nhạy cảm; chỉ chủ hồ sơ ghi.' },
    { name: 'Maintenance', description: 'Công việc bảo trì; đóng việc theo version/lý do.' },
    { name: 'Policies', description: 'Cấu hình cảnh báo/quy tắc chăm sóc; preview không ghi DB.' },
    { name: 'Notifications', description: 'Hộp thư trong ứng dụng và Web Push; subscription chỉ trả id/host.' },
  ],
  security: [{ sessionCookie: [] }],
  paths: sortedPaths,
  components: {
    ...components,
    securitySchemes: {
      sessionCookie: { type: 'apiKey', in: 'cookie', name: 'an_session' },
    },
  },
};

function collectRefs(value, refs) {
  if (Array.isArray(value)) {
    for (const item of value) collectRefs(item, refs);
  } else if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      if (key === '$ref' && typeof child === 'string') refs.push(child);
      else collectRefs(child, refs);
    }
  }
}

/** Kiểm cấu trúc tối thiểu: ref tồn tại, path param khớp placeholder, operation có response. */
function validateDocument(doc) {
  const refs = [];
  collectRefs(doc, refs);
  const prefix = '#/components/schemas/';
  const missing = [...new Set(refs)].filter(
    (value) => !value.startsWith(prefix) || !doc.components.schemas[value.slice(prefix.length)],
  );
  if (missing.length > 0) throw new Error(`Ref không tồn tại: ${missing.join(', ')}`);

  for (const [path, item] of Object.entries(doc.paths)) {
    for (const [method, operation] of Object.entries(item)) {
      if (!['get', 'post', 'put', 'patch', 'delete'].includes(method)) continue;
      if (!operation.operationId || !operation.responses) {
        throw new Error(`Operation thiếu operationId/responses: ${method} ${path}`);
      }
      const declared = new Set(
        (operation.parameters ?? []).filter((param) => param.in === 'path').map((param) => param.name),
      );
      const placeholders = [...path.matchAll(/\{([^}]+)\}/g)].map((match) => match[1]);
      if (placeholders.some((name) => !declared.has(name)) || declared.size !== placeholders.length) {
        throw new Error(`Path param không khớp placeholder: ${method} ${path}`);
      }
    }
  }
}

validateDocument(document);

const output = `${JSON.stringify(document, null, 2)}\n`;
const check = process.argv.includes('--check');
if (check) {
  if (!existsSync(outputPath)) {
    console.error(`Thiếu ${outputPath}; chạy openapi:generate.`);
    process.exit(1);
  }
  const current = readFileSync(outputPath, 'utf8');
  if (current !== output) {
    console.error('OpenAPI artifact lệch schema; chạy openapi:generate và commit lại.');
    process.exit(1);
  }
  console.log('OpenAPI artifact khớp schema Zod.');
} else {
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, output, 'utf8');
  console.log(`Wrote ${outputPath} (${Object.keys(sortedPaths).length} path).`);
}
