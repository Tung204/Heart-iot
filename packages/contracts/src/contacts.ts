import { z } from 'zod';
import { idSchema, isoDateTimeSchema } from './core';

/**
 * Liên hệ khẩn cấp của hồ sơ — dữ liệu nhạy cảm.
 * Chủ hồ sơ quản lý; người thân chỉ đọc khi được chia sẻ quyền nhận cảnh báo.
 */
export const emergencyContactInputSchema = z
  .object({
    name: z.string().trim().min(2).max(80),
    relationship: z.string().trim().min(2).max(40),
    phone: z
      .string()
      .trim()
      .min(6)
      .max(24)
      .regex(/^[0-9+().\s-]+$/, 'Số điện thoại chỉ gồm số và ký tự + ( ) . -'),
    isPrimary: z.boolean().default(false),
  })
  .strict();
export type EmergencyContactInput = z.infer<typeof emergencyContactInputSchema>;

export const emergencyContactUpdateSchema = emergencyContactInputSchema;
export type EmergencyContactUpdate = z.infer<typeof emergencyContactUpdateSchema>;

export const emergencyContactSchema = z.object({
  id: idSchema,
  subjectId: idSchema,
  name: z.string(),
  relationship: z.string(),
  phone: z.string(),
  isPrimary: z.boolean(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});
export type EmergencyContact = z.infer<typeof emergencyContactSchema>;

export const emergencyContactListSchema = z.object({
  items: z.array(emergencyContactSchema).max(5),
});
export type EmergencyContactList = z.infer<typeof emergencyContactListSchema>;
