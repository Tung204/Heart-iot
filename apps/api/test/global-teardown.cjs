'use strict';

const { rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');

/** Dọn thư mục tạm dùng cho PGlite/tiến trình test sau khi toàn bộ suite kết thúc. */
module.exports = () => {
  rmSync(join(tmpdir(), 'annhien-api-tests'), { recursive: true, force: true });
};
