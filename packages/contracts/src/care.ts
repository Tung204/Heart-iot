import { z } from 'zod';
import { carePermissionsSchema, idSchema, isoDateTimeSchema, userSummarySchema } from './core';

/** Token lời mời dạng base64url; chỉ trả một lần khi tạo lời mời. */
export const invitationTokenSchema = z.string().min(20).max(256);
export type InvitationToken = z.infer<typeof invitationTokenSchema>;

/** Tạo lời mời chia sẻ: chỉ chủ hồ sơ. */
export const createInvitationSchema = z
  .object({
    email: z.email(),
    permissions: carePermissionsSchema,
    expiresInHours: z.int().min(1).max(720).default(72),
  })
  .strict();
export type CreateInvitationInput = z.infer<typeof createInvitationSchema>;

export const invitationStatusSchema = z.enum(['pending', 'accepted', 'expired', 'revoked']);
export type InvitationStatus = z.infer<typeof invitationStatusSchema>;

/**
 * Lời mời cho chủ hồ sơ quản lý. Email đầy đủ chỉ trả cho owner;
 * preview công khai dùng `publicInvitationSchema` (không có email).
 */
export const invitationSummarySchema = z.object({
  id: idSchema,
  subjectId: idSchema,
  email: z.email(),
  permissions: carePermissionsSchema,
  status: invitationStatusSchema,
  createdAt: isoDateTimeSchema,
  expiresAt: isoDateTimeSchema,
  acceptedAt: isoDateTimeSchema.nullable(),
  revokedAt: isoDateTimeSchema.nullable(),
});
export type InvitationSummary = z.infer<typeof invitationSummarySchema>;

export const invitationListSchema = z.object({ items: z.array(invitationSummarySchema) });
export type InvitationList = z.infer<typeof invitationListSchema>;

/** Kết quả tạo lời mời: `token` chỉ trả đúng một lần ở đây. */
export const invitationCreatedSchema = z.object({
  invitation: invitationSummarySchema,
  token: invitationTokenSchema,
  acceptUrl: z.string().min(1),
});
export type InvitationCreated = z.infer<typeof invitationCreatedSchema>;

/**
 * Preview công khai của lời mời: không có email người được mời,
 * không có dữ liệu sức khỏe. Chỉ trả khi lời mời còn pending.
 */
export const publicInvitationSchema = z.object({
  subjectName: z.string().min(1).max(120),
  inviterName: z.string().min(1).max(120),
  permissions: carePermissionsSchema,
  expiresAt: isoDateTimeSchema,
  status: z.literal('pending'),
});
export type PublicInvitation = z.infer<typeof publicInvitationSchema>;

/** Liên kết chăm sóc (active hoặc revoked) cho chủ hồ sơ quản lý. */
export const careLinkSummarySchema = z.object({
  id: idSchema,
  subjectId: idSchema,
  caregiver: userSummarySchema,
  permissions: carePermissionsSchema,
  status: z.enum(['active', 'revoked']),
  sharedFrom: isoDateTimeSchema,
  acceptedAt: isoDateTimeSchema.nullable(),
  revokedAt: isoDateTimeSchema.nullable(),
});
export type CareLinkSummary = z.infer<typeof careLinkSummarySchema>;

export const careLinkListSchema = z.object({ items: z.array(careLinkSummarySchema) });
export type CareLinkList = z.infer<typeof careLinkListSchema>;
