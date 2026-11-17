# v7 W2 — lane R: người thân, thiết bị, công việc, cài đặt

Đọc `w2-common.md` trước. Cổng riêng: port **4354**.

## File được ghi

`features/subjects/{SubjectsPage.tsx,SubjectsPage.test.tsx,api.ts,subjects.css}`, `features/share/*`, `features/contacts/*` (trừ hai export frozen), `features/devices/*`, `features/tasks/*`, `features/settings/*`, `styles/people.css`.

## Việc phải làm

1. **Subjects**: tạo/sửa; archive không xoá + revoke share; deletion chỉ `recorded`; role owner; **tách `archiveSubject`/`requestSubjectDeletion` từ page sang `subjects/api.ts`** + test payload/semantics trước khi thay JSX (W0 R3).
2. **Share**: xác minh owner **trước** khi GET invitations/care-links; token một lần; cờ quyền độc lập; contacts 5/primary/`tel:`; copy rõ “ai thấy gì”.
3. **Devices**: metadata/redaction; claim/release chỉ owner (thêm gate); freshness live/stale/offline/never; claim ≠ online.
4. **Tasks**: thêm lối vào theo ngữ cảnh (từ Hôm nay hoặc Cài đặt — chọn một, ghi lý do; không thành mục nav thứ năm); giữ account-wide, owner tạo, owner/admin đóng, 409, task admin `subjectId=null`.
5. **Settings**: tên/mật khẩu; session hiện tại không revoke; revoke từng/all-others hai bước; 401/refresh.
6. Không đổi API ngoài việc tách hàm; không thêm quyền mới.

## Giao diện

`design-system.md` §5.8–5.11. Danh sách người thân dạng hàng, trạng thái chia sẻ bằng chữ; form tạo hồ sơ một cột, lỗi cạnh field; xác nhận nguy hiểm nêu đúng tên đối tượng + Huỷ.

## Ảnh + đo

`/app/subjects`, `/app/subjects/<id>/share`, `/app/devices`, `/app/tasks`, `/app/settings` × 4 viewport. Đo: 1 H1, 1 context line ở trang subject-scoped, target ≥44, share không gọi API khi non-owner (kiểm network), xác nhận huỷ được bằng Escape.
