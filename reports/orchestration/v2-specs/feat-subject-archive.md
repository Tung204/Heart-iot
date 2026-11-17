# Feature worker — lưu trữ hồ sơ và ghi nhận yêu cầu xóa dữ liệu

Bạn là feature worker trên worktree riêng. Đọc `AGENTS.md`, `reports/qa/v2-product-gaps.md` P1-6, `reports/qa/v2-privacy-ethics.md` P1-5, `docs/02` FR-14, `docs/03` archived_at, `docs/04` retention, code subjects.

Chỉ sửa: `packages/contracts/src/subjects.ts` (thêm schema), `apps/api/src/subjects/**`, `apps/api/test/subjects.spec.ts`, `apps/web/src/features/subjects/SubjectsPage.tsx` + test + css feature subjects. Không sửa schema/migration (archived_at có sẵn), app.module/router/AppShell/layout.css/docs. Cài install/build contracts; test subjects + typecheck web.

Yêu cầu:
- `POST /subjects/:id/archive` body `{reason: 3..500, confirmationName: string}` → 204: chỉ owner (caregiver 403/404? dùng 404 nếu không link, 403 nếu có link không owner); kiểm `confirmationName` khớp displayName (trim/case-insensitive) → 400; nếu đã archive → 409; set `archivedAt`, thu hồi care link active (revokedAt/status revoked, audit), audit `subject.archive` metadata reason; dữ liệu telemetry giữ nguyên (không xóa); sau archive, subject biến khỏi list/status/alerts/SSE của caregiver và owner (404/không list).
- `POST /subjects/:id/deletion-requests` body `{reason: 10..1000, confirmationName}` → 202 `{id,status:'recorded',recordedAt,note}`; chỉ owner; audit `subject.deletion_request` metadata reason/status, **không** xóa dữ liệu; trả note nói rõ đây là ghi nhận thủ công, dữ liệu chưa bị xóa. Không tạo bảng mới; id có thể audit id hoặc random UUID; contract response zod.
- Audit không chứa số đo/tên người khác; không log token.
- UI SubjectsPage: card action nguy hiểm nhưng không phá layout; form xác nhận gõ đúng tên + lý do; sau archive chuyển hồ sơ, invalidate, thông báo; form xóa nói rõ chưa xóa ngay và giới hạn demo; responsive/chữ lớn/bàn phím; không dùng window.confirm/prompt.
- Test API: owner archive, name mismatch, already archived, caregiver 403/404, hidden after, care link revoked, audit; deletion request no delete, validation, owner-only.
- UI test: mở form, validation, success, copy rõ ràng; không phá test cũ.
- Handoff `reports/handoffs/v2-feat-subject-archive.md`; commit nhánh riêng. Báo commit hash, test counts, giới hạn.
