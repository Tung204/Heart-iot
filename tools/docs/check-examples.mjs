#!/usr/bin/env node
/**
 * Kiểm mọi payload mẫu trong packages/contracts/examples bằng zod schema đang thực thi.
 *
 * Chạy sau khi build contracts:
 *   pnpm build:contracts && node tools/docs/check-examples.mjs
 *
 * Mỗi file mẫu phải có ánh xạ schema tương ứng; thêm file mới mà quên khai báo sẽ fail,
 * để mẫu tài liệu không lặng lẽ lệch khỏi hợp đồng.
 */
import { readdirSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const examplesDir = path.join(root, 'packages/contracts/examples');
const distDir = path.join(root, 'packages/contracts/dist');

const SCHEMAS = {
  'telemetry.v1.json': { module: 'telemetry.js', exportName: 'telemetryEnvelopeSchema' },
  'fall-confirmed.v1.json': { module: 'telemetry.js', exportName: 'incidentEnvelopeSchema' },
  'event-ack.v1.json': { module: 'telemetry.js', exportName: 'ingestAckSchema' },
  'event-ack-quarantined.v1.json': { module: 'telemetry.js', exportName: 'ingestAckSchema' },
  'insights.v1.json': { module: 'insights.js', exportName: 'insightsResponseSchema' },
};

function fail(message) {
  console.error(message);
  process.exitCode = 1;
}

if (!existsSync(distDir)) {
  console.error(
    'Missing packages/contracts/dist. Run `pnpm build:contracts` before node tools/docs/check-examples.mjs.',
  );
  process.exit(2);
}

const files = readdirSync(examplesDir)
  .filter((name) => name.endsWith('.json'))
  .sort();

const declared = Object.keys(SCHEMAS);
for (const name of files) {
  if (!declared.includes(name)) {
    fail(`✗ ${name}: chưa khai báo schema trong tools/docs/check-examples.mjs.`);
  }
}
for (const name of declared) {
  if (!files.includes(name)) {
    fail(`✗ ${name}: đã khai báo schema nhưng file mẫu không tồn tại.`);
  }
}

const schemaCache = new Map();
async function loadSchema({ module, exportName }) {
  if (!schemaCache.has(module)) {
    schemaCache.set(module, await import(pathToFileURL(path.join(distDir, module)).href));
  }
  const schema = schemaCache.get(module)[exportName];
  if (!schema?.safeParse) {
    throw new Error(`Không tìm thấy ${exportName} trong packages/contracts/dist/${module}.`);
  }
  return schema;
}

let checked = 0;
for (const name of files) {
  const mapping = SCHEMAS[name];
  if (!mapping) continue;

  const filePath = path.join(examplesDir, name);
  let payload;
  try {
    payload = JSON.parse(await readFile(filePath, 'utf8'));
  } catch (error) {
    fail(`✗ ${name}: JSON không hợp lệ — ${error.message}`);
    continue;
  }

  const schema = await loadSchema(mapping);
  const result = schema.safeParse(payload);
  if (result.success) {
    console.log(`✓ ${name} (${mapping.exportName})`);
    checked += 1;
    continue;
  }

  const issues = result.error.issues
    .map((issue) => `${issue.path.length ? issue.path.join('.') : '<root>'}: ${issue.message}`)
    .join('; ');
  fail(`✗ ${name} (${mapping.exportName}): ${issues}`);
}

if (process.exitCode) {
  console.error(`\nPayload mẫu không khớp schema. Sửa file mẫu hoặc cập nhật schema/hợp đồng có chủ đích.`);
  process.exit(process.exitCode);
}

console.log(`\nĐã parse ${checked}/${files.length} payload mẫu bằng schema tương ứng.`);
