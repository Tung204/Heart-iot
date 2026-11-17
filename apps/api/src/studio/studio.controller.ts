import { Body, Controller, Get, HttpCode, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { idSchema, type UserSummary } from '@heart-iot/contracts';
import {
  createViewSchema,
  previewRequestSchema,
  previewResultSchema,
  publicationListSchema,
  publishResultSchema,
  publishViewSchema,
  rollbackResultSchema,
  rollbackViewSchema,
  updateDraftSchema,
  viewDataQuerySchema,
  viewDataSchema,
  viewListSchema,
  viewSummarySchema,
  type CreateViewInput,
  type PreviewRequestInput,
  type PublishViewInput,
  type RollbackViewInput,
  type UpdateDraftInput,
  type ViewDataQuery,
} from '@heart-iot/contracts/studio';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { CurrentUser } from '../auth/auth.decorators';
import { SessionGuard } from '../auth/session.guard';
import { StudioService } from './studio.service';

const idPipe = new ZodValidationPipe(idSchema);

/**
 * Studio workspace views (wave 2): draft → preview (chỉ đọc) → publish → rollback.
 * Mọi response parse qua zod để lệch hợp đồng lộ ra ngay ở test.
 */
@Controller('workspace-views')
@UseGuards(SessionGuard)
export class StudioController {
  constructor(private readonly service: StudioService) {}

  @Get()
  async list(@CurrentUser() user: UserSummary) {
    const result = await this.service.list(user);
    return viewListSchema.parse(result);
  }

  @Post()
  @HttpCode(201)
  async create(
    @CurrentUser() user: UserSummary,
    @Body(new ZodValidationPipe(createViewSchema)) body: CreateViewInput,
  ) {
    const result = await this.service.create(user, body);
    return viewSummarySchema.parse(result);
  }

  @Get(':id')
  async get(@CurrentUser() user: UserSummary, @Param('id', idPipe) id: string) {
    const result = await this.service.get(user, id);
    return viewSummarySchema.parse(result);
  }

  @Put(':id/draft')
  async updateDraft(
    @CurrentUser() user: UserSummary,
    @Param('id', idPipe) id: string,
    @Body(new ZodValidationPipe(updateDraftSchema)) body: UpdateDraftInput,
  ) {
    const result = await this.service.updateDraft(user, id, body);
    return viewSummarySchema.parse(result);
  }

  @Post(':id/previews')
  @HttpCode(200)
  async preview(
    @CurrentUser() user: UserSummary,
    @Param('id', idPipe) id: string,
    @Body(new ZodValidationPipe(previewRequestSchema)) body: PreviewRequestInput,
  ) {
    const result = await this.service.preview(user, id, body);
    return previewResultSchema.parse(result);
  }

  @Post(':id/publications')
  @HttpCode(201)
  async publish(
    @CurrentUser() user: UserSummary,
    @Param('id', idPipe) id: string,
    @Body(new ZodValidationPipe(publishViewSchema)) body: PublishViewInput,
  ) {
    const result = await this.service.publish(user, id, body);
    return publishResultSchema.parse(result);
  }

  @Post(':id/rollback')
  @HttpCode(201)
  async rollback(
    @CurrentUser() user: UserSummary,
    @Param('id', idPipe) id: string,
    @Body(new ZodValidationPipe(rollbackViewSchema)) body: RollbackViewInput,
  ) {
    const result = await this.service.rollback(user, id, body);
    return rollbackResultSchema.parse(result);
  }

  @Get(':id/publications')
  async listPublications(@CurrentUser() user: UserSummary, @Param('id', idPipe) id: string) {
    const result = await this.service.listPublications(user, id);
    return publicationListSchema.parse(result);
  }

  @Get(':id/data')
  async data(
    @CurrentUser() user: UserSummary,
    @Param('id', idPipe) id: string,
    @Query(new ZodValidationPipe(viewDataQuerySchema)) query: ViewDataQuery,
  ) {
    const result = await this.service.data(user, id, query);
    return viewDataSchema.parse(result);
  }
}
