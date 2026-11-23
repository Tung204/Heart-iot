/**
 * Kiểm cấu trúc OpenAPI nội bộ — không thay validator độc lập (Redocly/Swagger).
 *
 * Mục tiêu là bắt lỗi soạn spec thủ công: operationId trùng, tag không khai báo,
 * path param thiếu, response 2xx thiếu nội dung, security scheme lạ hoặc ref gãy.
 * Không kiểm ngữ nghĩa nghiệp vụ hay schema JSON của từng trường.
 */

const HTTP_METHODS = new Set(['get', 'post', 'put', 'patch', 'delete']);
const REF_PREFIX = '#/components/schemas/';

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function collectRefs(value, refs) {
  if (Array.isArray(value)) {
    for (const item of value) collectRefs(item, refs);
  } else if (isObject(value)) {
    for (const [key, child] of Object.entries(value)) {
      if (key === '$ref' && typeof child === 'string') refs.push(child);
      else collectRefs(child, refs);
    }
  }
}

function pathPlaceholders(path) {
  return [...path.matchAll(/\{([^}]+)\}/g)].map((match) => match[1]);
}

function normalizePathTemplate(path) {
  return path.replace(/\{[^}]+\}/g, '{}');
}

function checkParameters({ path, label, parameters, errors }) {
  const list = parameters ?? [];
  if (!Array.isArray(list)) {
    errors.push(`${label}: parameters phải là mảng`);
    return;
  }
  const seen = new Set();
  const pathParams = new Set();
  for (const [index, param] of list.entries()) {
    if (!isObject(param)) {
      errors.push(`${label}: parameter[${index}] không phải object`);
      continue;
    }
    const name = param.name;
    const location = param.in;
    if (typeof name !== 'string' || name.length === 0) {
      errors.push(`${label}: parameter[${index}] thiếu name`);
      continue;
    }
    if (!['path', 'query', 'header', 'cookie'].includes(location)) {
      errors.push(`${label}: parameter ${name} có in không hợp lệ`);
    }
    const key = `${location}:${name}`;
    if (seen.has(key)) errors.push(`${label}: parameter trùng ${key}`);
    seen.add(key);
    if (!isObject(param.schema)) {
      errors.push(`${label}: parameter ${key} thiếu schema`);
    }
    if (location === 'path') {
      if (param.required !== true) errors.push(`${label}: path parameter ${name} phải required=true`);
      pathParams.add(name);
    }
  }
  const placeholders = new Set(pathPlaceholders(path));
  for (const name of placeholders) {
    if (!pathParams.has(name)) errors.push(`${label}: thiếu khai báo path parameter ${name}`);
  }
  for (const name of pathParams) {
    if (!placeholders.has(name)) errors.push(`${label}: path parameter ${name} không có trong path`);
  }
}

function checkSecurity({ document, operation, label, errors }) {
  if (operation.security === undefined) return;
  if (!Array.isArray(operation.security)) {
    errors.push(`${label}: security phải là mảng`);
    return;
  }
  const schemes = document.components?.securitySchemes ?? {};
  for (const requirement of operation.security) {
    if (!isObject(requirement)) {
      errors.push(`${label}: security requirement không phải object`);
      continue;
    }
    for (const scheme of Object.keys(requirement)) {
      if (!Object.prototype.hasOwnProperty.call(schemes, scheme)) {
        errors.push(`${label}: security scheme chưa khai báo: ${scheme}`);
      }
      if (!Array.isArray(requirement[scheme])) {
        errors.push(`${label}: security requirement ${scheme} phải là mảng scope`);
      }
    }
  }
}

/**
 * Trả danh sách lỗi; mảng rỗng nghĩa là tài liệu đạt các bất biến cấu trúc.
 * @param {unknown} document
 * @returns {string[]}
 */
export function collectOpenApiErrors(document) {
  const errors = [];
  if (!isObject(document)) return ['Tài liệu OpenAPI phải là object'];
  if (typeof document.openapi !== 'string' || !document.openapi.startsWith('3.1.')) {
    errors.push('openapi phải là phiên bản 3.1.x');
  }
  if (!isObject(document.paths)) errors.push('paths phải là object');
  if (!isObject(document.components)) errors.push('components phải là object');
  if (!isObject(document.components?.schemas)) errors.push('components.schemas phải là object');

  const tags = Array.isArray(document.tags) ? document.tags : [];
  const tagNames = new Set();
  for (const [index, tag] of tags.entries()) {
    if (!isObject(tag) || typeof tag.name !== 'string' || tag.name.length === 0) {
      errors.push(`tags[${index}] thiếu name`);
      continue;
    }
    if (tagNames.has(tag.name)) errors.push(`tag trùng: ${tag.name}`);
    tagNames.add(tag.name);
  }

  const securitySchemes = document.components?.securitySchemes;
  const sessionScheme = securitySchemes?.sessionCookie;
  if (!isObject(sessionScheme)) {
    errors.push('thiếu security scheme sessionCookie');
  } else if (
    sessionScheme.type !== 'apiKey' ||
    sessionScheme.in !== 'cookie' ||
    sessionScheme.name !== 'an_session'
  ) {
    errors.push('sessionCookie phải là apiKey trong cookie tên an_session');
  }

  const operationIds = new Set();
  const normalizedPaths = new Map();
  if (!isObject(document.paths)) return errors;

  for (const [path, pathItem] of Object.entries(document.paths)) {
    if (!path.startsWith('/')) errors.push(`path phải bắt đầu bằng /: ${path}`);
    if (normalizedPaths.has(normalizePathTemplate(path))) {
      errors.push(`path trùng mẫu với ${normalizedPaths.get(normalizePathTemplate(path))}: ${path}`);
    } else {
      normalizedPaths.set(normalizePathTemplate(path), path);
    }
    if (!isObject(pathItem)) {
      errors.push(`${path}: path item phải là object`);
      continue;
    }
    for (const [method, operation] of Object.entries(pathItem)) {
      if (!HTTP_METHODS.has(method)) continue;
      const label = `${method.toUpperCase()} ${path}`;
      if (!isObject(operation)) {
        errors.push(`${label}: operation phải là object`);
        continue;
      }
      if (typeof operation.operationId !== 'string' || operation.operationId.length === 0) {
        errors.push(`${label}: thiếu operationId`);
      } else if (operationIds.has(operation.operationId)) {
        errors.push(`${label}: operationId trùng ${operation.operationId}`);
      } else {
        operationIds.add(operation.operationId);
      }
      if (typeof operation.summary !== 'string' || operation.summary.length === 0) {
        errors.push(`${label}: thiếu summary`);
      }
      if (!Array.isArray(operation.tags) || operation.tags.length === 0) {
        errors.push(`${label}: thiếu tags`);
      } else {
        for (const tag of operation.tags) {
          if (!tagNames.has(tag)) errors.push(`${label}: tag chưa khai báo: ${tag}`);
        }
      }

      checkParameters({ path, label, parameters: operation.parameters, errors });
      checkSecurity({ document, operation, label, errors });

      if (operation.requestBody !== undefined) {
        if (!isObject(operation.requestBody)) {
          errors.push(`${label}: requestBody phải là object`);
        } else if (
          !isObject(operation.requestBody.content) ||
          Object.keys(operation.requestBody.content).length === 0
        ) {
          errors.push(`${label}: requestBody thiếu content`);
        }
      }

      if (!isObject(operation.responses) || Object.keys(operation.responses).length === 0) {
        errors.push(`${label}: thiếu responses`);
        continue;
      }
      const success = Object.entries(operation.responses).filter(([status]) => /^2\d\d$/.test(status));
      if (success.length === 0) errors.push(`${label}: thiếu response 2xx`);
      for (const [status, response] of Object.entries(operation.responses)) {
        if (!isObject(response)) {
          errors.push(`${label}: response ${status} phải là object`);
          continue;
        }
        if (typeof response.description !== 'string' || response.description.length === 0) {
          errors.push(`${label}: response ${status} thiếu description`);
        }
        if (/^2\d\d$/.test(status)) {
          const hasContent = isObject(response.content) && Object.keys(response.content).length > 0;
          if (status === '204' && hasContent) errors.push(`${label}: 204 không được có content`);
          if (status !== '204' && !hasContent) errors.push(`${label}: response ${status} thiếu content`);
        }
      }
    }
  }

  const refs = [];
  collectRefs(document, refs);
  const schemas = document.components?.schemas ?? {};
  const missing = [...new Set(refs)].filter(
    (value) =>
      !value.startsWith(REF_PREFIX) ||
      !Object.prototype.hasOwnProperty.call(schemas, value.slice(REF_PREFIX.length)),
  );
  if (missing.length > 0) errors.push(`ref không tồn tại: ${missing.join(', ')}`);

  return errors;
}

/** Ném lỗi gộp để script sinh/kiểm dừng ngay khi spec sai cấu trúc. */
export function assertValidOpenApi(document) {
  const errors = collectOpenApiErrors(document);
  if (errors.length > 0) {
    throw new Error(`OpenAPI không hợp lệ:\n- ${errors.join('\n- ')}`);
  }
}
