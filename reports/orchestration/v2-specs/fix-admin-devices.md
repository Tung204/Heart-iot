# Fix worker — tab Thiết bị trong Admin

Bạn là worker sửa lỗi trên worktree riêng. Đọc `AGENTS.md`, báo cáo `reports/qa/v2-product-gaps.md` P1-5, `docs/02` FR-11, `docs/06` màn hình Admin, code `apps/web/src/features/admin/AdminPage.tsx` và API devices/admin + contract devices.

Chỉ sửa: `apps/web/src/features/admin/AdminPage.tsx`, `apps/web/src/features/admin/api.ts` (hoặc file client admin hiện có), `AdminPage.test.tsx`, css feature admin nếu cần; có thể thêm component trong `apps/web/src/features/admin/`. Không sửa backend/app.module/router/layout.css/contracts; API đã có. Chạy install + contracts build; test admin + typecheck.

Yêu cầu:
- Thêm tab **Thiết bị** vào Admin (giữ 4 tab cũ), tải `GET /admin/devices`; hiển thị serial, nhãn, trạng thái, hồ sơ đang gắn (nếu API có), firmware, lần thấy cuối/freshness, pin; **không hiển thị nhịp tim hay dữ liệu sức khỏe**.
- Nút tạo claim code và rotate key dùng endpoint admin; hiển thị mã/key **một lần** trong vùng rõ ràng, nút copy có phản hồi, cảnh báo không chia sẻ; xác nhận trước rotate.
- Trạng thái tải/lỗi/rỗng; danh sách dài không vỡ layout; bàn phím/aria; 360/390/chữ lớn.
- Không tự đổi tab mặc định/route; giữ test cũ xanh, thêm test tab + gọi API + hiển thị claim code + lỗi.
- Handoff `reports/handoffs/v2-fix-admin-devices.md`; commit nhánh riêng. Báo commit hash, test counts, rủi ro.
