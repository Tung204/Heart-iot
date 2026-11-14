import { Body, Controller, Get, HttpCode, Param, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { idSchema, type UserSummary } from '@annhien/contracts';
import {
  adminUserQuerySchema,
  auditQuerySchema,
  policyPreviewRequestSchema,
  policyPublishRequestSchema,
  updateUserStatusSchema,
  type AdminUserQuery,
  type AuditQuery,
  type PolicyPreviewRequest,
  type PolicyPublishRequest,
  type UpdateUserStatus,
} from '@annhien/contracts/admin';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { CurrentUser } from '../auth/auth.decorators';
import { SessionGuard } from '../auth/session.guard';
import { AdminService } from './admin.service';
import { z } from 'zod';

const idPipe = new ZodValidationPipe(idSchema);
const policyKeyPipe = new ZodValidationPipe(z.string().trim().min(1).max(80));

/**
 * Admin (wave 3 be-admin): quản lý tài khoản, audit, policy động, tổng quan.
 * Mọi endpoint kiểm `requireAdmin` trong service — không có route nào bỏ qua.
 */
@Controller('admin')
@UseGuards(SessionGuard)
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('users')
  listUsers(
    @CurrentUser() user: UserSummary,
    @Query(new ZodValidationPipe(adminUserQuerySchema)) query: AdminUserQuery,
  ) {
    return this.admin.listUsers(user, query);
  }

  @Patch('users/:id/status')
  @HttpCode(200)
  updateUserStatus(
    @CurrentUser() user: UserSummary,
    @Param('id', idPipe) targetId: string,
    @Body(new ZodValidationPipe(updateUserStatusSchema)) body: UpdateUserStatus,
  ) {
    return this.admin.updateUserStatus(user, targetId, body);
  }

  @Get('audit')
  listAudit(
    @CurrentUser() user: UserSummary,
    @Query(new ZodValidationPipe(auditQuerySchema)) query: AuditQuery,
  ) {
    return this.admin.listAudit(user, query);
  }

  @Get('policies/:key')
  getPolicy(@CurrentUser() user: UserSummary, @Param('key', policyKeyPipe) key: string) {
    return this.admin.getPolicy(user, key);
  }

  @Post('policies/:key/previews')
  @HttpCode(200)
  previewPolicy(
    @CurrentUser() user: UserSummary,
    @Param('key', policyKeyPipe) key: string,
    @Body(new ZodValidationPipe(policyPreviewRequestSchema)) body: PolicyPreviewRequest,
  ) {
    return this.admin.previewPolicy(user, key, body);
  }

  @Put('policies/:key')
  @HttpCode(200)
  publishPolicy(
    @CurrentUser() user: UserSummary,
    @Param('key', policyKeyPipe) key: string,
    @Body(new ZodValidationPipe(policyPublishRequestSchema)) body: PolicyPublishRequest,
  ) {
    return this.admin.publishPolicy(user, key, body);
  }

  @Get('overview')
  getOverview(@CurrentUser() user: UserSummary) {
    return this.admin.getOverview(user);
  }
}
