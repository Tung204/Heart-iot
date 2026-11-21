import { Module } from '@nestjs/common';
import { RetentionService } from './retention.service';

/**
 * Retention dữ liệu theo tuổi — mặc định tắt, cấu hình qua RETENTION_*.
 * Không thay quy trình xóa toàn bộ hồ sơ/backup; xem docs/14 mục V12.
 */
@Module({
  providers: [RetentionService],
  exports: [RetentionService],
})
export class RetentionModule {}
