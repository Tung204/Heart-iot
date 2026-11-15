# Fix app v4 — vòng 2 theo re-review

Base: `fix-v4-app` (`594ee28`). Đọc `reports/qa/v4-rereview-app.md`. Không merge.

## P1 bắt buộc

- **R-01 stale vs offline:** `online=true, freshness=stale` không được ghi “Thiết bị ngoại tuyến”. Tách:
  - `online=false/freshness=offline` → `Thiết bị ngoại tuyến · dữ liệu cuối {lastSeenAt}`;
  - `stale` → `Chưa có số đo mới · lần đo cuối {lastMeasuredAt}`.
  Dùng đúng mốc (`lastSeenAt` vs `lastMeasuredAt`); test stale và offline riêng, bỏ assertion câu sai.

## P2 ưu tiên

- **R-09** topbar mobile: hộp xác nhận đăng xuất làm tràn 36px/6px và cắt nút Hủy; đưa xuống hàng full-width hoặc dialog, đo 360/390/chữ lớn, 0 overflow.
- **R-17** `/app/overview` chữ lớn: pill “Dữ liệu mô phỏng · không phải số đo thật” nowrap gây tràn 44/14px; cho wrap/tách dòng, đo 360/390 large.
- **R-19** Hôm nay 360 large: nút Gửi bị nav che / link/dòng cuối sau nav; thu gọn thẻ trạng thái/khối hỏi để Gửi trên nav.
- **R-05** cảnh báo resolved: không đặt card Gọi trước “Cảnh báo đã kết thúc”; chỉ ưu tiên khi open/acknowledged.
- **R-11** giữ một nhãn nguồn mô phỏng cạnh khối “Tổng hợp hôm nay” khi source synthetic; không chỉ để trong Xu hướng.
- **R-20/R-21**: “từng mẫu” → “từng lần đo”; 403 ask phân biệt origin/quyền ghi với quyền số đo, không render role=log rỗng.
- **R-12/R-14/R-16** nếu còn thời gian: giảm 3 giá trị nhịp tim/4 ô số/3 cách đếm; menu tài khoản; một nút tải thêm. Ghi rõ chưa làm nếu bỏ.

Ràng buộc: chỉ app files/CSS/test; không API/contract/AppShell? AppShell allowed for R-09/R-19; router/public/admin/layout không. Chạy web test/typecheck/build; ảnh 1280/390/360/large, focus/overflow; handoff `reports/handoffs/v4-fix-app-2.md`; commit branch riêng; không merge.
