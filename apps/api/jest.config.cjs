/** @type {import('jest').Config} */
module.exports = {
  rootDir: '.',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/src/**/*.spec.ts', '<rootDir>/test/**/*.spec.ts'],
  setupFiles: ['<rootDir>/test/setup-test-env.ts'],
  globalTeardown: '<rootDir>/test/global-teardown.cjs',
  transform: {
    '^.+\\.ts$': [
      '@swc/jest',
      {
        jsc: {
          parser: { syntax: 'typescript', decorators: true },
          transform: { legacyDecorator: true, decoratorMetadata: true },
          target: 'es2022',
        },
        module: { type: 'commonjs' },
      },
    ],
  },
  moduleNameMapper: {
    // Test không đọc .env thật, kể cả khi repo có file .env của môi trường dev.
    '^dotenv$': '<rootDir>/test/stubs/dotenv.cjs',
    '^@heart-iot/contracts$': '<rootDir>/../../packages/contracts/src/core.ts',
    '^@heart-iot/contracts/(.*)$': '<rootDir>/../../packages/contracts/src/$1.ts',
  },
  testTimeout: 30000,
  verbose: true,
};
