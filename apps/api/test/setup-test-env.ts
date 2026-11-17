import { prepareHermeticTestEnv } from './test-env';

// Chạy trước mọi import module ứng dụng để loadEnv không bao giờ thấy cấu hình thật.
prepareHermeticTestEnv();
