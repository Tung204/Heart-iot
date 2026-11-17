# v7 F1 gate — kiểm độc lập nền tảng trước khi merge

Bạn là reviewer độc lập. Không sửa code, không merge, không push. Mục tiêu: xác minh W1 foundation có thật sự đạt các cổng đã tuyên bố và đúng `design-system.md` §2–3, trước khi nhánh được merge làm nền cho 5 lane W2.

## Nguồn

- `reports/handoffs/v7-foundation.md` (lời khai cần kiểm)
- `reports/orchestration/v7/design-system.md` §1–§3.5
- `reports/orchestration/v7/decisions.md` (D1–D12)
- `reports/orchestration/v7-specs/w1-foundation.md` + phần “Điều chỉnh sau cổng W0”
- `reports/qa/v6-review.md` (F01/F02 không được tái phạm)
- Source + `reports/qa/evidence/v7-foundation/*`

## Phải kiểm bằng chứng thật

1. **Số liệu tự đo lại, không tin file**: chạy `pnpm --filter @annhien/web typecheck`, `exec vitest run --no-file-parallelism --maxWorkers=1`, `build`; ghi exit code + số test. Chạy dev server cổng **4360** với API `WEB_ORIGIN=http://127.0.0.1:4360`, PGlite cục bộ; dùng Playwright/Chromium tự đo lại tối thiểu: `/` 1280, `/login` 390, `/app` 1280+390, `/app/history` 390, `/app/devices` 390, `/app/alerts?view=notifications` 1280, `/app/admin` 390. Đo: `scrollWidth<=clientWidth`, H1 count, context line count, `aria-current`, bbox mọi action (kể cả link phụ/brand), focus ring, menu keyboard (Enter/Arrow/Escape/outside/focus-return), `/app/notifications` redirect.
2. **CSS**: `layout.css` còn selector foundation nào trùng `primitives.css`/`shell.css`/`base.css`? Import order đúng? `layout.css` còn 2536 dòng — block nào là foundation bị bỏ sót? `public-simple/app-simple/admin-simple` có định nghĩa lại foundation không? Kiểm bằng grep + đọc, không chỉ ledger.
3. **Design**: token màu/chữ/spacing/radius so với §2; shell rail/topbar/bottom-nav/menu/banner so với §3.1–3.5; đặc biệt: không còn nền kem/serif; brand trung tính; 4 mục + ngoại lệ admin; badge `20+` khi cursor (kiểm code); context line đúng 5 trang, trên H1, tên “Người được theo dõi”; banner ưu tiên quyền > mới > SSE, link đúng incident.
4. **Chức năng không mất**: router lazy/alias/404/guard; skip link; SSE banner; unread notifications; text-size; admin redirect. Đọc diff `a10c8ea..dd01cbe` tìm chỗ có thể làm mất hành vi (đặc biệt `AssistantPage` bị patch context + test C).
5. **Ảnh**: mở ít nhất 12 ảnh, đối chiếu mô tả handoff; nêu ảnh nào không chứng minh được điều đã khai.

## Đầu ra

Chỉ `reports/qa/v7-foundation-review.md`:

- Bảng **lời khai → cách kiểm → kết quả thật** (số/exit code/ảnh), tách rõ “đã kiểm lại” và “không kiểm được”.
- Finding P1/P2/P3 kèm route/viewport/repro/expected/actual, file:dòng khi là code. Không quota, không viết “đạt/pass/ổn”.
- Kết luận **merge được / chưa merge được** kèm điều kiện cụ thể (không phải lời khen).
- Ghi rõ phần không kiểm (ví dụ Firefox, zoom 200%, dữ liệu thật).

Không sửa file khác ngoài báo cáo; commit trên branch riêng; `worker_done` với tóm tắt thật + model/provider đã dùng.
