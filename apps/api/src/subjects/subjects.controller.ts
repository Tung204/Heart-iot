import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { idSchema, type UserSummary } from '@annhien/contracts';
import {
  createSubjectSchema,
  updateSubjectSchema,
  type CreateSubjectInput,
  type UpdateSubjectInput,
} from '@annhien/contracts/subjects';
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
}
