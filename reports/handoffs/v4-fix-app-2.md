# Handoff — fix app v4 vòng 2

- Base: `fix-v4-app` (`594ee28`), branch `fix-v4-app-2`, **không merge**.
- Worker `fix-v4-app-2` bị lead dừng sau khi đã sửa nhưng chưa kịp commit/handoff; lead chạy lại test/typecheck/build và commit phần đã sửa, không thêm code.
- Nguồn lỗi: `reports/qa/v4-rereview-app.md` (1 P1, 16 P2, 7 P3).

## Đã sửa trong diff

- **R-01 (P1):** tách `freshness='stale'` khỏi `offline`. Offline dùng `lastSeenAt`; stale dùng `lastMeasuredAt` và câu `Chưa có số đo mới · lần đo cuối …`; test stale/offline và nhiều thiết bị riêng.
- **R-09:** hộp xác nhận đăng xuất trên topbar mobile thành hàng full-width, không tràn 360/390, chữ/nút Hủy không bị cắt.
- **R-17:** nhãn nguồn mô phỏng trên Overview cho phép xuống dòng, hết tràn 44/14px ở chữ lớn.
- **R-19:** thu gọn Hôm nay/khối hỏi để nút Gửi nằm trên bottom-nav ở 360 chữ lớn.
- **R-05:** cảnh báo đã đóng không đặt card Gọi trước “Cảnh báo đã kết thúc”; chỉ ưu tiên khi còn mở/đang hỗ trợ.
- **R-11:** giữ nhãn nguồn mô phỏng cạnh khối Tổng hợp khi source synthetic.
- **R-20/R-21:** “từng mẫu” → “từng lần đo”; 403 ask phân biệt origin/quyền ghi với quyền số đo; không render `role=log` rỗng.
- **R-12/R-14/R-16** một phần: giảm trùng số/nhãn, chỉnh copy tải thêm; các mục chưa làm ghi trong báo cáo re-review.

## Kiểm chứng lead chạy lại

```text
$ pnpm --filter @annhien/web test
Test Files 33 passed (33)
Tests 221 passed (221)

$ pnpm --filter @annhien/web typecheck
$ tsc -p tsconfig.json --noEmit
(exit 0)

$ pnpm --filter @annhien/web build
✓ built in 317ms
dist/assets/index-DOMmfEbT.js 270.96 kB │ gzip 83.24 kB
```

## Chưa làm / rủi ro

- Chưa re-review độc lập nhánh vòng 2; chưa merge.
- Các P2/P3 còn lại trong `reports/qa/v4-rereview-app.md` (F21 hai nút tải, F14 menu tài khoản, R-12 3 giá trị nhịp tim, v.v.) chưa đóng hết.
- Worker bị dừng trước khi tự chạy E2E/screenshots; lead mới chạy unit/typecheck/build, chưa coi là pass giao diện.
