# Fix worker v4 — sửa lỗi review quản trị

Base: `v4-simple-admin`. Đọc báo cáo `C:/MyFolder/Hoc_Tap/project/DATN/reports/qa/v4-review-admin.md`. Không merge.

## Phải sửa P1

- **F01:** “Xem chi tiết” audit phải mở full-width, không nhét JSON vào ô 121px. Dùng `<tr><td colSpan={5}>` hoặc panel; `<pre>` không bẻ từ, có `overflow-x:auto`, đọc được ở 1280/390/360. Test mở details và kiểm JSON chứa nội dung.
- **F02:** lỗi field policy và 409 phải nhìn thấy tại chỗ bấm: focus + scroll tới field lỗi đầu tiên; thêm summary lỗi cạnh nút; 409 đặt cảnh báo + nút Tải lại trong viewport hoặc toast cố định. Không chỉ dựa role=alert.

## Phải sửa P2

- **F03:** Nhật ký mobile/tablet không được giấu cột Kết quả/Thời gian/Chi tiết. Dưới 768 dùng card có nhãn; 768–1024 hiện hint khi bảng rộng hơn khung.
- **F04:** bỏ câu “Chưa có bản phát hành:” khi history có bản; đổi thành “Giá trị mặc định (dùng khi chưa có bản phát hành)”.
- **F05:** khôi phục một dòng bằng chứng preview: version nền + digest ngắn + “không ghi dữ liệu”.
- **F06:** không làm mất tín hiệu `tasks.open`/`outbox.pending`; thêm vào “Cần chú ý” khi >0 (tối đa 3 dòng), không thêm KPI thứ 5.
- **F08:** giữ ngày tạo user hoặc link chi tiết; thêm hint ngắn cho tìm kiếm/lọc.
- **F09/F10:** thông báo đổi trạng thái phải gần hành động/toast; focus vào lý do khi mở, trả focus khi hủy; textarea có `required`/`aria-required` và mô tả lỗi.
- **F11:** bỏ pseudo-element `data-label` gây đọc lặp; dùng nhãn `aria-hidden` trong cell hoặc cấu trúc card đúng.
- **F12:** map nhãn tiếng Việt cho các action phổ biến (auth.login, assistant.summary, incident.acknowledge, admin.user.disable…); target dễ đọc hơn; giữ mã gốc trong title/chi tiết. Không cần API mới.
- **F13** (nếu làm được): giữ tab/subtab trong query string `?tab=...&view=...`, reload không mất; nếu không, ghi rõ chưa làm.
- **F14:** tab dùng `role=tablist/tab/tabpanel` hoặc link có URL; thêm H2 cho từng màn; ArrowRight đổi tab hoặc dùng link.
- **F15/F16:** nhãn policy rõ nghĩa (“Gửi nhịp tim mỗi (giây)”, “Dữ liệu được coi là mới trong (giây)”, “Giới hạn telemetry mỗi phút”); thiết bị không in UUID trần, ghi “Mã hồ sơ …” hoặc tên nếu có; offline nói ngưỡng.
- **F17:** thêm test cho `failed>0`, actorLabel/action label, details audit full-width, focus lỗi policy, mobile audit card; không xóa test cũ.

## Ràng buộc

- Chỉ sửa `AdminPage.tsx`, `AdminPage.test.tsx`, `AdminDevicesTab.tsx`, `admin-simple.css`, `admin-devices.css` nếu cần. Không sửa AppShell/router/main/layout/public/app CSS/API/contracts/docs.
- Không thêm dependency/endpoint. Không dùng copy demo.
- Chạy web test/typecheck/build; ảnh admin 1280/390/360 + chữ lớn; đo overflow, vị trí lỗi/notice, details.
- Handoff `reports/handoffs/v4-fix-admin.md`; commit branch riêng; không merge.
