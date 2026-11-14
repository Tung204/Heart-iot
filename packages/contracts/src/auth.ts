import { z } from 'zod';
import { idSchema, isoDateTimeSchema, userSummarySchema } from './core';

export const registerSchema = z
  .object({
    email: z.email().max(254),
    password: z.string().min(10).max(200),
    displayName: z.string().trim().min(1).max(120),
  })
  .strict();
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z
  .object({
    email: z.email().max(254),
    password: z.string().min(1).max(200),
  })
  .strict();
export type LoginInput = z.infer<typeof loginSchema>;

export const authSessionSchema = z.object({
  user: userSummarySchema,
  sessionExpiresAt: isoDateTimeSchema,
});
export type AuthSession = z.infer<typeof authSessionSchema>;

export const meSchema = z.object({
  user: userSummarySchema,
});
export type Me = z.infer<typeof meSchema>;

export const updateProfileSchema = z
  .object({
    displayName: z.string().trim().min(1).max(120),
  })
  .strict();
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1).max(200),
    newPassword: z.string().min(10).max(200),
  })
  .strict();
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

export const sessionSummarySchema = z.object({
  id: idSchema,
  createdAt: isoDateTimeSchema,
  expiresAt: isoDateTimeSchema,
  current: z.boolean(),
});
export type SessionSummary = z.infer<typeof sessionSummarySchema>;

export const sessionListSchema = z.object({
  items: z.array(sessionSummarySchema),
});
export type SessionList = z.infer<typeof sessionListSchema>;
