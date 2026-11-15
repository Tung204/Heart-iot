# Worker v4 — giao diện công khai tối giản

> **Cập nhật vòng 2 (2026-11-15, nhánh `fix-v4-public-2`):** khối `<details>`
> “Tài khoản trải nghiệm” đã bị bỏ hẳn sau phát hiện P1-5 của review v4; form
> đăng nhập công khai bắt đầu trống và không còn email/mật khẩu trong bundle web.
> Dòng an toàn dưới CTA của `/` giữ đủ bốn ý (mô phỏng · chỉ có khi web đang kết
> nối · không tự gọi cấp cứu · không thay thế cấp cứu). Yêu cầu “đúng một dòng
> ngắn” vì thế được đọc là **một khối chữ duy nhất**, được phép xuống 2 dòng;
> không rút gọn mất ý an toàn. Hẹp/ngắn hơn 390×844 vẫn phải giữ CTA chính và
> dòng an toàn trong màn đầu khi bật chữ lớn (xem mục Kiểm và bàn giao).

## Bối cảnh

Người dùng đã bác giao diện hiện tại: quá nhiều chữ, quá nhiều mục, phải hướng dẫn mới hiểu. Không làm preview, không viết thêm tài liệu giải thích. Thay trực tiếp giao diện công khai bằng bản tối giản, một màn một mục đích.

Chỉ được sửa các file trong phạm vi dưới đây. Không sửa `apps/web/src/app/AppShell.tsx`, `router.tsx`, `apps/web/src/styles/layout.css`, `tokens.css`, `docs/`, `README`, `reports/` (trừ handoff của bạn), `apps/api`, contracts, package.json.

## Phạm vi file

- `apps/web/src/pages/LandingPage.tsx`
- `apps/web/src/pages/LandingPage.test.tsx`
- `apps/web/src/pages/NotFoundPage.tsx` (chỉ copy ngắn nếu cần)
- `apps/web/src/features/auth/AuthLayout.tsx`
- `apps/web/src/features/auth/LoginPage.tsx`
- `apps/web/src/features/auth/LoginPage.test.tsx`
- `apps/web/src/features/auth/RegisterPage.tsx`
- `apps/web/src/components/SiteHeader.tsx`
- `apps/web/src/components/SiteFooter.tsx`
- `apps/web/src/features/invitations/InvitePage.tsx` (nếu có; chỉ rút gọn copy)
- `apps/web/src/styles/public-simple.css` (được tạo sẵn, điền vào đây)
- `apps/web/index.html` (title/meta description ngắn)

Không thêm dependency. Không đổi API, route hay quyền.

## Nguyên tắc bắt buộc

1. Mỗi màn hình một mục đích. Không lặp lại thông tin giữa hero, section, footer.
2. Mỗi khối chỉ 1 tiêu đề + tối đa 1 câu giải thích ngắn. Bỏ các đoạn văn dài, bullet giải thích quy trình, các “ranh giới an toàn” lặp lại.
3. Không dùng chữ “demo”, “đồ án”, “giảng viên”, “nghiệm thu”, “chưa được duyệt”. Giữ đúng một khối chữ an toàn: trên `/` là `Dữ liệu mô phỏng · cảnh báo chỉ hiện khi web đang kết nối · không tự gọi cấp cứu · không thay thế cấp cứu.`; ở khung đăng nhập/đăng ký/lời mời/404 là `Dữ liệu mô phỏng · không thay thế cấp cứu.`
4. Không thêm nút không có chức năng. Nút chính phải dẫn tới hành động thật.
5. Mobile 390×844 và 360×740: không tràn ngang; nút chính và form nằm trong màn đầu; chữ dài phải xuống dòng, không cắt. Với chữ lớn trên màn thấp (375×667, 390×667, 360×640, 360×740, 390×700, 390×844, 320×640), CTA chính **và** dòng an toàn phải nằm trong màn đầu; được giảm padding/khoảng cách/line-height của hero nhưng không ẩn bớt chữ.
6. Giữ khả năng truy cập: skip link, `h1` duy nhất, label cho input, focus rõ, nút ≥44px.

## Thiết kế cụ thể

### Trang chủ `/`

Chỉ còn:

1. **Hero** (một màn đầu):
   - H1 giữ nguyên: `Người thân ở nhà, mình vẫn an tâm`
   - Một đoạn mô tả tối đa 2 câu.
   - Hai CTA: `Mở ứng dụng` (nếu đã đăng nhập) hoặc `Tạo tài khoản`; phụ `Đăng nhập`.
   - Một khối chữ nhỏ ngay dưới CTA: `Dữ liệu mô phỏng · cảnh báo chỉ hiện khi web đang kết nối · không tự gọi cấp cứu · không thay thế cấp cứu.` (được xuống dòng, không rút gọn ý).
   - Trạng thái phiên: đang kiểm tra thì chỉ báo tải (`role=status`, `aria-busy`, chữ + spinner), không hiện CTA; lỗi máy chủ thì hiện `Không kiểm tra được phiên đăng nhập.` kèm **cả** `Đăng nhập`, `Tạo tài khoản` và nút `Thử lại` (refetch) — không giả làm khách, không mất đường đăng ký.
   - Có thể giữ một hình minh hoạ đơn giản bên phải; bỏ danh sách 3 dòng và nhãn “Minh hoạ giao diện” nếu không cần. Trên mobile ẩn hình để nội dung chính lên trước.
2. **Một section “An Nhiên làm gì”** với đúng 3 thẻ, mỗi thẻ 1 tiêu đề + 1 câu:
   - `Theo dõi` — nhịp tim, vận động, kết nối thiết bị.
   - `Báo khi cần` — cảnh báo do hệ thống tạo, không phụ thuộc trợ lý.
   - `Hỏi đáp` — hỏi về số liệu của người thân bằng câu ngắn.
3. **Footer tối giản**: tên sản phẩm + một dòng mô tả + một dòng dữ liệu mô phỏng/không cấp cứu.
4. Bỏ hoàn toàn các section: “Vì sao An Nhiên?”, “Cách hoạt động” 3 bước, “Trợ lý ở trung tâm”, “Ranh giới an toàn” 4 cảnh báo, CTA cuối lặp lại.

### Đăng nhập `/login`

- Khung giữa màn hình, không có header marketing dài.
- H1 `Đăng nhập`; một câu `Xem tình hình người thân và cảnh báo.`
- Chỉ 2 trường Email, Mật khẩu + nút `Đăng nhập`.
- Link `Tạo tài khoản mới` ở dưới.
- **Không còn** khối `<details>` “Tài khoản trải nghiệm” hay nút tự điền tài khoản (bỏ theo P1-5); người dùng demo gõ tay theo bảng trong `README.md` khi chạy seed local.
- Một dòng cuối: `Dữ liệu mô phỏng · không thay thế cấp cứu.`
- Lỗi API (401/5xx) vẫn `role=alert` và đưa focus vào hộp lỗi; lỗi field thì focus field lỗi đầu tiên.

### Đăng ký `/register`

- H1 `Tạo tài khoản`; một câu ngắn.
- Các trường hiện có; chỉ giữ hint thật cần: mật khẩu tối thiểu 10 ký tự. Bỏ hint “Tên của bạn, hiển thị với người thân.”
- Nút `Tạo tài khoản`; link `Đã có tài khoản? Đăng nhập`.
- Một dòng dữ liệu mô phỏng ở cuối.

### AuthLayout

- Bỏ khối `demo-notice` dài; thay bằng một dòng nhỏ dùng chung.
- Không thêm lời khuyên y tế dài.

### Header/Footer

- Header chỉ logo + 1–2 CTA; không thêm menu mới.
- Footer tối đa 2 dòng.

### Trang lỗi

- Giữ 404 ngắn; không giải thích dài.

## Kiểm và bàn giao

1. `pnpm --filter @annhien/web test` — cập nhật test copy đã đổi, không nới assertion.
2. `pnpm --filter @annhien/web typecheck`
3. `pnpm --filter @annhien/web build`
4. Chạy dev ở cổng riêng 4310 (không dùng 5173) và chụp:
   - `/` 1280×900, 390×844, 360×740
   - `/login` 1280×900, 390×844, 360×740
   - `/register` 390×844
   - `/` chữ lớn 390×844
   - Kiểm `document.documentElement.scrollWidth - clientWidth === 0` ở từng ảnh.
5. Không sửa DB, không chạy seed, không đụng API 3000.
6. Chạy smoke cho landing ở 375×667, 390×667, 360×640, 360×740, 390×700, 390×844, 320×640 với chữ lớn: CTA chính + dòng an toàn trong màn đầu, không tràn ngang; kiểm thêm 320×640 cỡ thường.
7. Chạy smoke cho 3 trạng thái phiên `/me` (đang tải, 401, lỗi máy chủ) và focus khi login trả 401.
8. Commit trên branch riêng; **không merge**.
9. Ghi handoff mới với: file đã đổi, output test/typecheck/build thật, ảnh đã chụp, số đo tràn ngang, điều chưa làm. Không sửa handoff lịch sử.
