import { Body, Controller, Delete, Get, HttpCode, Param, Post } from '@nestjs/common';
import { idSchema, type UserSummary } from '@annhien/contracts';
import {
  createInvitationSchema,
  invitationTokenSchema,
  type CreateInvitationInput,
} from '@annhien/contracts/care';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { CurrentUser, Public } from '../auth/auth.decorators';
import { CareService } from './care.service';

@Controller()
export class CareController {
  constructor(private readonly service: CareService) {}

  @Post('subjects/:id/invitations')
  createInvitation(
    @CurrentUser() user: UserSummary,
    @Param('id', new ZodValidationPipe(idSchema)) subjectId: string,
    @Body(new ZodValidationPipe(createInvitationSchema)) body: CreateInvitationInput,
  ) {
    return this.service.createInvitation(user, subjectId, body);
  }

  @Get('subjects/:id/invitations')
  listInvitations(
    @CurrentUser() user: UserSummary,
    @Param('id', new ZodValidationPipe(idSchema)) subjectId: string,
  ) {
    return this.service.listInvitations(user, subjectId);
  }

  @Public()
  @Get('invitations/:token')
  getPublicInvitation(@Param('token', new ZodValidationPipe(invitationTokenSchema)) token: string) {
    return this.service.getPublicInvitation(token);
  }

  @Post('invitations/:token/accept')
  acceptInvitation(
    @CurrentUser() user: UserSummary,
    @Param('token', new ZodValidationPipe(invitationTokenSchema)) token: string,
  ) {
    return this.service.acceptInvitation(user, token);
  }

  @Get('subjects/:id/care-links')
  listCareLinks(
    @CurrentUser() user: UserSummary,
    @Param('id', new ZodValidationPipe(idSchema)) subjectId: string,
  ) {
    return this.service.listCareLinks(user, subjectId);
  }

  @Delete('subjects/:id/care-links/:linkId')
  @HttpCode(204)
  async revokeCareLink(
    @CurrentUser() user: UserSummary,
    @Param('id', new ZodValidationPipe(idSchema)) subjectId: string,
    @Param('linkId', new ZodValidationPipe(idSchema)) linkId: string,
  ): Promise<void> {
    await this.service.revokeCareLink(user, subjectId, linkId);
  }
}
