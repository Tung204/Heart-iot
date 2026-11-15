# Fix admin v4 — vòng 2 theo re-review

Base: `fix-v4-admin`. Đọc `reports/qa/v4-rereview-admin.md`. Không merge.

Sửa các P2 chặn chất lượng (R01–R03, R06, R09, R11, R12); các P3 còn lại ghi handoff.

1. **R02 — chi tiết audit ở 768/1024:** thay `<tr><td colSpan>` trong bảng bằng **panel chi tiết full-width bên dưới bảng** (hoặc dialog) để không bị khung cuộn ngang cắt; JSON `<pre>` cuộn ngang trong panel, không bẻ từ. Đóng panel rõ; giữ focus/aria. Test chọn dòng audit, panel hiện, không phụ thuộc colspan.
2. **R03 — mất notice khi dòng rời bộ lọc:** thông báo đổi trạng thái phải là toast/role=status **ngoài danh sách** (đầu tab hoặc fixed), vẫn hiện dù filter làm dòng biến mất; focus về nút/notice hợp lý. Test trường hợp filter active.
3. **R01 — tín hiệu vận hành:** “Cần chú ý” phải không bỏ mất `devices.offline`, `subjects.total`, `users.disabled` khi có >3 tín hiệu. Có thể giữ 4 KPI + một dòng “Chi tiết vận hành” gập hiện đủ 4 số còn lại; ưu tiên cảnh báo/pending/tasks nhưng không im lặng bỏ offline. Test `devices.offline>0` hiện.
4. **R06/R12 — lỗi PATCH:** thông báo lỗi focus/scroll tới khối lỗi, không bóp 114px; focus không về BODY.
5. **R09:** khôi phục assertion offline trong test tổng quan; thêm test chọn audit panel, notice khi filter, lỗi PATCH; không nới test khác.
6. **R11:** lỗi field policy cũ tự xoá khi sửa; tránh 2 alert trùng; focus ring thấy.
7. **R10/R13/R14** nếu nhanh: aria-controls chỉ tab active; nhãn action còn thiếu; “Giới hạn telemetry mỗi phút” → “Giới hạn số mẫu mỗi phút”; target hồ sơ dùng tên nếu có.

Ràng buộc: chỉ admin files/CSS/test; không API/contract/AppShell/router; chạy web test/typecheck/build; ảnh 1280/390/360/768/1024 + chữ lớn; handoff `reports/handoffs/v4-fix-admin-2.md`; commit branch riêng; không merge.
