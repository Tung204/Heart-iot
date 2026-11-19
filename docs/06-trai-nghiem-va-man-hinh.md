# Trải nghiệm và màn hình

> **Baseline v0.1:** danh sách màn hình gốc chưa bao gồm đầy đủ AI Workspace, theo dõi tác vụ và preview cấu hình. Yêu cầu mới về [AI và preview frontend](11-nen-tang-ai-va-cau-hinh-dong.md) vẫn là định hướng; phần đã triển khai được ghi ở mục “Hiện trạng giao diện v7” bên dưới.

**Trạng thái 18/11/2026 (v7):** giao diện được xây lại từ nền tảng (token, primitive, shell, CSS theo feature), giữ nguyên nghiệp vụ và API. `/app` vẫn là **Hôm nay**, `/app/overview` là **Sức khỏe**, **nav chính 4 mục Hôm nay/Cảnh báo/Sức khỏe/Người thân** — không còn menu “Thêm”. Điều hướng, hành động, trạng thái rỗng/lỗi/mất quyền và nhãn dữ liệu mô phỏng được mô tả theo source hiện tại ở các mục dưới. **Chưa có mockup được duyệt bởi người dùng/giảng viên**, chưa triển khai PWA/native/Web Push và chưa kiểm khả dụng với người cao tuổi/người chăm sóc thật.

## Nguyên tắc trình bày

1. **Một màn một mục đích.** Mỗi trang trả lời một câu hỏi và có một hành động chính; chi tiết số liệu nằm ở trang chuyên biệt (Sức khỏe, Lịch sử đo), không lặp trên màn đầu.
2. **Tín hiệu trước số liệu.** Việc cần làm (cảnh báo đang mở, thiết bị mất kết nối, thiếu quyền) đứng trước biểu đồ và tổng hợp.
3. **Quyền là trạng thái, không phải lỗi.** Thiếu `canViewMeasurements`/`canReceiveAlerts` hiển thị câu nghiệp vụ và không gọi API bị cấm; không hiện số 0 giả và không mời thử lại vô ích.
4. **Ngôn ngữ sản phẩm.** Không dùng “bản demo/đồ án/giảng viên/nghiệm thu” trong text, metadata hay `aria-label` của web; chỉ giữ nhãn nguồn dữ liệu mô phỏng ở nơi có số liệu.

## Khung ứng dụng (`AppShell`)

| Thành phần | Desktop (≥1024px) | Hẹp (<1024px) |
| --- | --- | --- |
| Điều hướng | Rail xanh mực 216px, 4 mục có icon ở trên | Topbar gọn + thanh dưới 4 mục có icon |
| Tài khoản | Avatar ở cuối rail | Avatar ở topbar |
| Nội dung | Cột nội dung trong `main` có `tabIndex=-1`, tự focus sau khi đổi trang | Cùng khung, chừa chỗ cho thanh dưới |

- **Bốn mục điều hướng:** Hôm nay (`/app`), Cảnh báo (`/app/alerts`), Sức khỏe (`/app/overview`), Người thân (`/app/subjects`). Trạng thái active do một nguồn duy nhất quyết định (`routeScope`): `/app/history` sáng mục **Sức khỏe**, `/app/devices` và `/app/subjects/:id/share` sáng mục **Người thân**. Không có mục thứ năm hoặc menu phụ.
- **Badge trên mục Cảnh báo** là **số cảnh báo đang mở của hồ sơ đang xem** (không phải số thông báo chưa đọc). Danh sách tải tối đa 20, còn trang sau thì hiện `20+`; trình đọc màn hình đọc câu “N cảnh báo đang mở”, con số chỉ là phần nhìn.
- **Admin không có hồ sơ:** nav chỉ còn một mục **Quản trị** để không dẫn vào các trang sức khỏe sẽ 404.
- **Dòng ngữ cảnh hồ sơ** đặt **trên H1**, một dòng compact, chỉ ở **5 loại trang**: Hôm nay (kể cả alias `/app/assistant`), danh sách Cảnh báo, Sức khỏe, Lịch sử đo, Thiết bị. Một hồ sơ → “Theo dõi: {tên}” kèm chip “Người thân” nếu là caregiver; nhiều hồ sơ → `select` cao ≥44px có nhãn “Người được theo dõi”. Chi tiết cảnh báo và Chia sẻ và liên hệ tự render dòng đó theo id trong URL/API (`pinned`); Người thân và Công việc dùng câu mô tả phạm vi danh sách (`collection`); hộp thông báo, Tài khoản, Quản trị, Studio và 404 trong khung không có dòng này (Studio chỉ có breadcrumb “Về Hôm nay › Studio › {tên view}”).
- **Menu tài khoản ở avatar:** tên + vai trò (không hiện email), mục **Tài khoản** → `/app/settings`, mục **Quản trị** chỉ với admin, công tắc chữ lớn `Aa`, và **Đăng xuất** có hỏi lại. **Không có link Studio trong menu.** Menu đóng bằng `Escape`, click ngoài hoặc mất focus; điều hướng bằng mũi tên/Home/End.
- **Banner trong khung:** “Có thông báo mới cho hồ sơ …” (`role=status`, có “Xem thông báo” mở đúng incident và “Đóng”), “Mất cập nhật trực tiếp — đang thử lại” khi SSE rớt, và banner thu hồi quyền (`role=alert`) kèm việc dọn dữ liệu hồ sơ khỏi màn hình.
- Có liên kết bỏ qua nội dung, focus-visible rõ, trạng thái không chỉ dựa vào màu, và tôn trọng `prefers-reduced-motion`.

## Sơ đồ route

| Route | Màn hình | Mục đích | Ngữ cảnh hồ sơ |
| --- | --- | --- | --- |
| `/` | Trang chủ công khai | Sản phẩm làm gì, đường vào đăng nhập/đăng ký | — |
| `/login`, `/register` | Đăng nhập / Đăng ký | Vào hệ thống, hiện lỗi theo trường | — |
| `/invite/:token` | Lời mời chia sẻ | Xem lời mời, đăng nhập/đăng ký nếu cần, chấp nhận quyền | Ghim theo token |
| `*` (ngoài `/app`) | 404 công khai | Báo đường dẫn sai và đường về | — |
| `/app`, `/app/assistant` | Hôm nay | Một câu trạng thái, hành động chính, ô hỏi trợ lý | Chọn từ danh sách |
| `/app/alerts` | Cảnh báo | Danh sách cảnh báo đang mở/đã đóng | Chọn từ danh sách |
| `/app/alerts?view=notifications` | Hộp thông báo | Thông báo trong ứng dụng của toàn tài khoản | Không có |
| `/app/alerts/:id` | Chi tiết cảnh báo | Xác nhận/đóng, gọi liên hệ khẩn cấp | Ghim theo id |
| `/app/overview` | Sức khỏe | Tổng hợp hôm nay, xu hướng 7/14/30 ngày | Chọn từ danh sách |
| `/app/history` | Lịch sử đo | Chuỗi đo theo khoảng, khoảng thiếu, CSV | Chọn từ danh sách |
| `/app/subjects` | Người thân | Danh sách hồ sơ có quyền, tạo/sửa, lưu trữ | Danh sách nhiều hồ sơ |
| `/app/subjects/:id/share` | Chia sẻ và liên hệ | Mời/thu hồi quyền, liên hệ khẩn cấp | Ghim theo id |
| `/app/devices` | Thiết bị | Kết nối, pin, gắn/gỡ thiết bị | Chọn từ danh sách |
| `/app/tasks` | Công việc bảo trì | Việc đang mở/đã đóng, tạo và đóng việc | Danh sách nhiều hồ sơ |
| `/app/settings` | Tài khoản | Tên hiển thị, mật khẩu, phiên đăng nhập | Không có |
| `/app/admin` | Quản trị | 5 mục: Tổng quan/Người dùng/Thiết bị/Chính sách/Nhật ký | Không có |
| `/app/studio`, `/app/studio/:id`, `/app/studio/:id/data` | Studio | Danh sách view, soạn → xem trước → công bố, dữ liệu đã công bố | Không có (chỉ breadcrumb) |
| `/app/*` | 404 trong khung | Báo route sai, giữ nav và menu tài khoản | Không có |

`/app/notifications` (đường dẫn cũ) chuyển tiếp sang `/app/alerts?view=notifications` để không mất khả năng đọc thông báo.

## Từng màn hình

### Công khai và vào hệ thống

- **Trang chủ `/`:** một câu giá trị + đường vào chính (Tạo tài khoản/Đăng nhập, hoặc “Mở ứng dụng” khi đã có phiên), sơ đồ ngắn “thiết bị → người hỗ trợ → trợ lý”, ba dòng giải thích và dòng giới hạn bốn ý (dữ liệu mô phỏng, cảnh báo chỉ hiện khi web đang kết nối, không tự gọi cấp cứu, không thay thế cấp cứu). Đang kiểm phiên thì chỉ báo tải để CTA không nhấp nháy; không kiểm được phiên thì vẫn giữ đường vào và cho thử lại.
- **Đăng nhập `/login`, đăng ký `/register`:** một thẻ, lỗi theo trường, thông báo lỗi được focus để trình đọc màn hình đọc ngay. Không còn khối tự điền tài khoản demo.
- **Lời mời `/invite/:token`:** hiển thị người mời, hồ sơ và quyền sẽ nhận; token sai/thiếu/hết hạn có câu riêng (không gộp thành “lỗi kết nối”); khách được mời đăng nhập/đăng ký rồi quay lại chấp nhận.
- **404 công khai:** một H1 “Không tìm thấy trang”, gợi ý kiểm tra link lời mời và một đường về trang chủ.

### Hôm nay — `/app`

- H1 “Hôm nay”. Dải trạng thái (`aria-label="Trạng thái hôm nay"`) nêu **một** việc cần làm trước: cảnh báo đang mở (kèm “Xem cảnh báo”/Gọi liên hệ), thiết bị ngoại tuyến (kèm “Kiểm tra thiết bị”), hoặc tín hiệu an toàn khi mọi thứ bình thường. Có thể có một dòng phụ cho tín hiệu thứ hai (ví dụ thiết bị mất kết nối trong khi dải chính là cảnh báo).
- Khối **“Hỏi trợ lý AI”** với nhãn “Câu hỏi về {tên hồ sơ}”, composer + nút Gửi và 3 gợi ý (Nhịp tim tuần này / Cảnh báo đang mở / Pin thiết bị). Bấm gợi ý chỉ điền câu hỏi, không tự gửi. Hội thoại chỉ xuất hiện sau lượt hỏi đầu tiên.
- Mỗi câu trả lời mang badge nguồn (**AI** hoặc **Tóm tắt theo mẫu** khi chưa cấu hình provider), nhãn “Dữ liệu mô phỏng” khi số liệu là tổng hợp, disclaimer, và danh sách nguồn số liệu kèm thời điểm.
- Thiếu quyền xem số đo → 403 hiển thị trạng thái quyền và khóa gửi; `RATE_LIMITED` có câu riêng; lỗi khác hiện thông điệp kèm nút thử lại của form. Đổi hồ sơ xóa hội thoại cũ và bỏ phản hồi về muộn.
- Cuối trang: link “Sức khỏe 7 ngày →” và dòng giới hạn “Dữ liệu mô phỏng · không thay thế cấp cứu.”

### Cảnh báo — `/app/alerts` và hộp thông báo

- H1 “Cảnh báo” + câu “Cảnh báo chỉ cập nhật khi ứng dụng đang mở.” Hai tab dạng liên kết: **Cảnh báo** và **Thông báo đã nhận** (kèm số chưa đọc, đọc được bằng trình đọc màn hình).
- Tab cảnh báo lọc **Đang mở / Đã đóng**; mỗi hàng mở chi tiết. Ứng viên quá hạn hiện “Chưa xác định”, không tự chuyển thành an toàn.
- **Hộp thông báo `?view=notifications`:** phạm vi **toàn tài khoản**, gộp mọi hồ sơ người xem có quyền nhận cảnh báo. Thao tác duy nhất ở đây là **đánh dấu đã đọc** (tối ưu trước, hoàn lại nếu lỗi); **không** xác nhận/đóng cảnh báo, không phải tab “Đã đóng”. Mỗi hàng mở đúng `incidentId` của thông báo, không dùng hồ sơ đang chọn. Chưa đọc/đã đọc phân biệt bằng chữ, không chỉ bằng chấm màu.
- Thiếu `canReceiveAlerts` → câu nghiệp vụ thay cho danh sách, không gọi API cảnh báo.

### Chi tiết cảnh báo — `/app/alerts/:id`

- Trạng thái, loại sự kiện, mốc thời gian (giờ xảy ra và giờ nhận nếu khác nhau), người đã xác nhận và lịch sử thao tác.
- **Liên hệ khẩn cấp đứng trước thao tác đổi trạng thái** trong cây DOM để nút Gọi thấy được trong viewport đầu trên mobile; số có `tel:`.
- “Tôi đang hỗ trợ” (xác nhận) và “Đóng cảnh báo” (nhập lý do) gửi kèm `expectedVersion`; 409 hiện thông báo “Cảnh báo đã thay đổi ở nơi khác” và tải lại, không tự ghi đè.
- Ghi chú khi cảnh báo bắt đầu trước mốc chia sẻ quyền: không lộ lịch sử trước mốc.

### Sức khỏe — `/app/overview`

- H1 “Sức khỏe” kèm đường sang **Lịch sử đo**; thứ tự nội dung: cảnh báo đang mở (vùng độc lập, không chờ số liệu) → tổng hợp hôm nay (nhịp tim, bước chân, độ phủ) → xu hướng 7/14/30 ngày → kết nối thiết bị.
- Nhãn “Nguồn: dữ liệu mô phỏng” đặt cạnh khối số liệu; ngày thiếu hiển thị “—” thay vì cột 0. Phân biệt `offline` (theo `lastSeenAt`) và “chưa cập nhật gần đây” (theo `lastMeasuredAt`), không gọi trạng thái thứ hai là ngoại tuyến.
- Thiếu quyền số đo: “Chủ hồ sơ không chia sẻ số đo” và vẫn hiện cảnh báo nếu có `canReceiveAlerts`.

### Lịch sử đo — `/app/history`

- H1 “Lịch sử đo”, khoảng 24 giờ/7 ngày/30 ngày (bị cắt theo cửa sổ chia sẻ). Biểu đồ cuộn ngang có nhãn ngày khi khoảng xem dài hơn 12 giờ và chú giải khoảng thiếu bằng chữ.
- Bảng trên máy tính, thẻ trên điện thoại; “Hiện thêm” 50 dòng mỗi bước, dừng ở trần 400 dòng và chỉ dẫn CSV cho phần còn lại; không có nút “hiện tất cả” gây treo main thread.
- Dòng “Dữ liệu hiển thị là dữ liệu mô phỏng.” Nút CSV chỉ có khi có `canViewMeasurements`; thiếu quyền thì trang không gọi API số đo.

### Người thân — `/app/subjects`

- H1 “Người thân”. Danh sách hồ sơ người xem có quyền, ghi rõ vai trò (Chủ hồ sơ/Người thân xem hộ) và quyền bằng chữ (“xem số đo N ngày”, “nhận cảnh báo”, …).
- Mỗi hàng có đường sang **Xem sức khỏe**, **Thiết bị**, và **Chia sẻ và liên hệ** (chỉ chủ hồ sơ). Trang cũng là nơi tạo/sửa hồ sơ và có link sang **Công việc**.
- **Vùng nguy hiểm:** “Lưu trữ hồ sơ” và “Yêu cầu xóa dữ liệu”, cả hai yêu cầu nhập lại tên hồ sơ. Lưu trữ nói rõ thu hồi chia sẻ nhưng **không xóa** số đo/cảnh báo; yêu cầu xóa trả trạng thái “đã ghi nhận”, không hứa xóa ngay.

### Chia sẻ và liên hệ — `/app/subjects/:id/share`

- Chỉ chủ hồ sơ mở được; trang xác minh quyền **trước** khi gọi API lời mời/liên kết chia sẻ.
- Mời người thân bằng email với các quyền độc lập (xem số đo + số ngày lịch sử, nhận cảnh báo, xác nhận, đóng, xem AI) và hạn lời mời. `acceptUrl`/token chỉ hiện **một lần** ngay sau khi tạo, có nút ẩn và cảnh báo không xem lại được.
- Danh sách người nhận ghi rõ quyền bằng chữ; thu hồi có xác nhận đúng người và cảnh báo bản CSV đã tải không thu hồi được.
- **Liên hệ khẩn cấp:** tối đa 5, chọn một liên hệ chính; chủ hồ sơ thêm/sửa/xóa, caregiver có quyền nhận cảnh báo chỉ đọc.

### Thiết bị — `/app/devices`

- H1 “Thiết bị”. Trạng thái kết nối, lần nhận dữ liệu cuối, pin (khi có) và hồ sơ đang gắn; nhịp tim chỉ hiện khi có quyền xem số đo.
- Chủ hồ sơ gắn thiết bị bằng mã dùng một lần và gỡ thiết bị (có xác nhận). Gắn thành công chỉ báo “Đã gắn thiết bị”, **không** hứa thiết bị đã trực tuyến.
- Link sang **Công việc** để tạo/đóng việc bảo trì cho thiết bị đang gắn.

### Công việc bảo trì — `/app/tasks`

- H1 “Công việc bảo trì”, phạm vi **toàn tài khoản** theo quyền hồ sơ (không phải chỉ hồ sơ đang chọn). Lọc Đang mở/Đã đóng.
- Chủ hồ sơ tạo việc cho thiết bị **đang gắn** (loại, ưu tiên, hạn xử lý, ghi chú); caregiver không thấy nút tạo, chỉ xem và đóng nếu có quyền. Đóng việc bắt buộc nhập lý do.

### Tài khoản — `/app/settings`

- H1 “Tài khoản”, ba khối: **Tên của bạn**, **Mật khẩu**, **Phiên đăng nhập**. Tài khoản đăng nhập và người được theo dõi là hai thực thể khác nhau nên trang này không có dòng ngữ cảnh hồ sơ và không hiện dữ liệu sức khỏe.
- Phiên hiện tại có nhãn “Thiết bị này”; phiên khác thu hồi được (có xác nhận). Đổi mật khẩu giữ phiên hiện tại và thu hồi phiên khác.

### Quản trị — `/app/admin`

- H1 “Quản trị”, **5 mục**: Tổng quan, Người dùng, Thiết bị, Chính sách, Nhật ký. Chỉ tài khoản admin mở được; không có ngữ cảnh hồ sơ và không mặc định hiện dữ liệu sức khỏe.
- **Tổng quan:** KPI số tài khoản, hồ sơ, thiết bị, cảnh báo đang mở, công việc đang mở, thông báo, cùng đường sang Công việc.
- **Người dùng:** tìm theo email hoặc tên hiển thị, tạm khóa hoặc kích hoạt lại tài khoản (khóa sẽ thu hồi phiên và đóng stream).
- **Thiết bị:** danh sách metadata, trạng thái kết nối, hồ sơ đang gắn; “Tạo mã gắn thiết bị” bị khóa khi thiết bị đang gắn hồ sơ; “Đổi khóa thiết bị” có xác nhận và nói rõ không hoàn tác. Mã/khóa chỉ hiện **một lần**, có cảnh báo không chia sẻ qua email/ảnh chụp và nút “Tôi đã lưu, ẩn đi”. **Chưa có form tạo thiết bị mới** — việc tạo vẫn qua API admin.
- **Chính sách:** xem policy `device_runtime`, soạn giá trị, **kiểm tra** rồi **phát hành** theo `baseRevision + digest`; lỗi/khác bản trên máy chủ hiện trong viewport.
- **Nhật ký:** bảng audit có lọc, panel chi tiết ngoài vùng cuộn và dạng thẻ trên mobile.

### Studio — `/app/studio`

- **Đi vào bằng đường dẫn trực tiếp** (không có mục trong menu người dùng); breadcrumb “Về Hôm nay” và “Studio”.
- `/app/studio`: danh sách view theo phạm vi cá nhân/hồ sơ/toàn hệ thống, tạo view mới (key, tên, phạm vi).
- `/app/studio/:id`: ba bước **1. Cấu hình → 2. Xem trước → 3. Công bố**, kèm lịch sử công bố và rollback. Nút công bố chỉ bật sau khi xem trước thành công và draft không đổi so với bản đã xem; rollback tạo bản công bố **mới** chứa config cũ, không sửa lịch sử.
- `/app/studio/:id/data`: dữ liệu của bản đã công bố, tôn trọng mốc chia sẻ/quyền cảnh báo; nhãn “Dữ liệu mô phỏng” khi nguồn là tổng hợp.

### 404 trong khung — `/app/*`

- `EmptyState` “Không tìm thấy trang” với đường về tổng quan; nav, menu tài khoản và banner vẫn hoạt động vì nằm trong shell.

## Dữ liệu mô phỏng hiển thị ở đâu

Dữ liệu telemetry trong demo là tổng hợp (`source=simulator`, `is_synthetic=true`), không phải đo từ người thật. Nhãn xuất hiện ở: dòng giới hạn trên trang chủ, Hôm nay, đăng nhập/đăng ký/lời mời và 404 công khai; chip “Nguồn: dữ liệu mô phỏng” ở Sức khỏe; dòng “Dữ liệu hiển thị là dữ liệu mô phỏng.” ở Lịch sử đo; nhãn trong câu trả lời trợ lý và trong Studio. Không dùng tên hoặc ảnh bệnh nhân thật trong demo.

## Luồng chính

**Thiết lập:** tạo tài khoản → tạo hồ sơ → gắn thiết bị bằng mã dùng một lần → nhận dữ liệu thử → mời người thân → người thân chấp nhận quyền. Người thân không mặc định truy cập dữ liệu trước ngày chia sẻ.

**Cảnh báo:** thiết bị báo nghi ngã và cho hủy → confirmed → cảnh báo hiện trên Hôm nay/Sức khỏe và trong hộp thông báo → người có quyền chọn “Tôi đang hỗ trợ” → gọi liên hệ khẩn cấp → đóng cảnh báo kèm lý do. Nếu người khác đã xác nhận, UI vẫn cho phối hợp nhưng hiển thị rõ người nhận đầu và lịch sử; API xử lý cạnh tranh trạng thái (409).

**Thu hồi chia sẻ:** chủ hồ sơ thu hồi → người thân mất quyền đọc API/AI/export và stream đang mở → thông báo chưa gửi bị hủy → giao diện xóa dữ liệu nhạy cảm khỏi bộ nhớ hiển thị và điều hướng an toàn. Không chỉ ẩn một nút menu.

**Gỡ thiết bị:** chủ hồ sơ gỡ → assignment đóng tại thời điểm gỡ, dữ liệu cũ vẫn thuộc hồ sơ cũ; mẫu sau đó không gán sang chủ mới.

## Trạng thái phải thiết kế

| Trạng thái | Cách thể hiện |
| --- | --- |
| Chưa từng có dữ liệu | “Chưa nhận dữ liệu từ thiết bị”, gợi ý kiểm kết nối |
| Tín hiệu kém/không đeo | Không hiển thị BPM không hợp lệ; nêu chất lượng và thời điểm đo cuối hợp lệ |
| Mất mạng/offline | Nhãn offline và “lần nhận cuối”; không hiển thị màu bình thường dựa trên số cũ |
| Pin chưa biết | “Chưa có thông tin pin”, không mặc định đầy |
| Nhận cảnh báo trễ | Hiển thị giờ xảy ra nếu biết và giờ nhận; nêu chưa rõ tình trạng hiện tại |
| Candidate thiếu kết quả | “Chưa xác định” trong tab Đã đóng; giữ trong lịch sử kỹ thuật, không tự chuyển thành an toàn |
| Cảnh báo bắt đầu trước mốc chia sẻ | Hiển thị trạng thái an toàn hiện tại kèm ghi chú “Bắt đầu trước khi bạn được chia sẻ quyền”; không lộ lịch sử trước mốc |
| Kênh thông báo lỗi | Hộp cảnh báo vẫn lưu; badge cảnh báo đang mở và banner thông báo mới là tín hiệu trong ứng dụng, chưa hiển thị trạng thái gửi/đang thử/hết lượt của kênh ngoài |
| Không được chia sẻ số đo | Sức khỏe/Lịch sử hiện “Chủ hồ sơ không chia sẻ số đo”; cảnh báo vẫn hiển thị nếu có `canReceiveAlerts`; không hiện số 0 giả |
| AI lỗi hoặc bị tắt | Chỉ số và cảnh báo vẫn dùng được; cung cấp tóm tắt theo mẫu nếu đủ dữ liệu |

## Dễ sử dụng và quyền riêng tư

Nút hủy/SOS trên thiết bị cần thao tác dễ phân biệt. Giao diện dùng chữ rõ, nhãn có nghĩa, không dùng màu là tín hiệu duy nhất, điều hướng bàn phím và bố cục thích ứng. Cần thử nhiệm vụ thực tế để kết luận phù hợp với người cao tuổi; không coi thiết kế đẹp là bằng chứng sử dụng tốt.

Thông báo ở màn hình khóa chỉ chứa nội dung tối thiểu theo lựa chọn chia sẻ, không đưa toàn bộ chỉ số sức khỏe. Nếu thêm Web Push, xin quyền tại thời điểm người dùng chọn nhận thông báo và kiểm chính nền tảng mục tiêu. Chưa có bằng chứng app đóng vẫn nhận được thông báo.

## Hiện trạng giao diện v7 — bằng chứng

Ảnh và số đo hành vi do từng lane chụp trên web đang chạy với API cục bộ + seed demo, lưu **trong repo** để người khác kiểm lại:

| Nhóm màn | Thư mục | Nội dung |
| --- | --- | --- |
| Khung, công khai, tài khoản, Người thân, Thiết bị | `reports/qa/evidence/v7-foundation/` | ảnh 1280×900, 390×844, 360×740, chữ lớn; `shell-behavior.json` (nav active, context trên H1, menu tài khoản không có Studio); `css-ledger.md` |
| Công khai, đăng nhập/đăng ký, lời mời, 404 | `reports/qa/evidence/v7-p/` | ảnh guest/đã đăng nhập/lỗi trường/token lời mời sai; `states.json` |
| Hôm nay, Cảnh báo, hộp thông báo, chi tiết cảnh báo, trợ lý | `reports/qa/evidence/v7-c/` | ảnh 4 cỡ; `behaviour.json` (tab inbox, mark-read, URL sau reload) |
| Sức khỏe, Lịch sử đo | `reports/qa/evidence/v7-h/` | ảnh 24 giờ/30 ngày, 4 cỡ chữ |
| Người thân, Chia sẻ và liên hệ, Thiết bị, Công việc, Tài khoản | `reports/qa/evidence/v7-r/` | ảnh 4 cỡ + ảnh trạng thái xác nhận/thu hồi/tạo form |
| Quản trị, Studio | `reports/qa/evidence/v7-a/` | ảnh 5 tab quản trị và 3 trang Studio, 4 cỡ chữ |

Ảnh chứng minh bố cục tại thời điểm chụp, **không** thay cho kiểm khả dụng với người cao tuổi/người chăm sóc thật, kiểm Firefox/WebKit, thiết bị thật hay AI provider thật.

## Lịch sử giao diện trước v7

Các vòng v2 (thêm cài đặt tài khoản, xu hướng, liên hệ khẩn cấp), v3 (trợ lý là trung tâm) và v4 (IA đơn giản, nav 4 mục có menu “Thêm”) đã bị **v7 thay thế**: v7 giữ nguyên nghiệp vụ nhưng thay nền tảng trình bày, bỏ menu “Thêm”, đưa **Sức khỏe** vào nav chính và trả hộp thông báo về đúng chỗ. Nhật ký thay đổi và bằng chứng của từng vòng nằm ở [chương 14](14-ke-hoach-trien-khai-phan-mem.md), không lặp lại ở đây.

## Phần chỉ là mô phỏng hoặc chưa có

- Toàn bộ telemetry/nhịp tim/bước chân trong demo là dữ liệu tổng hợp, không phải đo từ người thật.
- Không có firmware ESP32, cảm biến, BOM hay số liệu độ chính xác té ngã; các màn hình cảnh báo chỉ phản ánh sự kiện do simulator gửi.
- Không có Web Push/PWA/native hay thông báo khi đóng trình duyệt; cảnh báo chỉ cập nhật khi trang đang mở và còn kết nối.
- Không có dịch vụ AI mặc định; khi chưa cấu hình provider, trợ lý trả tóm tắt theo mẫu và ghi rõ là fallback.
- Không có xóa cứng/retention, không có màn hình xem vùng cách ly ingest, không có form tạo thiết bị trong quản trị, không có báo cáo PDF (đã đưa vào kế hoạch mở rộng `FR-16`, chưa triển khai) và chưa có kiểm khả dụng với người cao tuổi.
