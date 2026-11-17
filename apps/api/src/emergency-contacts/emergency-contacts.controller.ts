import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { idSchema, type UserSummary } from '@heart-iot/contracts';
import {
  emergencyContactUpdateSchema,
  type EmergencyContact,
  type EmergencyContactList,
  type EmergencyContactUpdate,
} from '@heart-iot/contracts/contacts';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { CurrentUser } from '../auth/auth.decorators';
import { EmergencyContactsService } from './emergency-contacts.service';

/**
 * Liên hệ khẩn cấp — `/subjects/:id/emergency-contacts`.
 * Đọc: chủ hồ sơ hoặc caregiver có `canReceiveAlerts`; ghi: chỉ chủ hồ sơ.
 * 204 cho DELETE, 201 cho POST theo mặc định của Nest.
 */
@Controller()
export class EmergencyContactsController {
  constructor(private readonly service: EmergencyContactsService) {}

  @Get('subjects/:id/emergency-contacts')
  list(
    @CurrentUser() user: UserSummary,
    @Param('id', new ZodValidationPipe(idSchema)) subjectId: string,
  ): Promise<EmergencyContactList> {
    return this.service.list(user, subjectId);
  }

  @Post('subjects/:id/emergency-contacts')
  create(
    @CurrentUser() user: UserSummary,
    @Param('id', new ZodValidationPipe(idSchema)) subjectId: string,
    @Body(new ZodValidationPipe(emergencyContactUpdateSchema)) body: EmergencyContactUpdate,
  ): Promise<EmergencyContact> {
    return this.service.create(user, subjectId, body);
  }

  @Patch('subjects/:id/emergency-contacts/:contactId')
  update(
    @CurrentUser() user: UserSummary,
    @Param('id', new ZodValidationPipe(idSchema)) subjectId: string,
    @Param('contactId', new ZodValidationPipe(idSchema)) contactId: string,
    @Body(new ZodValidationPipe(emergencyContactUpdateSchema)) body: EmergencyContactUpdate,
  ): Promise<EmergencyContact> {
    return this.service.update(user, subjectId, contactId, body);
  }

  @Delete('subjects/:id/emergency-contacts/:contactId')
  @HttpCode(204)
  async remove(
    @CurrentUser() user: UserSummary,
    @Param('id', new ZodValidationPipe(idSchema)) subjectId: string,
    @Param('contactId', new ZodValidationPipe(idSchema)) contactId: string,
  ): Promise<void> {
    await this.service.remove(user, subjectId, contactId);
  }
}
