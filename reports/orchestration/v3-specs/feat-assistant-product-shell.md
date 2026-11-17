# Feature worker v3 — trợ lý là trung tâm, web là sản phẩm thật

Bạn là worker frontend trên worktree riêng. Đọc `AGENTS.md`, `docs/06`, `docs/07`, `docs/11`, `apps/web/src/features/assistant/AssistantPage.tsx`, `apps/web/src/app/AppShell.tsx`, `apps/web/src/app/router.tsx`, `apps/web/src/pages/LandingPage.tsx`, và các test liên quan.

## Quyết định sản phẩm đã chốt

1. **Trợ lý là trung tâm của web**, không phải một mục phụ. `/app` mặc định mở không gian trợ lý; dashboard chi tiết chuyển sang `/app/overview`.
2. Web phải được trình bày như **sản phẩm thật**, không phải “bản demo/đồ án”. Trên toàn bộ giao diện web:
   - Không còn chữ “Bản demo”, “đồ án demo”, “giảng viên”, “nghiệm thu”, “chưa được duyệt” trong text hiển thị, metadata, aria-label hoặc test.
   - Vẫn phải trung thực dữ liệu: nơi có số đo/summary, giữ nhãn **“Dữ liệu mô phỏng” / “Nguồn dữ liệu mô phỏng”** hoặc trạng thái thiếu dữ liệu; tuyệt đối không biến dữ liệu tổng hợp thành số đo thật.
   - Bỏ các pill “Bản demo · dữ liệu mô phỏng” lặp toàn trang; thay bằng câu giới hạn an toàn ngắn, đúng ngữ cảnh, không nhắc demo/trường học.
3. Các màn hình khác là công cụ để kiểm chứng/xử lý việc trợ lý nêu; không thay thế cảnh báo bằng lời AI. Cảnh báo vẫn độc lập với AI.

## Phạm vi được sửa

Chỉ frontend/web:
- `apps/web/src/features/assistant/**`
- `apps/web/src/app/router.tsx`, `apps/web/src/app/AppShell.tsx`, test tương ứng
- `apps/web/src/pages/LandingPage.tsx` + test
- `apps/web/src/components/DemoNotice.tsx`, `SiteFooter.tsx` (nếu cần)
- `apps/web/src/features/auth/AuthLayout.tsx`, `LoginPage.tsx`, `RegisterPage.tsx` + test
- `apps/web/src/features/dashboard/DashboardPage.tsx` + test (chỉ copy/nhãn và link liên quan)
- `apps/web/src/features/history/HistoryPage.tsx` + test (copy nhãn)
- `apps/web/src/features/alerts/AlertDetailPage.tsx` + test (copy nhãn)
- `apps/web/src/features/subjects/SubjectsPage.tsx` + test (copy nhãn)
- `apps/web/src/features/settings/ProfileCard.tsx`
- `apps/web/src/features/invitations/InvitePage.tsx`
- `apps/web/src/styles/layout.css` (chỉ rule liên quan shell/assistant/demo; không đổi token)
- `apps/web/index.html`
- `apps/web/e2e/**` nếu route/copy làm test cũ sai
- `reports/handoffs/v3-feat-assistant-product-shell.md`

Không sửa API, contracts, schema, docs, HTML tài liệu, package exports. Không cài dependency mới.

## Yêu cầu UI

### Không gian trợ lý tại `/app`

- Bố cục **chat-first**: cột hội thoại là trung tâm; cột “Bối cảnh” bên phải trên desktop, thu gọn trên mobile.
- Khi mở, trợ lý có lời chào/ bản tin ngắn từ summary hiện có; không bịa số. Nếu chưa có dữ liệu/quyền, nói rõ và giữ nút thử lại.
- Người dùng gửi câu hỏi; câu trả lời nối tiếp trong cùng cuộc hội thoại (state trong phiên), không chỉ thay thế một câu trả lời duy nhất. Giữ `DataQualityPanel`, nguồn, disclaimer, xử lý lỗi/429 như hiện tại.
- Gợi ý câu hỏi ngắn, bám dữ liệu: nhịp tim, cảnh báo đang mở, pin, lịch sử, người thân.
- Cột bối cảnh có ít nhất: hồ sơ đang xem, cảnh báo đang mở (số + link), lần nhận dữ liệu cuối, liên kết Lịch sử / Cảnh báo / Hồ sơ / Thiết bị. Không hiển thị số đo nếu thiếu quyền.
- Các hành động dẫn tới màn hình tương ứng; không tự động xác nhận/đóng cảnh báo từ chat.
- Giữ khả năng truy cập: heading đúng cấp, focus, aria-label, text lớn, reduced motion, responsive.

### Điều hướng và route

- `/app` → Assistant; `/app/overview` → Dashboard cũ.
- Nav đưa “Trợ lý” lên đầu (desktop + mobile), “Tổng quan” thứ hai. Bảo đảm bottom-nav không quá 6 mục; “Trợ lý” không nằm trong “Thêm”.
- Cập nhật mọi link đang trỏ `/app` với ý nghĩa dashboard (brand, sau login, sau thu hồi quyền, E2E) sang route đúng.
- Giữ `/app/history`, `/app/alerts`, `/app/subjects`, `/app/devices`, `/app/notifications`, `/app/tasks`, `/app/settings`, `/app/studio`, `/app/admin`.

### Ngôn ngữ sản phẩm

- Landing: hero và CTA hướng về trợ lý; bỏ badge “Bản demo”; phần an toàn dùng “Dữ liệu hiển thị là dữ liệu mô phỏng…”, không dùng “bản demo/đồ án”.
- Login/Register/AuthLayout: bỏ nhãn demo; đổi “Tài khoản demo có sẵn” thành “Tài khoản mẫu” (email demo có thể giữ), giải thích ngắn “dùng để trải nghiệm”.
- AppShell: bỏ pill demo và câu “Bản demo không tự gọi cấp cứu”; giữ câu giới hạn thật ngắn (“Cảnh báo chỉ cập nhật khi ứng dụng đang mở.”).
- Footer/Invite/Settings/Subjects/History/AlertDetail: bỏ “Bản demo/đồ án”; thay bằng “phiên bản hiện tại/hệ thống” nếu cần.
- Không thêm lời hứa y tế, không nói dữ liệu là thật.

## Kiểm và bàn giao

- Chạy typecheck + test web liên quan + toàn bộ web; build production bắt buộc.
- Chạy preview thật (API/DB riêng hoặc mock có kiểm soát) ở cổng riêng, không đụng API 3000/web 5173; chụp ảnh **1280×900, 390×844, 360×740, chữ lớn** cho ít nhất: trợ lý, tổng quan, landing, login; kiểm `scrollWidth == clientWidth`; đọc lại ảnh, sửa lỗi thấy được.
- E2E: cập nhật test route/copy; chạy nếu môi trường cho phép, ghi rõ phần chưa chạy.
- Commit trên nhánh riêng; **không merge master**. Handoff ghi file/line, lệnh + kết quả thật, ảnh, phần chưa kiểm, rủi ro.
- Không đóng finding của reviewer khác; không báo “đã duyệt” thay người dùng.
