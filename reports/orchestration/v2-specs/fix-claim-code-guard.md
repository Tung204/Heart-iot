# Fix worker — claim code không dùng cho thiết bị đang gán

Bạn là worker sửa lỗi trên worktree riêng. Đọc `AGENTS.md`, `reports/qa/v2-rev-features.md` P2-2, `docs/04`, code devices/admin devices/UI.

Chỉ sửa: `apps/api/src/devices/devices.service.ts` (issueClaimCode/release), `apps/api/src/admin/**` nếu cần, `apps/api/test/devices.spec.ts`/`admin.spec.ts`, `apps/web/src/features/admin/AdminDevicesTab.tsx` + test/css. Không sửa router/contracts/schema/other features.

Yêu cầu:
- Admin `issueClaimCode` cho thiết bị **đang có assignment mở** → 409 mã lỗi rõ (ví dụ `DEVICE_ALREADY_ASSIGNED`), message “Thiết bị đang gắn hồ sơ; hãy gỡ trước khi tạo mã”. Không tạo/không ghi đè code cũ.
- `releaseDevice` phải vô hiệu hóa claim code cũ (claimCodeHash/expiresAt = null) để code không dùng lại được; nếu release xong tạo code mới thì dùng được.
- UI: nút “Tạo mã gắn thiết bị” disabled khi `assignedSubjectId != null`, kèm hint/lý do; không chỉ disabled im lặng. Sau release refresh danh sách; test.
- Test API: assigned → 409, không đổi hash; release → code cũ claim 422/404; code mới claim 201; race hai issue? giữ an toàn.
- Chạy devices/admin spec + web test/typecheck; handoff `reports/handoffs/v2-fix-claim-code-guard.md`; commit nhánh riêng.
