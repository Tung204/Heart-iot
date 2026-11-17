# v7 W4 — review độc lập trên bản hợp nhất

Bạn là reviewer độc lập cuối của đợt xây lại giao diện v7. Bạn **không sửa sản phẩm**; chỉ kiểm bằng chứng và viết báo cáo. Không tin handoff, không tin test xanh.

## Bối cảnh

- Master đã hợp nhất: nền tảng (token/primitive/shell) + 5 lane P/C/H/R/A + E2E đồng bộ. Toàn bộ presentation cũ đã thay; logic/API/quyền giữ nguyên.
- Nguồn hợp đồng: `reports/orchestration/v7/design-system.md` §5 (từng màn), `reports/orchestration/v7/decisions.md`, `reports/orchestration/v7/migration-inventory.md` (chức năng phải giữ), `reports/qa/v6-review.md` (F01/F02).
- Đã biết và không cần phát hiện lại: breadcrumb của PageHeader hiện là link trực tiếp, không bọc `<nav aria-label="Đường dẫn">`; định dạng ngày giữa các khối chưa nhất quán; mũi tên “→” trong một số link hiển thị như gạch rời. Ghi nhận nếu ảnh hưởng thật, đừng coi là finding mới.

## Cách kiểm

1. `pnpm install` (nếu cần), chạy `pnpm --filter @heart-iot/web typecheck`, `exec vitest run --no-file-parallelism --maxWorkers=1`, `build`; ghi exit code + số test.
2. Dựng web ở cổng **4360** (`vite --port 4360`), API dev cổng **3010** với `WEB_ORIGIN=http://127.0.0.1:4360`, PGlite riêng trong worktree, seed local. Không dùng DB/API của phiên khác; không sửa API.
3. Chromium, ma trận tối thiểu:
   - 1280×900, 390×844, 360×740, 390×844 chữ lớn (Aa) cho: `/`, `/login`, `/register`, `/invite/<token 10 ký tự>`, `/app`, `/app/alerts`, `/app/alerts?view=notifications`, `/app/alerts/<id>`, `/app/overview`, `/app/history`, `/app/subjects`, `/app/subjects/<id>/share`, `/app/devices`, `/app/tasks`, `/app/settings`, `/app/admin?tab=overview|users|devices`, `/app/admin?tab=advanced&view=policy|audit`, `/app/studio`, `/app/studio/<id>`, `/app/studio/<id>/data`, 404.
   - Đo: `scrollWidth<=clientWidth`, số H1, số dòng context, `aria-current`, bbox mọi action đứng riêng (kể cả link phụ, `sm`, brand, select), contrast text/action/nav/focus, focus ring trên rail và nền sáng, reduced-motion.
4. Kiểm hành vi thật (không chỉ ảnh):
   - ack cảnh báo 2 bước + 409 khi version lệch; inbox mark-read rồi reload còn đúng; banner thông báo mới mở đúng incident;
   - share: người thân không gọi API owner-only; devices claim chỉ owner; tasks đóng có lý do; admin non-admin 0 request admin; Studio publish chặn digest, data không nhãn “Dữ liệu thật”;
   - invite 422 hiển thị lỗi dữ liệu, không phải lỗi kết nối; đổi hồ sơ xoá thread/số liệu cũ.
5. Đọc source khi cần để xác nhận nguyên nhân; dẫn `file:dòng`.

## Đầu ra

Chỉ `reports/qa/v7-w4-review.md`:

- Bảng **lời khai/thiết kế → cách kiểm → kết quả thật**; tách “đã kiểm lại” / “không kiểm được”.
- Finding P1/P2/P3: route+viewport, repro, mong đợi (dẫn design-system), thực tế, ảnh/metric. Không quota; không suy đoán thành finding nếu chưa tái hiện (ghi “nghi ngờ”).
- Kết luận **đóng W2/W3 được hay chưa**, kèm danh sách điều kiện tối đa 6 mục.
- Ghi rõ phần không kiểm (Firefox/WebKit, screen reader thật, dữ liệu đo thật, CI).
- Ảnh lưu `reports/qa/evidence/v7-w4/`; commit báo cáo + ảnh trên branch riêng; không merge/push; `worker_done` với tóm tắt thật + provider/model.

Viết báo cáo tăng dần (sau mỗi nhóm route cập nhật file) để không mất kết quả nếu phiên dừng.
