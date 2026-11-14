import { Injectable, type ArgumentMetadata, type PipeTransform } from '@nestjs/common';
import type { ZodType } from 'zod';
import { zodDetails } from '@annhien/contracts';
import { AppError } from './app-error';

@Injectable()
export class ZodValidationPipe implements PipeTransform {
  constructor(private readonly schema: ZodType) {}

  transform(value: unknown, _metadata: ArgumentMetadata): unknown {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw AppError.validation('Dữ liệu gửi lên không hợp lệ.', zodDetails(result.error));
    }
    return result.data;
  }
}
