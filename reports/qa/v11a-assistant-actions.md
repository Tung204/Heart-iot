# Trợ lý web — hành động có kiểm soát (FR-21 backend)

Ngày: **21/11/2026**. Phạm vi: backend, không sửa UI.

## Đã làm

- Contract `packages/contracts/src/assistant.ts`:
  - capability `care_reminder.create`; schema câu lệnh `from-text` và `update`;
  - catalog việc trợ lý **được/không được** làm;
  - trạng thái nháp `draft|confirmed|cancelled|expired`;
  - schema tạo/xem/xác nhận/hủy nháp.
- Bảng `assistant_drafts` + migration `0009_dapper_gladiator.sql`; payload nháp được validate lại khi xác nhận.
- API:
  - `GET /subjects/:id/assistant/capabilities`;
  - `POST /subjects/:id/assistant/drafts` (chỉ chủ hồ sơ, **không ghi** `care_reminders`);
  - `POST /subjects/:id/assistant/drafts/from-text` (parser rule-based cho câu đơn giản, không LLM);
  - `PATCH /assistant/drafts/:id` (sửa preview còn hạn trước confirm);
  - `GET /subjects/:id/assistant/drafts` (nháp còn hạn, owner-only);
  - `GET /assistant/drafts/:id`;
  - `POST /assistant/drafts/:id/confirm` (tạo lịch nhắc trong cùng transaction với cập nhật nháp);
  - `POST /assistant/drafts/:id/cancel`.
- Audit `assistant.draft.create|confirm|cancel`; metadata không chứa tiêu đề/ghi chú/liều thuốc.
- `RemindersService.createWithTx` dùng chung phần ghi lịch giữa API thường và xác nhận nháp.

## Ranh giới can thiệp

**Được:** tạo nháp lịch nhắc chăm sóc, để người dùng xem trước và xác nhận.

**Không được:** tự xác nhận/đóng/hủy cảnh báo, đổi cấu hình/ngưỡng thiết bị, cấp/thu quyền, xóa dữ liệu, chẩn đoán/kê đơn, tự gửi tin khẩn, điều khiển firmware. Catalog này được trả qua API để UI hiển thị; backend vẫn kiểm quyền ở từng endpoint.

Prompt summary/ask của trợ lý cũng được bổ sung quy tắc **không tự tạo/sửa/xóa** lịch nhắc, cảnh báo, công việc hay quyền; câu trả lời chat không thay cho preview/confirm.

**Đã có:** parser rule-based cho câu đơn giản (giờ, hằng ngày, thứ 2–6, “mai”), từ chối liều lượng/ngày kết thúc chưa hỗ trợ; mặc định cả tuần, dời sang mai nếu mọi giờ hôm nay đã qua. **Chưa có:** hiểu câu phức tạp/LLM, UI preview/xác nhận, công việc bảo trì, xuất phiếu.

## Kiểm chứng thật

| Lệnh/hạng mục | Kết quả |
| --- | --- |
| `backend/test/assistant-actions.spec.ts` | **8/8 test pass** |
| `backend/test/assistant-draft-parser.spec.ts` | **7/7 test pass** |
| Full API | **34 suite / 313 test pass** |
| Randomized seed `20261121` | **313/313 test pass** |
| `pnpm -r typecheck`, `nest build` | pass |
| Docs `--check` | khớp nguồn, **367 liên kết/296 ID/22 mục** |

Test kiểm: catalog owner/caregiver/outsider; tạo nháp không ghi lịch; xác nhận tạo đúng một lịch; xác nhận lặp không nhân đôi; caregiver 403/outsider 404; nháp hết hạn → 409 + `expired`; hủy/digest sai không tạo lịch; sửa nháp trước confirm dùng nội dung mới; danh sách chỉ trả nháp còn hạn; audit không chứa nội dung nháp. Parser kiểm giờ/ngày, hằng ngày, thứ 2–6, nhiều giờ, “mai”, giờ đã qua; từ chối liều/thiếu giờ/ngày không hỗ trợ.

## Giới hạn

- Đây là backend của FR-21, **chưa phải trợ lý hội thoại tự hiểu yêu cầu**. Parser chỉ là rule-based cho câu đơn giản, không gọi LLM và không hiểu câu phức tạp/ngày kết thúc.
- Chưa có UI preview/confirm; UI v10 vẫn đóng băng.
- Chưa có capability tạo công việc bảo trì/xuất phiếu. Retention cho nháp đã hết hạn có thể bật qua `RETENTION_ASSISTANT_DRAFT_DAYS` (mặc định tắt, xem `v12-retention.md`).
- Chưa kiểm PostgreSQL thật, tải đồng thời nhiều instance hay provider AI thật.
- Không thay đổi đường cảnh báo; trợ lý không có quyền ack/resolve/cancel.

## File chính

- `packages/contracts/src/assistant.ts`
- `backend/src/assistant/{assistant-actions.service,assistant-draft-parser,assistant.controller,assistant.module}.ts`
- `backend/src/reminders/reminders.service.ts`
- `backend/src/database/schema.ts`, `backend/drizzle/0009_dapper_gladiator.sql`
- `backend/test/assistant-actions.spec.ts`, `backend/test/assistant-draft-parser.spec.ts`
