/**
 * Sinh OpenAPI 3.1 **một phần** cho nhóm quản trị và trợ lý từ schema Zod.
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
    title: 'Heart-IoT API — quản trị và trợ lý (một phần)',
    version: '1.0.0',
    description:
      'Artifact sinh từ schema Zod cho nhóm quản trị và FR-21. Không phải toàn bộ API; đặc tả nghiệp vụ đầy đủ ở docs/04. Cookie phiên dùng tên `an_session`.',
  },
  servers: [{ url: '/api/v1' }],
  tags: [
    { name: 'Admin', description: 'Quản trị kỹ thuật; không tự mở dữ liệu sức khỏe.' },
    { name: 'Assistant', description: 'Trợ lý chỉ tạo nháp; xác nhận mới ghi nghiệp vụ.' },
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
