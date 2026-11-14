import { loadEnv } from '../config/env';
import { createDatabase } from './database';

async function main(): Promise<void> {
  const handle = await createDatabase(loadEnv());
  console.log(`Đã áp migration cho ${handle.kind}.`);
  await handle.close();
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
