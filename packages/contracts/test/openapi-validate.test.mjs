import assert from 'node:assert/strict';
import { test } from 'node:test';
import { collectOpenApiErrors } from '../scripts/openapi-validate.mjs';

/**
 * Test cho validator nội bộ. Mục đích là bắt lỗi soạn artifact, không chứng
 * minh tài liệu đúng đặc tả OpenAPI đầy đủ hay khớp runtime.
 */

function baseDocument() {
  return {
    openapi: '3.1.0',
    info: { title: 'Test', version: '1.0.0' },
    tags: [{ name: 'Test', description: 'Nhóm test' }],
    paths: {
      '/health': {
        get: {
          tags: ['Test'],
          operationId: 'getHealth',
          summary: 'Kiểm tra',
          responses: {
            200: {
              description: 'Thành công',
              content: { 'application/json': { schema: { type: 'object' } } },
            },
          },
        },
      },
    },
    components: {
      securitySchemes: {
        sessionCookie: { type: 'apiKey', in: 'cookie', name: 'an_session' },
      },
      schemas: {},
    },
  };
}

test('tài liệu tối thiểu hợp lệ', () => {
  assert.deepEqual(collectOpenApiErrors(baseDocument()), []);
});

test('phát hiện operationId trùng', () => {
  const doc = baseDocument();
  doc.paths['/ready'] = {
    get: {
      tags: ['Test'],
      operationId: 'getHealth',
      summary: 'Trùng id',
      responses: { 200: { description: 'ok', content: { 'application/json': { schema: {} } } } },
    },
  };
  assert.match(collectOpenApiErrors(doc).join('\n'), /operationId trùng getHealth/);
});

test('phát hiện tag chưa khai báo', () => {
  const doc = baseDocument();
  doc.paths['/health'].get.tags = ['Missing'];
  assert.match(collectOpenApiErrors(doc).join('\n'), /tag chưa khai báo: Missing/);
});

test('phát hiện thiếu khai báo path parameter', () => {
  const doc = baseDocument();
  doc.paths = {
    '/subjects/{id}': {
      get: {
        tags: ['Test'],
        operationId: 'getSubject',
        summary: 'Thiếu param',
        responses: { 200: { description: 'ok', content: { 'application/json': { schema: {} } } } },
      },
    },
  };
  assert.match(collectOpenApiErrors(doc).join('\n'), /thiếu khai báo path parameter id/);
});

test('path parameter phải required=true', () => {
  const doc = baseDocument();
  doc.paths = {
    '/subjects/{id}': {
      get: {
        tags: ['Test'],
        operationId: 'getSubject',
        summary: 'Sai required',
        parameters: [{ name: 'id', in: 'path', required: false, schema: { type: 'string' } }],
        responses: { 200: { description: 'ok', content: { 'application/json': { schema: {} } } } },
      },
    },
  };
  assert.match(collectOpenApiErrors(doc).join('\n'), /phải required=true/);
});

test('response 2xx không phải 204 phải có content', () => {
  const doc = baseDocument();
  delete doc.paths['/health'].get.responses[200].content;
  assert.match(collectOpenApiErrors(doc).join('\n'), /response 200 thiếu content/);
});

test('204 không được có content', () => {
  const doc = baseDocument();
  doc.paths['/health'].get.responses[204] = {
    description: 'Không nội dung',
    content: { 'application/json': { schema: {} } },
  };
  assert.match(collectOpenApiErrors(doc).join('\n'), /204 không được có content/);
});

test('phát hiện security scheme lạ', () => {
  const doc = baseDocument();
  doc.paths['/health'].get.security = [{ unknownScheme: [] }];
  assert.match(collectOpenApiErrors(doc).join('\n'), /security scheme chưa khai báo/);
});

test('phát hiện ref không tồn tại', () => {
  const doc = baseDocument();
  doc.paths['/health'].get.responses[200].content['application/json'].schema = {
    $ref: '#/components/schemas/Missing',
  };
  assert.match(collectOpenApiErrors(doc).join('\n'), /ref không tồn tại/);
});

test('phát hiện parameter trùng', () => {
  const doc = baseDocument();
  doc.paths['/health'].get.parameters = [
    { name: 'cursor', in: 'query', schema: { type: 'string' } },
    { name: 'cursor', in: 'query', schema: { type: 'string' } },
  ];
  assert.match(collectOpenApiErrors(doc).join('\n'), /parameter trùng query:cursor/);
});
