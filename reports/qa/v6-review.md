# Review v6 — dừng theo yêu cầu xây lại UI

**Trạng thái: superseded bởi yêu cầu xây mới toàn bộ UI (v7).** Coordinator yêu cầu dừng mở rộng review ngày 15/11/2026; đây là báo cáo rủi ro chuyển đổi của phần thực sự đã kiểm, **không phải kết luận nghiệm thu hay review đủ ma trận v6**. Không áp quota số finding; không sửa code, không commit.

- Nguồn: worktree `C:/Users/nguye/orca/workspaces/DATN/v6-review`, HEAD `102d72c6ed9c91dc36f297dec4b45ed3bcdc7138`.
- Người kiểm: Pi, provider/model theo dispatch khôi phục `dola / gpt-6.1-sol`.
- Browser: Orca embedded Chromium, UA Chrome `150.0.7871.250`.
- Web đang kiểm: **`http://127.0.0.1:4346`**, Vite 8.3.8; API cổng 3000.
- Chỉ thực hiện GET và login bằng tài khoản demo có trong README; không seed, không tạo dữ liệu, không gửi các mutation nghiệp vụ, logout hoặc thu hồi phiên. Login tạo phiên là ngoại lệ được cho phép.
- Không ghi Obsidian theo chỉ dẫn coordinator; lead lưu tổng hợp.

## 1. Finding tái hiện được

### F01 — P2: Link lời mời thiếu ký tự bị báo thành lỗi kết nối và mời thử lại

- **Route + viewport:** `/invite/v6-review-invalid`, 1280×900 và 390×844, chưa đăng nhập.
- **Bước:** mở trực tiếp link trên; để yêu cầu kiểm lời mời hoàn tất.
- **Mong đợi:** thông báo link không hợp lệ/thiếu ký tự, hướng dẫn kiểm tra link hoặc xin gửi lại; không gợi ý retry một lỗi validation cố định.
- **Thực tế:** hiện “Không kiểm tra được lời mời”, “Không kết nối được máy chủ hoặc lời mời đang gặp lỗi. Hãy thử lại.” và nút “Thử lại”. GET `/api/v1/invitations/v6-review-invalid` thực tế trả **422 `VALIDATION_FAILED`**, chi tiết chuỗi phải có ít nhất 20 ký tự; không phải mất kết nối.
- **Đối chứng:** token không tồn tại nhưng đủ dài `/invite/v6-review-invalid-token-000000000000` hiện “Lời mời không hợp lệ” và “Về trang chủ”. Như vậy hai dạng link không hợp lệ bị xử lý lệch nhau.
- **Ảnh:** `C:/tmp/v6-review/public-invite-invalid-1280.png`, `C:/tmp/v6-review/public-invite-invalid-390.png`; đối chứng `C:/tmp/v6-review/public-invite-nonexistent-390.png`.
- **Nguồn:** `apps/web/src/features/invitations/InvitePage.tsx` chỉ tách `isNotFoundError`; lỗi validation đi nhánh lỗi máy chủ chung.
- **Rủi ro mang sang v7:** giữ nguyên API adapter nhưng thay UI sẽ tiếp tục gán sai nhóm lỗi nếu chỉ đổi phần trình bày.

### F02 — P3: Các link phụ công khai có vùng bấm thấp hơn tiêu chí 44 px của đợt kiểm

- **Route + viewport:** `/login`, `/register`, `/`, `/review-missing`; 1280×900 và 390×844.
- **Bước:** mở route, đo `getBoundingClientRect()` của link đang hiển thị; không đo phần tử bị ẩn.
- **Mong đợi:** các hành động điều hướng cần chạm trên mobile có vùng bấm tối thiểu 44×44 CSS px theo tiêu chí task.
- **Thực tế:** `/login` link “Tạo tài khoản mới” cao **20 px**; `/register` link “Đăng nhập” cao **20 px**. Link logo về trang chủ cao **28 px** tại login/register; tại landing và 404 cao **26 px desktop / 28 px mobile**. Đây là link điều hướng riêng, không phải nút CTA lớn.
- **Ảnh:** `C:/tmp/v6-review/public-login-390.png`, `C:/tmp/v6-review/public-register-390.png`, `C:/tmp/v6-review/public-landing-390.png`, `C:/tmp/v6-review/public-404-390.png` và các bản `-1280.png` cùng tên.
- **Giới hạn:** đây là sai lệch với tiêu chí 44 px của task, không suy diễn rằng mọi link 20 px đều tự động vi phạm WCAG AA.
- **Rủi ro mang sang v7:** component link phụ/header cần contract về vùng tương tác; chỉ tăng cỡ chữ không giải quyết chắc chắn vùng bấm.

## 2. Phạm vi thực tế và phần chưa kiểm

| Nhóm | Đã thực sự quan sát | Chưa kiểm / giới hạn |
| --- | --- | --- |
| Public `/`, `/login`, `/register`, 404 `/review-missing` | Nội dung, DOM controls/kích thước/vị trí, ảnh viewport 1280×900 + 390×844; `scrollWidth == clientWidth` ở các lần đo | Chưa chạy luồng submit đăng ký, bàn phím đầy đủ, accessibility tree audit chuyên biệt |
| Invite | Token ngắn lỗi validation ở hai viewport; token đủ dài nhưng không tồn tại có trạng thái link không hợp lệ | Không tạo/chấp nhận lời mời; không xác minh link hợp lệ có sẵn |
| Chưa đăng nhập | Mở `/app/settings` được chuyển sang `/login?next=%2Fapp%2Fsettings` | Không kiểm toàn bộ protected routes |
| Owner `/app` | Login demo; snapshot nội dung một hồ sơ, một cảnh báo đang mở, hành động gọi/xem cảnh báo, ô hỏi; quan sát thoáng trạng thái “Đang tải trang…” | Chụp ảnh tab đầu thất bại do Orca/CDP không vẽ frame; không dùng đây làm lỗi sản phẩm; chưa kiểm đủ viewport hoặc gửi câu hỏi |
| Owner `/app/subjects` | Tab mới, ảnh 390×844; một hàng hồ sơ với Xem sức khỏe/Chia sẻ/Thiết bị và “Thêm thao tác”; ảnh `owner-subjects-390.png` | Chưa mở menu, chưa đo đầy đủ controls, chưa kiểm 1280/360/chữ lớn |
| Các màn owner còn lại | Chỉ đọc source/router liên quan trong quá trình chuẩn bị | `/app/alerts`, `/app/overview`, `/app/settings` sau login, `/app/devices`, redirect notifications, Studio trực tiếp, share/chi tiết chia sẻ chưa kiểm runtime trong phiên khôi phục này |
| Admin | Chưa đăng nhập admin | Toàn bộ `/app/admin`, tab và menu tài khoản chưa kiểm |
| Trạng thái | Loading thoáng qua trên `/app`; lỗi invite; public chưa đăng nhập; owner một hồ sơ | Chưa có kiểm lỗi mạng chủ động, empty state không hồ sơ, multi-profile runtime, 360×740/chữ lớn, Escape/Tab/focus/menu |

**Lưu ý bằng chứng:** `C:/tmp/v6-review` đã có nhiều ảnh/script từ trước phiên khôi phục. Báo cáo này chỉ nhận là bằng chứng của mình các ảnh public nêu trên và `owner-subjects-390.png`; không nhận coverage từ ảnh admin/app/state khác chỉ vì chúng tồn tại trên đĩa.

## 3. Trở ngại môi trường — không quy thành finding UI

1. **Hai listener theo hostname:** ban đầu mở `http://localhost:4346` thấy bản cũ có “An Nhiên”; HTTP source trả `_jsxFileName` ở worktree `fix-v4-app-2`. Server mới trong worktree review bind `127.0.0.1:4346` và trả đúng v6. Toàn bộ bằng chứng nhận trong báo cáo dùng **127.0.0.1**; quan sát bản cũ qua localhost bị loại, không báo “brand còn sót” trên v6.
2. **Origin login:** submit UI từ origin review `http://127.0.0.1:4346` bị API từ chối “Origin không được phép cho thao tác ghi.” Source middleware so sánh với `WEB_ORIGIN` mặc định `http://localhost:5173`. Để tiếp tục phần chỉ đọc, thực hiện đúng endpoint login demo bằng HTTP không có Origin và cài cookie HttpOnly vào browser; không thay cấu hình API. Không coi UI login xuyên origin của server QA là regression v6.
3. **Chụp ảnh tab owner đầu:** `screenshot` và `full-screenshot` trả `Page.captureScreenshot` timeout/không vẽ frame dù snapshot đọc được DOM. Tab mới `/app/subjects` chụp được. Chưa chứng minh nguyên nhân thuộc ứng dụng, không đưa vào danh sách lỗi sản phẩm.

## 4. Phản biện test diff v6 — đọc source, chưa chạy test

Phạm vi diff đã đọc: từ `abea3e0^` (`03672cc`, trước các merge v6) tới HEAD, ở `AppShell.test.tsx`, `SubjectSwitcher.test.tsx`, `SubjectsPage.test.tsx`, `AssistantPage.test.tsx`, `LandingPage.test.tsx`, `RegisterPage.test.tsx`, `router.test.tsx`, `e2e/smoke.spec.ts`. Đây là phân tích source, **không phải kết quả thực thi test**.

| Hành vi | Test/assertion hiện có hoặc thay đổi | Nhận xét cần mang sang v7 |
| --- | --- | --- |
| Bỏ brand tự đặt | Landing/register thêm assertion không có “An Nhiên”; smoke đổi tên sang “Theo dõi sức khỏe” | Đây là cập nhật expectation theo yêu cầu, không phải bằng chứng nới test để che lỗi; chưa phủ mọi route/metadata bằng assertion âm toàn app |
| Nav bốn mục và menu tài khoản | AppShell đổi expectation menu “Thêm” sang tài khoản, kiểm thứ tự/href bốn link, không Studio; badge từ `length >= 2` thành chính xác 2 | Số badge được siết chứ không nới; các mục Thiết bị/Công việc/Thông báo bị bỏ khỏi menu là thay đổi IA, cần test đường tìm chức năng thay thế chứ không chỉ test chúng biến mất |
| Menu bàn phím | Thêm focus mục đầu, Escape trả focus, click ngoài, mũi tên/Home/End | jsdom assertion không thay thế kiểm clipping, viewport, pointer target, Tab thật trong Chromium; phiên này chưa kiểm runtime phần đó |
| Một/nhiều/không hồ sơ | SubjectSwitcher viết lại theo dòng ngữ cảnh; vẫn kiểm empty CTA `/app/subjects` và không số 0 giả; thêm select nhiều hồ sơ và retry 500 | Không thấy mất contract empty CTA trong phần diff đã đọc; nhiều-hồ-sơ vẫn chỉ có bằng chứng test source, chưa có runtime trong phiên này |
| Chọn người trước điều hướng | SubjectsPage thêm test Xem sức khỏe và Thiết bị đặt `an:active-subject-id` đúng người trước chuyển route | Cần giữ contract này khi xây mới, tránh UI chọn đúng hàng nhưng API/SSE dùng người cũ |
| Hội thoại không lẫn hồ sơ | AssistantPage thêm test đổi select xóa hội thoại/câu hỏi; giữ các test reset cũ trong diff quan sát | Cần giữ cả phản hồi về muộn và dữ liệu nhạy cảm khi chuyển hồ sơ, không chỉ test text giao diện |
| Notifications redirect | Router thêm assertion `/app/notifications` chuyển `/app/alerts` | Chưa có bằng chứng runtime cho redirect này trong phiên khôi phục |
| Link lời mời sai định dạng | UI thực tế tái hiện F01 | Cần test token ngắn/422 riêng với 404, lỗi mạng và 5xx; không gộp mọi non-404 vào lỗi kết nối |
| Vùng bấm/overflow/CTA đầu màn | Các test v6 chủ yếu assertion DOM/copy; chưa thấy thêm browser regression v6 tương ứng trong phần diff đã đọc | Cần kiểm browser với 390, 360, chữ lớn và đo vùng bấm; không dùng jsdom để kết luận kích thước/render |

Không phát hiện assertion bị nới bất thường trong **phần đã đọc**, nhưng chưa hoàn tất audit mọi test và không thể kết luận toàn bộ suite giữ nguyên coverage. Không chạy lint/typecheck/unit/E2E/build vì đây là review chỉ đọc bị dừng giữa chừng; không chạy bộ E2E có khả năng mutation trên API dùng chung.

## 5. Thứ tự xử lý đề xuất cho thiết kế mới

1. **Chốt môi trường kiểm độc lập trước:** URL/hostname duy nhất, build/worktree fingerprint, cách login QA được phép; giữ API chỉ đọc. Tránh nhận nhầm ảnh bản cũ thành lỗi bản mới.
2. **Giữ contract nghiệp vụ khi thay UI:** chọn đúng hồ sơ trước điều hướng/SSE, không lẫn hội thoại, phân quyền, cảnh báo độc lập AI; tái sử dụng regression tests thay vì xóa theo component cũ.
3. **Sửa F01 ở lớp phân loại lỗi và F02 ở component tương tác dùng chung**, rồi mới lấy bằng chứng browser cho các màn mới. Review v7 phải bắt đầu lại ma trận chưa kiểm, không kế thừa trạng thái nghiệm thu từ báo cáo dang dở này.
