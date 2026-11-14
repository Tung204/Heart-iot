import { Controller, Get, Param, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { idSchema, type UserSummary } from '@annhien/contracts';
import { CurrentUser } from '../auth/auth.decorators';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { AccessService } from '../access/access.service';
import { RealtimeService } from './realtime.service';

@Controller()
export class RealtimeController {
  constructor(
    private readonly realtime: RealtimeService,
    private readonly access: AccessService,
  ) {}

  @Get('subjects/:id/events')
  async events(
    @CurrentUser() user: UserSummary,
    @Param('id', new ZodValidationPipe(idSchema)) subjectId: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    // Kiểm quyền nhận cảnh báo trước khi mở stream; các vòng sau kiểm lại trong service.
    await this.access.requireAction(user.id, subjectId, 'receive_alerts');

    const headerCursor = req.header('last-event-id');
    const queryCursor = typeof req.query.cursor === 'string' ? req.query.cursor : undefined;
    const raw = headerCursor ?? queryCursor ?? '0';
    const cursor = /^\d{1,18}$/.test(raw) ? Number(raw) : 0;

    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('X-Accel-Buffering', 'no');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    await this.realtime.stream(user.id, subjectId, res, cursor);
  }
}
