import { z } from 'zod';
import { carePermissionsSchema, idSchema, isoDateTimeSchema, subjectRoleSchema } from './core';

/** Tạo hồ sơ người được theo dõi. `timezone` mặc định Asia/Ho_Chi_Minh, phải là tên IANA hợp lệ. */
export const createSubjectSchema = z
  .object({
    displayName: z.string().trim().min(1).max(120),
    timezone: z.string().min(1).max(64).default('Asia/Ho_Chi_Minh'),
  })
  .strict();
export type CreateSubjectInput = z.infer<typeof createSubjectSchema>;

/** Cập nhật hồ sơ: chỉ chủ hồ sơ; ít nhất một trường. */
export const updateSubjectSchema = z
  .object({
    displayName: z.string().trim().min(1).max(120).optional(),
    timezone: z.string().min(1).max(64).optional(),
  })
  .strict()
  .refine((value) => value.displayName !== undefined || value.timezone !== undefined, {
    message: 'Cần ít nhất một trường để cập nhật.',
  });
export type UpdateSubjectInput = z.infer<typeof updateSubjectSchema>;

/** Hồ sơ trong danh sách: vai trò và quyền theo từng người xem. */
export const subjectSummarySchema = z.object({
  id: idSchema,
  ownerUserId: idSchema,
  displayName: z.string().min(1).max(120),
  timezone: z.string().min(1).max(64),
  role: subjectRoleSchema,
  permissions: carePermissionsSchema,
  sharedFrom: isoDateTimeSchema.nullable(),
  createdAt: isoDateTimeSchema,
});
export type SubjectSummary = z.infer<typeof subjectSummarySchema>;

export const subjectListSchema = z.object({ items: z.array(subjectSummarySchema) });
export type SubjectList = z.infer<typeof subjectListSchema>;

/** Chi tiết hồ sơ: thêm mốc lưu trữ (null khi đang hoạt động). */
export const subjectDetailSchema = subjectSummarySchema.extend({
  archivedAt: isoDateTimeSchema.nullable(),
});
export type SubjectDetail = z.infer<typeof subjectDetailSchema>;
