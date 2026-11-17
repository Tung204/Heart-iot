import { runCli } from './app';
import { createConsoleIo } from './io';

/**
 * Entry của CLI. Logic nằm trong `app.ts` để test gọi trực tiếp `runCli`.
 * `tsx src/cli.ts <command> [options]`
 */
void runCli(process.argv.slice(2), process.env, createConsoleIo())
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error: unknown) => {
    process.stderr.write(
      `Lỗi không mong đợi: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  });
