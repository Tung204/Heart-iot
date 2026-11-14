import { createParamDecorator, SetMetadata, type ExecutionContext } from '@nestjs/common';
import type { UserSummary } from '@annhien/contracts';

export const IS_PUBLIC_KEY = 'isPublic';

/** Đánh dấu endpoint không cần phiên đăng nhập (đăng ký, đăng nhập, health, xem lời mời). */
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(IS_PUBLIC_KEY, true);

export type RequestUser = UserSummary;

export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): UserSummary => {
  const request = ctx.switchToHttp().getRequest<{ user?: UserSummary }>();
  if (!request.user) {
    throw new Error('CurrentUser chỉ dùng trên route đã qua SessionGuard');
  }
  return request.user;
});
