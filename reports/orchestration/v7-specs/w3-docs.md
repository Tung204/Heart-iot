# v7 W3 — cập nhật tài liệu theo giao diện và repo mới

Bạn là worker **D (docs)**. Giao diện đã được xây lại (v7) và repo đổi tên **Heart-iot**; tài liệu còn mô tả giao diện cũ và trạng thái v4. Nhiệm vụ: cập nhật tài liệu cho đúng hiện trạng, không thêm tính năng chưa có.

## Phạm vi

Chỉ sửa: `docs/06-trai-nghiem-va-man-hinh.md`, `docs/14-ke-hoach-trien-khai-phan-mem.md`, `docs/08-kiem-thu-va-danh-gia.md` (phần số liệu/kiểm thử), `README.md`, và `docs/` khác nếu có câu mô tả nav/màn hình đã sai. **Không** sửa `apps/`, `packages/`, `tools/`, `reports/`. Không sửa `docs/html/index.html` bằng tay — sinh lại bằng script.

## Việc

1. Đọc `docs/06` toàn bộ + `README.md` + `docs/14` §11–12 + `docs/08`. Đối chiếu với source thật: `apps/web/src/app/router.tsx`, `routeScope.ts`, `AppShell.tsx`, các page trong `features/*`, và ảnh bằng chứng `reports/qa/evidence/v7-*/`.
2. Sửa `docs/06`:
   - nav đúng **4 mục** Hôm nay/Cảnh báo/Sức khỏe/Người thân; xoá mọi mô tả “Thêm”, “5 mục”, “menu phụ”, “badge chưa đọc” (badge là **cảnh báo đang mở**, có `20+` khi còn cursor);
   - mô tả màn mới: trang công khai/auth/invite/404, Hôm nay, Cảnh báo + hộp thông báo (`?view=notifications`), chi tiết cảnh báo, Sức khỏe, Lịch sử, Người thân, Chia sẻ/liên hệ, Thiết bị, Công việc, Tài khoản/phiên, Quản trị 5 mục, Studio (deep link), 404 trong `/app`;
   - mỗi màn một mục đích, không disclaimer lặp; ghi rõ dữ liệu mô phỏng ở đâu;
   - mô tả shell: rail desktop, topbar + thanh dưới mobile, context hồ sơ một dòng trên H1 ở 5 trang, menu tài khoản ở avatar, không link Studio trong menu.
3. Sửa `README.md`: trạng thái hiện tại là **v7** (giao diện xây lại), không còn “v4”; giữ nguyên các giới hạn thật (chưa firmware, chưa đo độ chính xác ngã, chưa Web Push, chưa CI, chưa xoá cứng dữ liệu).
4. Cập nhật số liệu kiểm thử **bằng cách tự chạy**, không chép từ handoff:
   - `pnpm --filter @heart-iot/web exec vitest run --no-file-parallelism --maxWorkers=1` → số file/test;
   - `pnpm --filter @heart-iot/web test:e2e` → số test pass;
   - `pnpm --filter @heart-iot/api test` và `tools/simulator npm test` nếu bạn muốn ghi đủ bộ (không bắt buộc nếu thời gian).
   Ghi ngày chạy và đúng con số; không suy ra “đạt” cho phần chưa chạy.
5. `docs/14`: thêm mục ngắn về v7 (phạm vi, bằng chứng, việc còn mở) và sửa câu còn nói nav cũ; giữ các mục lịch sử trước đó, không viết lại quá khứ.
6. Chạy `tools/docs/.venv/Scripts/python.exe tools/docs/build.py` rồi `--check`; `node tools/docs/check-examples.mjs`. Dán kết quả.

## Cổng và bàn giao

- Không còn chuỗi “An Nhiên”/`annhien` trong tài liệu bạn sửa.
- Liên kết nội bộ đúng; không bịa API/số liệu.
- Commit trên branch `v7-docs`, không merge/push.
- `reports/handoffs/v7-docs.md`: file đổi, số liệu tự chạy, phần chưa cập nhật, provider/model thật.
