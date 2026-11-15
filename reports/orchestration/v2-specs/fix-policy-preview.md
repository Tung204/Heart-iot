# Fix worker — preview policy phải ràng buộc nội dung publish

Bạn là worker sửa lỗi trên worktree riêng. Đọc `AGENTS.md`, báo cáo `reports/qa/v2-admin-ops.md` P1-3, `docs/11` mục preview/publish, `docs/13`, `packages/contracts/src/admin.ts`, API admin policy + UI AdminPage.

Chỉ sửa: `packages/contracts/src/admin.ts`, `apps/api/src/admin/admin.service.ts`/`admin.controller.ts`, `apps/api/test/admin.spec.ts`; `apps/web/src/features/admin/AdminPage.tsx` + test admin (chỉ phần policy); css admin nếu cần. **Không** sửa tab Thiết bị (worker khác đang làm) hay app.module/router/layout.css. Nếu conflict AdminPage, giữ thay đổi cả hai phần và ghi rõ. Cài dependency/build contracts; test admin + typecheck.

Yêu cầu:
- Preview endpoint trả thêm `digest` (sha256 ổn định của value đã chuẩn hóa + expectedVersion), không lộ secret.
- Publish body bắt buộc `previewDigest`; server tính lại digest từ value gửi lên + expectedVersion, nếu thiếu/khác → 409 kèm thông điệp “nội dung đã thay đổi, xem lại preview”; không ghi policy.
- UI: sửa bất kỳ field nào sau preview → xóa preview + digest, disable Phát hành; publish chỉ bật khi có preview đúng value hiện tại; sau 409 hiển thị rõ, giữ form, cho phép preview lại; publish thành công reset.
- Audit publish/conflict không chứa giá trị nhạy cảm ngoài policy vốn công khai; test digest mismatch, publish không preview, preview cũ + value mới, happy path.
- Giữ test policy cũ; cập nhật test nếu contract đổi (không nới assertion).
- Handoff `reports/handoffs/v2-fix-policy-preview.md`; commit nhánh riêng. Báo commit hash, test counts, file lead cần nối/conflict.
