'use strict';

/**
 * Stub dotenv cho test: không đọc bất kỳ file `.env` nào, kể cả khi repo/cwd có
 * file thật. Test hermetic tự đặt biến môi trường trong `setup-test-env.ts`.
 */
module.exports = {
  config: () => ({ parsed: {}, error: undefined }),
  parse: () => ({}),
};
