import { Body, Controller, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { idSchema, type UserSummary } from '@heart-iot/contracts';
import {
  archiveSubjectSchema,
  createSubjectSchema,
  deletionRequestSchema,
  updateSubjectSchema,
  type ArchiveSubjectInput,
  type CreateSubjectInput,
  type DeletionRequestInput,
  type UpdateSubjectInput,
} from '@heart-iot/contracts/subjects';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { CurrentUser } from '../auth/auth.decorators';
import { SubjectsService } from './subjects.service';

@Controller('subjects')
export class SubjectsController {
  constructor(private readonly service: SubjectsService) {}

  @Get()
  list(@CurrentUser() user: UserSummary) {
    return this.service.list(user);
  }

  @Post()
  create(
    @CurrentUser() user: UserSummary,
    @Body(new ZodValidationPipe(createSubjectSchema)) body: CreateSubjectInput,
  ) {
    return this.service.create(user, body);
  }

  @Get(':id')
  get(@CurrentUser() user: UserSummary, @Param('id', new ZodValidationPipe(idSchema)) id: string) {
    return this.service.get(user, id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: UserSummary,
    @Param('id', new ZodValidationPipe(idSchema)) id: string,
    @Body(new ZodValidationPipe(updateSubjectSchema)) body: UpdateSubjectInput,
  ) {
    return this.service.update(user, id, body);
  }

  /** POST /subjects/:id/archive — chỉ chủ hồ sơ; 204, không xóa dữ liệu. */
  @Post(':id/archive')
  @HttpCode(204)
  archive(
    @CurrentUser() user: UserSummary,
    @Param('id', new ZodValidationPipe(idSchema)) id: string,
    @Body(new ZodValidationPipe(archiveSubjectSchema)) body: ArchiveSubjectInput,
  ) {
    return this.service.archive(user, id, body);
  }

  /**
   * POST /subjects/:id/deletion-requests — chỉ chủ hồ sơ; 202 ghi nhận thủ công.
   * Không xóa dữ liệu; response `note` nói rõ điều đó.
   */
  @Post(':id/deletion-requests')
  @HttpCode(202)
  requestDeletion(
    @CurrentUser() user: UserSummary,
    @Param('id', new ZodValidationPipe(idSchema)) id: string,
    @Body(new ZodValidationPipe(deletionRequestSchema)) body: DeletionRequestInput,
  ) {
    return this.service.recordDeletionRequest(user, id, body);
  }
}
