import { Body, Controller, Get, HttpCode, Param, Post, Query, UseGuards } from '@nestjs/common';
import { idSchema, type UserSummary } from '@annhien/contracts';
import {
  closeTaskSchema,
  createTaskSchema,
  maintenanceTaskQuerySchema,
  type CloseTask,
  type CreateTaskInput,
  type MaintenanceTaskQuery,
} from '@annhien/contracts/tasks';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { CurrentUser } from '../auth/auth.decorators';
import { SessionGuard } from '../auth/session.guard';
import { MaintenanceService } from './maintenance.service';

const idPipe = new ZodValidationPipe(idSchema);

/**
 * Công việc bảo trì: xem danh sách theo quyền hồ sơ (chủ hồ sơ/caregiver có
 * canReceiveAlerts; admin chỉ thấy task không gắn hồ sơ), chủ hồ sơ tạo việc
 * thủ công cho thiết bị đang gắn, và đóng task (chủ hồ sơ hoặc admin).
 */
@Controller('maintenance-tasks')
@UseGuards(SessionGuard)
export class MaintenanceController {
  constructor(private readonly maintenance: MaintenanceService) {}

  @Get()
  list(
    @CurrentUser() user: UserSummary,
    @Query(new ZodValidationPipe(maintenanceTaskQuerySchema)) query: MaintenanceTaskQuery,
  ) {
    return this.maintenance.listTasks(user, query);
  }

  /** Chỉ chủ hồ sơ; thiết bị phải đang gắn với hồ sơ. Trả 201 + task summary. */
  @Post()
  create(
    @CurrentUser() user: UserSummary,
    @Body(new ZodValidationPipe(createTaskSchema)) body: CreateTaskInput,
  ) {
    return this.maintenance.createTask(user, body);
  }

  @Post(':id/close')
  @HttpCode(200)
  close(
    @CurrentUser() user: UserSummary,
    @Param('id', idPipe) taskId: string,
    @Body(new ZodValidationPipe(closeTaskSchema)) body: CloseTask,
  ) {
    return this.maintenance.closeTask(user, taskId, body);
  }
}
