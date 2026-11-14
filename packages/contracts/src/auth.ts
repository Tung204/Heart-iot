import { z } from 'zod';
import { isoDateTimeSchema, userSummarySchema } from './core';

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
