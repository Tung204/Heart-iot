# Fix public v4 — vòng 2 theo re-review

Base: `fix-v4-public`. Đọc `reports/qa/v4-rereview-public.md`. Không merge.

Sửa R-01..R-05 (và các P3 nếu nhanh):

1. **R-02 — câu an toàn đủ nghĩa:** dòng dưới CTA phải có đủ: `Dữ liệu mô phỏng · cảnh báo chỉ hiện khi web đang kết nối · không tự gọi cấp cứu · không thay thế cấp cứu.` Nếu dài, xuống 2 dòng ngắn; không bỏ “không thay thế cấp cứu”. Test phải kiểm cả “không thay thế cấp cứu” và “đang kết nối”.
2. **R-01 — chữ lớn/chiều cao thấp:** ở 375×667, 390×667, 360×640 với chữ lớn, dòng an toàn và CTA chính phải nằm trong viewport. Giảm padding/margin/line-height hero trong media query chữ lớn+max-height, không ẩn chữ. Kiểm 360×740, 390×700, 390×844, 320×640 nữa.
3. **R-03/R-04 — /me pending/500:** pending hiện chỉ báo tải (`aria-busy`, spinner/text) và không nhấp nháy CTA; 500 hiện `Không kiểm tra được phiên đăng nhập.` + cả `Đăng nhập` và `Tạo tài khoản` + `Thử lại` (refetch). Không giả làm khách; không mất đường đăng ký. Test 3 trạng thái.
4. **R-05 — focus lỗi server:** khi login trả 401/lỗi API, focus vào alert lỗi hoặc field email đầu tiên, không để BODY; giữ role=alert. Test `document.activeElement`.
5. **R-06 docs:** cập nhật `reports/orchestration/v4-specs/v4-simple-public.md` và handoff cũ? Không sửa handoff lịch sử; chỉ ghi chú trong handoff mới rằng khối trải nghiệm đã bị xóa. README credentials giữ cho local; ghi rõ “dùng khi chạy seed local, không hiện trong UI”. Không sửa docs/README nếu ngoài phạm vi; ghi vào handoff.

Ràng buộc: chỉ public files/test/CSS/e2e smoke; không đổi API/route/quyền; không thêm dependency; test/typecheck/build + smoke; ảnh; commit branch riêng; handoff `reports/handoffs/v4-fix-public-2.md`; không merge.
