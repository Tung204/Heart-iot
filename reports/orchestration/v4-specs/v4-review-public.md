# Reviewer v4 — giao diện công khai

Bạn là reviewer độc lập. Không tin báo cáo worker, không tin test worker, không sửa code. Nhiệm vụ là tìm lỗi thật.

## Nhánh cần soi

`feat/v4-simple-public`, code commit `f572ef4`, handoff `49c3ac9`. Base `b778486`.
Worktree riêng của bạn; checkout nhánh này để đọc/chạy, không merge vào master.

## Phải kiểm

1. `git diff b778486..feat/v4-simple-public`; đọc toàn bộ test thay đổi trước. Ghi rõ nếu assertion bị nới/xóa hoặc chỉ kiểm chữ.
2. Chạy lại trong worktree sạch: contracts build, `pnpm --filter @annhien/web test`, typecheck, build. Không dùng output trong handoff làm kết quả.
3. Chạy web cổng riêng **4340**, không dùng 5173. API 3000 chỉ đọc `/me`; không đăng nhập, không ghi DB, không seed, không đụng `.data/pglite`.
4. Mở `/`, `/login`, `/register`, `/invite`, 404 ở 1280×900, 390×844, 360×740, chữ lớn 390. Kiểm:
   - `scrollWidth - clientWidth` và phần tử vượt viewport;
   - CTA chính có trong màn đầu, kích thước ≥44px;
   - `h1` duy nhất, thứ tự heading, focus bàn phím, skip link;
   - `<details>` mở/đóng, Esc/Enter, nút điền tài khoản;
   - form validation, lỗi API giả lập, trạng thái đã đăng nhập;
   - không lặp CTA/câu disclaimer; không còn chữ “demo/đồ án/giảng viên/nghiệm thu”;
   - ngữ nghĩa: người dùng phổ thông có hiểu sản phẩm làm gì không, có thừa chữ không.
5. Soi đặc biệt các lỗi đã thấy bằng mắt: header khách có “Đăng nhập” trong khi hero cũng có “Đăng nhập”; hero không nói rõ trợ lý AI; ba thẻ có thật sự đủ phân biệt không; footer có bị lặp disclaimer không.
6. Phải liệt kê **ít nhất 10 phát hiện** (lỗi hoặc chỗ chưa hợp lý), mỗi phát hiện: màn hình, viewport, hành vi, mong đợi, thực tế, mức độ. Nếu thật sự không đủ 10, ghi rõ đã kiểm gì và vẫn nêu rủi ro; không được viết “đạt/pass”.
7. Không sửa code, không commit code, không merge, không đụng docs/README. Chỉ ghi báo cáo `reports/qa/v4-review-public.md` trong worktree; có thể commit riêng báo cáo nếu cần, nhưng không sửa file khác.
8. Trả lời ngắn: số phát hiện, 3 lỗi nặng nhất, file báo cáo.

## Cấm

- Không dùng ảnh/handoff của worker làm bằng chứng duy nhất.
- Không chấp nhận “test pass” làm kết luận.
- Không sửa giao diện; không đóng finding của người khác.
