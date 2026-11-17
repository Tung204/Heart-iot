# v7 W2 — lane A: quản trị và Studio

Đọc `w2-common.md` trước. Cổng riêng: port **4355**.

## File được ghi

`features/admin/*` (+ test), `features/studio/*` (+ test), `styles/admin.css`, `styles/studio.css`.

## Việc phải làm

1. **Admin**: non-admin không gọi API admin; đúng 5 mục Tổng quan/Người dùng/Thiết bị/Chính sách/Nhật ký; **URL canonical giữ cũ**: `?tab=advanced&view=policy|audit` cho Chính sách/Nhật ký, reload/back giữ tab; users lock; devices secret một lần; policy preview/digest/CAS; audit filter.
2. **Studio**: list/create scope; draft→preview→publish/rollback CAS; data chỉ publication active; sample ≠ publication; quyền owner/global admin; deep link `/app/studio` (không thêm link menu — D7).
3. **Nhãn dữ liệu**: `Dữ liệu hồ sơ` + `Dữ liệu mô phỏng` khi synthetic; **không** “Dữ liệu thật”; preview phân biệt mẫu/mô phỏng (D9); cập nhật `StudioViewDataPage.test.tsx` kèm test diff.
4. Không đổi contract/API; không thêm quyền; giữ mọi mutation hiện có.

## Giao diện

`design-system.md` §5.12–5.13. Bảng dữ liệu đọc được ở 360px (không tràn ngang — dùng cột ưu tiên/chi tiết mở rộng), trạng thái publish rõ bằng chữ + thời gian, form policy theo section, không jargon.

## Ảnh + đo

`/app/admin?tab=overview`, `?tab=users`, `?tab=devices`, `?tab=advanced&view=policy`, `?tab=advanced&view=au
`?tab=advanced&view=audit`, `/app/studio`, `/app/studio/<id>`, `/app/studio/<id>/data` × 1280/390/360. Đo: không tràn ngang ở bảng, target ≥44, tab active, nhãn “Dữ liệu thật” = 0 lần, reload giữ URL.
