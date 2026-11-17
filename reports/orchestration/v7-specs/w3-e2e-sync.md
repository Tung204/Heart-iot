# v7 W3 — đồng bộ E2E với giao diện mới

Bạn là worker **E2E sync**. Giao diện v7 đã thay toàn bộ presentation (shell, landing/auth, cảnh báo, sức khỏe, người thân, quản trị). 6 test Playwright còn bám DOM cũ nên fail; sản phẩm không sai, test cần cập nhật theo hợp đồng mới.

## Phạm vi file

Chỉ `apps/web/e2e/*.spec.ts` (+ helper trong `e2e/` nếu cần). **Không sửa** `src/`, CSS, API, contract. Nếu phát hiện lỗi sản phẩm thật, ghi vào handoff, không sửa.

## Việc

1. Chạy `pnpm --filter @heart-iot/web test:e2e`, ghi lại danh sách fail thật (hiện 6 fail/20 pass).
2. Với từng fail, đọc test + đọc DOM/route hiện tại (dev server tự bật 5173; mock API bằng `page.route`), cập nhật locator/chuỗi theo UI mới nhưng **giữ nguyên ý định kiểm**:
   - landing: H1 mới, header mới, CTA/ghi chú mới, trạng thái `/me` chậm/lỗi;
   - `/app` Hôm nay: bỏ bối cảnh cũ, giữ kiểm cảnh báo độc lập + ô hỏi + thread;
   - lịch sử: selector bảng mới, giữ kiểm “không refetch sau 60 giây”;
   - cảnh báo/sức khỏe: heading/link mới, giữ kiểm cảnh báo mở và đường về.
   Không xoá test, không `skip`, không nới timeout để che fail, không đổi `retries`.
3. Nếu một assertion mô tả hành vi đã bị thay có chủ đích (ví dụ “Hồ sơ đang xem” hoặc nhãn cũ), đổi sang hành vi mới và ghi lý do trong comment ngay tại test.
4. Chạy lại toàn bộ E2E tới khi **tất cả pass**; ghi số test/pass/fail và thời gian thật.

## Cổng và bàn giao

- `pnpm --filter @heart-iot/web test:e2e` — dán output cuối.
- `pnpm --filter @heart-iot/web typecheck` (spec TS vẫn phải sạch).
- Commit nhỏ trên branch `v7-e2e`, không merge/push.
- `reports/handoffs/v7-e2e.md`: test nào đổi gì, lý do, bằng chứng chạy, phần chưa kiểm (Firefox/WebKit/CI), provider/model thật.
- Không tuyên bố “đạt”; chỉ nêu số liệu.
