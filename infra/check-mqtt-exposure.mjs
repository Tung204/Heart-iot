#!/usr/bin/env node
/**
 * Kiểm tĩnh bề mặt MQTT: cấu hình broker và compose không được mở MQTT ẩn danh ra ngoài.
 *
 *   node infra/check-mqtt-exposure.mjs
 *
 * Kiểm tra (thất bại = exit 1):
 *   - mosquitto.conf không có `allow_anonymous true`, phải có `allow_anonymous false`.
 *   - mọi `listener` bind loopback (127.0.0.1/::1), không bind 0.0.0.0.
 *   - có `password_file` (hoặc `require_certificate true`) và `acl_file`.
 *   - compose: service mosquitto chỉ chạy trong profile `mqtt-experimental`.
 *   - compose: không service nào publish cổng container 1883 ra ngoài loopback.
 *   - file mật khẩu `infra/mosquitto/passwd` không bị Git track (khi có git).
 *
 * Đây là kiểm regex trên file cấu hình, không thay việc chạy broker thật. Nó không
 * chứng minh MQTT đã hoạt động, chỉ chặn cấu hình mở/ẩn danh quay lại.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const infraDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(infraDir, '..');
const brokerDir = path.join(infraDir, 'mosquitto');
const composePath = path.join(infraDir, 'compose.yaml');

const LOOPBACK = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);
const results = [];

function check(label, passed, detail = '') {
  results.push({ label, passed, detail });
}

function readText(filePath) {
  return readFileSync(filePath, 'utf8');
}

/** Bỏ comment và dòng trống, trả về { line, source } với số dòng gốc. */
function directiveLines(text) {
  return text
    .split(/\r?\n/)
    .map((line, index) => ({ line: line.trim(), number: index + 1 }))
    .filter(({ line }) => line !== '' && !line.startsWith('#'));
}

// --- 1) Cấu hình broker ----------------------------------------------------

const confFiles = readdirSync(brokerDir).filter((name) => name.endsWith('.conf'));
if (confFiles.length === 0) {
  check('có file cấu hình broker trong infra/mosquitto', false, 'không tìm thấy *.conf');
}

for (const name of confFiles) {
  const relative = path.posix.join('infra/mosquitto', name);
  const directives = directiveLines(readText(path.join(brokerDir, name)));

  const anonymousTrue = directives.filter(({ line }) => /^allow_anonymous\s+true\b/i.test(line));
  check(
    `${relative}: không có "allow_anonymous true"`,
    anonymousTrue.length === 0,
    anonymousTrue.map(({ number }) => `dòng ${number}`).join(', '),
  );

  const anonymousFalse = directives.some(({ line }) => /^allow_anonymous\s+false\b/i.test(line));
  check(`${relative}: khai báo "allow_anonymous false"`, anonymousFalse);

  const listeners = directives
    .filter(({ line }) => /^listener\s+\S+/i.test(line))
    .map(({ line, number }) => {
      const [, port, host] = /^listener\s+(\S+)(?:\s+(\S+))?/i.exec(line) ?? [];
      return { port, host, number };
    });
  check(`${relative}: có ít nhất một listener`, listeners.length > 0);
  for (const listener of listeners) {
    check(
      `${relative}: listener cổng ${listener.port} bind loopback`,
      listener.host !== undefined && LOOPBACK.has(listener.host),
      listener.host === undefined
        ? `dòng ${listener.number} không khai báo host (mặc định 0.0.0.0)`
        : `dòng ${listener.number} host=${listener.host}`,
    );
  }

  const passwordFile = directives.some(({ line }) => /^password_file\s+\S+/i.test(line));
  const mtls = directives.some(({ line }) => /^require_certificate\s+true\b/i.test(line));
  check(
    `${relative}: xác thực client (password_file hoặc require_certificate true)`,
    passwordFile || mtls,
  );

  const aclFile = directives.some(({ line }) => /^acl_file\s+\S+/i.test(line));
  check(`${relative}: có acl_file theo device_id`, aclFile);
}

const aclPath = path.join(brokerDir, 'acl');
if (existsSync(aclPath)) {
  const acl = readText(aclPath);
  check('infra/mosquitto/acl: có pattern theo %u (device_id)', /^\s*pattern\s+\w+\s+\S*%u/m.test(acl));
} else {
  check('infra/mosquitto/acl tồn tại', false);
}

// --- 2) Compose -----------------------------------------------------------

const compose = readText(composePath);

/** Tách block `services:` thành { tên service -> các dòng con }. */
function serviceBlocks(text) {
  const blocks = new Map();
  let inServices = false;
  let current = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/\s+#.*$/, '');
    if (line.trim() === '' || line.trim().startsWith('#')) {
      if (current) current.lines.push('');
      continue;
    }
    if (!/^\s/.test(line)) {
      inServices = /^services:\s*$/.test(line);
      current = null;
      continue;
    }
    if (!inServices) continue;
    const service = /^ {2}([A-Za-z0-9_.-]+):\s*$/.exec(line);
    if (service) {
      current = { name: service[1], lines: [] };
      blocks.set(current.name, current);
      continue;
    }
    if (current) current.lines.push(line);
  }
  return blocks;
}

/** Trả về các cổng publish dạng `host:container` trong một service. */
function publishedPorts(lines) {
  const specs = [];
  const portsIndex = lines.findIndex((line) => /^\s{4}ports:/.test(line));
  if (portsIndex === -1) return specs;
  const portsLine = lines[portsIndex];
  const inline = /ports:\s*\[(.*)\]/.exec(portsLine);
  if (inline) {
    specs.push(...inline[1].split(',').map((item) => item.trim()).filter(Boolean));
    return specs;
  }
  for (const line of lines.slice(portsIndex + 1)) {
    if (line.trim() === '' || line.trim().startsWith('#')) continue;
    if (!/^\s{6,}-/.test(line)) break;
    const match = /^\s*-\s*(.+)$/.exec(line);
    if (match) specs.push(match[1].trim());
  }
  return specs;
}

/** Tách theo ':' nhưng giữ nguyên phần trong ${...} (biến compose có thể chứa ':'). */
function splitOutsideBraces(spec) {
  const parts = [];
  let current = '';
  let depth = 0;
  for (let i = 0; i < spec.length; i += 1) {
    const char = spec[i];
    if (char === '$' && spec[i + 1] === '{') {
      depth += 1;
      current += '${';
      i += 1;
      continue;
    }
    if (char === '}' && depth > 0) {
      depth -= 1;
      current += char;
      continue;
    }
    if (char === ':' && depth === 0) {
      parts.push(current);
      current = '';
      continue;
    }
    current += char;
  }
  parts.push(current);
  return parts;
}

function parsePort(spec) {
  const cleaned = spec.replace(/^["']|["']$/g, '').replace(/\/\w+$/, '');
  const parts = splitOutsideBraces(cleaned);
  if (parts.length === 1) return { hostIp: '', hostPort: null, containerPort: parts[0] };
  return {
    hostIp: parts.slice(0, -2).join(':') || '',
    hostPort: parts[parts.length - 2],
    containerPort: parts[parts.length - 1],
  };
}

const services = serviceBlocks(compose);
check('compose: có service mosquitto', services.has('mosquitto'));

const mosquitto = services.get('mosquitto');
if (mosquitto) {
  const text = mosquitto.lines.join('\n');
  const profiles = /profiles:\s*\[(.*?)\]/.exec(text)?.[1] ?? text;
  const inProfile = /mqtt-experimental/.test(profiles);
  check(
    'compose: mosquitto nằm trong profile "mqtt-experimental" (docker compose up mặc định không dựng)',
    inProfile,
  );
  check(
    'compose: mosquitto mount mosquitto.conf, acl và password_file',
    /mosquitto\.conf:\/mosquitto\/config\/mosquitto\.conf/.test(text) &&
      /acl:\/mosquitto\/config\/acl/.test(text) &&
      /passwd:\/mosquitto\/config\/passwd/.test(text),
  );
}

let exposed1883 = [];
let parsedSpecs = 0;
for (const [name, block] of services) {
  for (const spec of publishedPorts(block.lines)) {
    parsedSpecs += 1;
    const { hostIp, containerPort } = parsePort(spec);
    if (containerPort !== '1883') {
      if (spec.includes('1883')) {
        exposed1883.push(`${name}: ${spec} (cổng 1883 ở vị trí không kiểm được)`);
      }
      continue;
    }
    if (!LOOPBACK.has(hostIp)) exposed1883.push(`${name}: ${spec} (hostIp=${hostIp || 'tất cả'})`);
  }
}
check('compose: đọc được danh sách ports', parsedSpecs > 0, 'parser không thấy port nào');
check(
  'compose: mọi publish cổng container 1883 chỉ bind loopback',
  exposed1883.length === 0,
  exposed1883.join('; '),
);

// --- 3) Secret không vào Git ---------------------------------------------

const passwdTracked = spawnSync('git', ['ls-files', '--', 'infra/mosquitto/passwd'], {
  cwd: root,
  encoding: 'utf8',
});
if (passwdTracked.error || passwdTracked.status !== 0) {
  console.log('… bỏ qua kiểm Git: không chạy được git ls-files trong repo này.');
} else {
  check(
    'git: infra/mosquitto/passwd không được track',
    passwdTracked.stdout.trim() === '',
    passwdTracked.stdout.trim(),
  );
}

// --- Kết quả --------------------------------------------------------------

for (const { label, passed, detail } of results) {
  if (passed) {
    console.log(`✓ ${label}`);
  } else {
    console.error(`✗ ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

const failed = results.filter((result) => !result.passed);
if (failed.length > 0) {
  console.error(
    `\n${failed.length}/${results.length} kiểm tra thất bại. Không commit cấu hình MQTT mở/ẩn danh.`,
  );
  process.exit(1);
}

console.log(
  `\n${results.length}/${results.length} kiểm tra đạt. Lưu ý: đây là kiểm cấu hình tĩnh, không chứng minh broker đã chạy.`,
);
