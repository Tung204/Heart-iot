import { Body, Controller, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { idSchema, type UserSummary } from '@heart-iot/contracts';
import {
  claimDeviceSchema,
  claimResultSchema,
  createDeviceSchema,
  deviceCreatedSchema,
  deviceListSchema,
  newClaimCodeResponseSchema,
  releaseDeviceSchema,
  releaseResultSchema,
  rotateDeviceKeySchema,
  type ClaimDeviceInput,
  type CreateDeviceInput,
  type ReleaseDeviceInput,
} from '@heart-iot/contracts/devices';
import {
  subjectDevicesResponseSchema,
  subjectStatusResponseSchema,
} from '@heart-iot/contracts/measurements';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { SessionGuard } from '../auth/session.guard';
import { CurrentUser } from '../auth/auth.decorators';
import { DevicesService } from './devices.service';

const idPipe = new ZodValidationPipe(idSchema);

@Controller('admin/devices')
@UseGuards(SessionGuard)
export class AdminDevicesController {
  constructor(private readonly devices: DevicesService) {}

  @Post()
  async create(
    @CurrentUser() user: UserSummary,
    @Body(new ZodValidationPipe(createDeviceSchema)) body: CreateDeviceInput,
  ) {
    const result = await this.devices.createDevice(user, body);
    return deviceCreatedSchema.parse({
      device: result.device,
      deviceKey: result.deviceKey,
      claimCode: result.claimCode,
      claimCodeExpiresAt: result.claimCodeExpiresAt.toISOString(),
    });
  }

  @Get()
  async list(@CurrentUser() user: UserSummary) {
    return deviceListSchema.parse(await this.devices.listAdminDevices(user));
  }

  @Post(':id/claim-code')
  async issueClaimCode(
    @CurrentUser() user: UserSummary,
    @Param('id', idPipe) deviceId: string,
  ) {
    return newClaimCodeResponseSchema.parse(await this.devices.issueClaimCode(user, deviceId));
  }

  @Post(':id/rotate-key')
  @HttpCode(200)
  async rotateKey(@CurrentUser() user: UserSummary, @Param('id', idPipe) deviceId: string) {
    return rotateDeviceKeySchema.parse(await this.devices.rotateDeviceKey(user, deviceId));
  }
}

@Controller()
@UseGuards(SessionGuard)
export class SubjectDevicesController {
  constructor(private readonly devices: DevicesService) {}

  @Post('subjects/:id/devices/claim')
  async claim(
    @CurrentUser() user: UserSummary,
    @Param('id', idPipe) subjectId: string,
    @Body(new ZodValidationPipe(claimDeviceSchema)) body: ClaimDeviceInput,
  ) {
    const result = await this.devices.claimDevice(user, subjectId, body.claimCode);
    return claimResultSchema.parse(result);
  }

  @Get('subjects/:id/devices')
  async list(@CurrentUser() user: UserSummary, @Param('id', idPipe) subjectId: string) {
    return subjectDevicesResponseSchema.parse({
      items: await this.devices.listSubjectDevices(user, subjectId),
    });
  }

  @Get('subjects/:id/status')
  async status(@CurrentUser() user: UserSummary, @Param('id', idPipe) subjectId: string) {
    return subjectStatusResponseSchema.parse(await this.devices.getSubjectStatus(user, subjectId));
  }

  @Post('devices/:id/release')
  @HttpCode(200)
  async release(
    @CurrentUser() user: UserSummary,
    @Param('id', idPipe) deviceId: string,
    @Body(new ZodValidationPipe(releaseDeviceSchema)) body: ReleaseDeviceInput,
  ) {
    const result = await this.devices.releaseDevice(user, deviceId, body.reason);
    return releaseResultSchema.parse(result);
  }
}
