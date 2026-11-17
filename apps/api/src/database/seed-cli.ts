import { loadEnv } from '../config/env';
import { createDatabase } from './database';
import { DEMO, seedDemo } from './seed';

async function main(): Promise<void> {
  const handle = await createDatabase(loadEnv());
  const summary = await seedDemo(handle.db);
  console.log('Đã seed dữ liệu demo tổng hợp (chạy lại không nhân bản):');
  console.log(JSON.stringify(summary, null, 2));
  console.log('\nTài khoản demo:');
  console.log(`  Chủ hồ sơ: ${DEMO.owner.email} / ${DEMO.password}`);
  console.log(`  Người thân: ${DEMO.caregiver.email} / ${DEMO.password}`);
  console.log(`  Quản trị: ${DEMO.admin.email} / ${DEMO.adminPassword}`);
  console.log('\nThiết bị demo (dùng cho simulator):');
  console.log(`  HEART_IOT_DEVICE_ID=${DEMO.deviceId}`);
  console.log(`  HEART_IOT_DEVICE_KEY=${DEMO.deviceKey}`);
  console.log(`  Hồ sơ: ${DEMO.subjectAn.displayName} (${DEMO.subjectAn.id})`);
  await handle.close();
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
