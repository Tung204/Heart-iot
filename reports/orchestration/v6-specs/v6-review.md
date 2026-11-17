# v6 review — kiểm tra giao diện sau khi bỏ thương hiệu/card hồ sơ

Bạn là **reviewer độc lập**, không sửa code. Worktree riêng từ master hiện tại; chạy web dev server cổng **4346** (API 3000 chỉ đọc, tuyệt đối không seed/ghi DB, không POST/PATCH/DELETE ngoài login). Chromium.

## Bối cảnh

Người dùng chấm bản trước 0/100 và nêu: tên thương hiệu tự đặt, card “Hồ sơ đang xem” full-width vô nghĩa, nhiều thứ dư thừa, menu “Thêm” trộn Studio/Công việc, sidebar có “????”. Bản v6 đã: nav đúng 4 mục Hôm nay/Cảnh báo/Sức khỏe/Người thân; menu tài khoản ở avatar (không Studio); bỏ card hồ sơ, chỉ 1 dòng tên; landing bớt lặp; Người thân hàng gọn. Cần tìm **lỗi còn lại**, không khen.

## Phải kiểm

- Public: `/`, `/login`, `/register`, 404, invite/share link nếu mở được; 1280×900 + 390×844.
- App owner: `/app`, `/app/alerts`, `/app/overview`, `/app/subjects`, `/app/settings`, `/app/devices`, `/app/notifications` (redirect), `/app/studio` (direct, không link), `/app/share`/chi tiết chia sẻ nếu có; 390×844 + 1280×900; thêm 360×740 và 390×844 chữ lớn cho `/app`, `/app/subjects`, `/app/settings`, `/app/overview`.
- Admin: `/app/admin` và tab; 1280 + 390; menu tài khoản admin.
- Trạng thái: loading, rỗng, lỗi, chưa đăng nhập (redirect login), hồ sơ 1 người (tài khoản demo hiện tại), không có hồ sơ nếu tạo được context đọc-only? Không ghi DB; chỉ quan sát empty state nếu có sẵn.
- Kiểm cụ thể: tràn ngang (scrollWidth > clientWidth), CTA/action ngoài viewport đầu, khoảng trắng vô nghĩa, copy lặp/câm, jargon kỹ thuật, nút <44px, focus/ARIA menu, đóng menu, Escape, tab, link chết, 2 nút cùng việc, nhãn mơ hồ, tiếng Anh lẫn, số liệu mâu thuẫn, “An Nhiên”/“Thêm”/“Hồ sơ đang xem”/Studio còn sót.
- Với mỗi màn: nêu **route + viewport + bước tái hiện + mong đợi + thực tế + mức P1/P2/P3**. Ảnh lưu `C:/tmp/v6-review/<tên>.png`; không cần commit ảnh.

## Cấm

- Không sửa file code, không commit; chỉ ghi `reports/qa/v6-review.md` (có thể commit report? **không**, để lead tự commit).
- Không lấy test xanh làm kết luận giao diện. Không bắt buộc số lượng lỗi: chỉ ghi finding có bằng chứng; không bịa/tách vụn cho đủ quota. Nếu không thấy lỗi, ghi rõ phạm vi đã kiểm và phần chưa kiểm.
- Kiểm cả diff test v6: assertion bị xóa/nới, hành vi chưa có test hồi quy; đề xuất thứ tự sửa dựa trên finding thật, không sửa code.
- Không dùng dữ liệu thật/credentials ngoài demo; không tạo dữ liệu.

## Khôi phục 15/11/2026 22:09 (UTC+7)

Người dùng chỉ định **provider `dola`, model `gpt-6.1-sol`**, thay provider cũ. Dispatch đầu `ctx_3d4c3e1fe38e` lỗi HTTP 403 và đã stop có xác nhận. Retry cùng Task `task_eb6d7a5f3688`: dispatch `ctx_f264ee10055a`, worktree cũ `v6-review`, terminal mới đã xác minh footer `(dola) gpt-6.1-sol`. Báo cáo chưa có tại thời điểm khôi phục. Không tự ghi Obsidian ngoài workspace; lead tổng hợp khi có quyền ghi.
