import { z } from 'zod';
import { idSchema, isoDateTimeSchema } from './core';

/**
 * Hợp đồng thiết bị — wave 1 be-data.
 * - deviceKey và claimCode chỉ trả về một lần duy nhất tại thời điểm tạo/đổi;
 *   server chỉ lưu sha256.
 * - claim code 9 ký tự thuộc bảng A-Z2-9 (không dùng 0/1, bỏ I/O để dễ đọc),
 *   hết hạn sau 15 phút.
 */

export const serialSchema = z
  .string()
  .min(3)
  .max(64)
  .regex(/^[A-Za-z0-9._-]+$/, 'serial chỉ gồm chữ cái, số và dấu . _ -');

export const deviceLabelSchema = z.string().trim().min(1).max(80);

export const createDeviceSchema = z
  .object({
    serial: serialSchema,
    label: deviceLabelSchema,
  })
  .strict();
export type CreateDeviceInput = z.infer<typeof createDeviceSchema>;

/** Tóm tắt thiết bị cho màn hình quản trị; không chứa khóa/mã xác nhận. */
export const deviceAdminSummarySchema = z.object({
  id: idSchema,
  serial: z.string(),
  label: z.string(),
  status: z.string().min(1).max(32),
  firmwareVersion: z.string().max(64).nullable(),
  lastSeenAt: isoDateTimeSchema.nullable(),
  createdAt: isoDateTimeSchema,
  assignedSubjectId: idSchema.nullable(),
});
export type DeviceAdminSummary = z.infer<typeof deviceAdminSummarySchema>;

/** Trả một lần duy nhất sau khi admin tạo thiết bị. */
export const deviceCreatedSchema = z.object({
  device: deviceAdminSummarySchema,
  deviceKey: z.string().min(16),
  claimCode: z.string().min(6).max(64),
  claimCodeExpiresAt: isoDateTimeSchema,
});
export type DeviceCreated = z.infer<typeof deviceCreatedSchema>;

export const claimDeviceSchema = z
  .object({
    claimCode: z.string().min(6).max(128),
  })
  .strict();
export type ClaimDeviceInput = z.infer<typeof claimDeviceSchema>;

export const claimResultSchema = z.object({
  device: deviceAdminSummarySchema,
  assignmentId: idSchema,
  subjectId: idSchema,
});
export type ClaimResult = z.infer<typeof claimResultSchema>;

export const releaseDeviceSchema = z
  .object({
    reason: z.string().max(300).optional(),
  })
  .strict();
export type ReleaseDeviceInput = z.infer<typeof releaseDeviceSchema>;

export const rotateDeviceKeySchema = z.object({
  deviceKey: z.string().min(16),
});
export type RotateDeviceKeyResult = z.infer<typeof rotateDeviceKeySchema>;

export const newClaimCodeResponseSchema = z.object({
  claimCode: z.string().min(6).max(64),
  expiresAt: isoDateTimeSchema,
});
export type NewClaimCodeResult = z.infer<typeof newClaimCodeResponseSchema>;

export const deviceListSchema = z.object({
  items: z.array(deviceAdminSummarySchema),
});
export type DeviceList = z.infer<typeof deviceListSchema>;

export const releaseResultSchema = z.object({
  assignmentId: idSchema,
  deviceId: idSchema,
  subjectId: idSchema,
  endedAt: isoDateTimeSchema,
});
export type ReleaseResult = z.infer<typeof releaseResultSchema>;
