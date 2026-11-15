# Trải nghiệm và màn hình

> **Baseline v0.1:** danh sách màn hình gốc chưa bao gồm đầy đủ AI Workspace, theo dõi tác vụ và preview cấu hình. Yêu cầu mới về [AI và preview frontend](11-nen-tang-ai-va-cau-hinh-dong.md) vẫn là định hướng; phần đã triển khai được ghi ở mục “Hiện trạng giao diện v2” bên dưới.

**Trạng thái 15/11/2026:** web responsive đã chạy trên dữ liệu tổng hợp, có route cho các màn hình nghiệp vụ và Studio. **Chưa có mockup được duyệt**, chưa triển khai PWA/native/Web Push và chưa kiểm khả dụng với người cao tuổi/người chăm sóc thật.

## Sơ đồ trang

| Khu vực | Màn hình | Thông tin/hành động chính |
| --- | --- | --- |
| Công khai | Trang chủ, giới thiệu sản phẩm | Hệ thống làm gì, phạm vi prototype, đăng nhập/đăng ký |
| Tài khoản | Đăng ký, đăng nhập, hồ sơ, cài đặt tài khoản | Phiên đăng nhập; đổi tên/mật khẩu; xem/thu hồi phiên |
| Thiết lập | Gắn thiết bị, kết nối, mời người thân, liên hệ khẩn cấp | Trạng thái từng bước; không hoàn tất giả khi thiết bị chưa online |
| Người được theo dõi | Tổng quan | Tình trạng thiết bị, nhịp tim mới nhất, vận động, cảnh báo đang mở, xu hướng 7/14/30 ngày |
| Người thân | Danh sách hồ sơ được chia sẻ | Hồ sơ, quyền, cảnh báo đang mở; không mặc định thấy dữ liệu trước mốc chia sẻ |
| Chi tiết hồ sơ | Biểu đồ và lịch sử | Khoảng thời gian, chất lượng, đoạn thiếu, lịch sử incident, tải CSV |
| Cảnh báo | Chi tiết sự kiện | Nghi ngã/chưa xác định/xác nhận/nhận trễ; ai đang hỗ trợ; xác nhận/đóng; liên hệ khẩn cấp |
| AI | Tóm tắt và câu hỏi giới hạn | Khoảng dữ liệu, độ phủ, khoảng thiếu, nguồn mô phỏng và khả năng không trả lời |
| Chia sẻ | Người thân và quyền | Mời, chấp nhận, khoảng lịch sử, quyền xem số đo/CSV, thu hồi |
| Việc bảo trì | Danh sách và tạo việc | Thiết bị đang gắn, hạn xử lý, lý do đóng; caregiver chỉ xem |
| Admin | Tình trạng hệ thống, người dùng, thiết bị, policy, audit | Thiết bị online/offline, cấp mã/xoay khóa, lỗi outbox; audit đã lọc |
| Studio | Workspace view | Draft → preview chỉ đọc → publish → rollback; dữ liệu theo quyền/mốc chia sẻ |

## Bố cục tổng quan đề xuất

```text
[Người đang được theo dõi]             [Quản lý chia sẻ]
[Cảnh báo đang mở — người phụ trách / Chưa có người xác nhận]

[Thiết bị: Online / Offline]           [Dữ liệu cập nhật lúc ...]
[Nhịp tim: ... bpm + chất lượng]       [Vận động hôm nay + độ phủ]

[Biểu đồ — phân biệt rõ những khoảng không có dữ liệu]
[Tóm tắt ngày — dữ liệu dùng, dữ liệu thiếu, nguồn khi cần]
```

Ưu tiên sự kiện cần hành động và độ mới của dữ liệu trước biểu đồ trang trí. Số liệu tổng hợp từ simulator phải có nhãn “Dữ liệu mô phỏng”. Không dùng tên hoặc ảnh bệnh nhân thật trong demo.

## Luồng chính

**Thiết lập:** tạo tài khoản → xác lập hồ sơ → claim thiết bị bằng bằng chứng dùng một lần → nhận dữ liệu thử → mời người thân → người thân chấp nhận quyền. Người thân không mặc định truy cập toàn bộ dữ liệu trước ngày chia sẻ.

**Cảnh báo:** thiết bị báo nghi ngã và cho hủy → confirmed → dashboard người thân hiện cảnh báo → chọn “Tôi đang hỗ trợ” → liên hệ thủ công → kết thúc với lý do. Nếu một người khác đã xác nhận, UI vẫn cho người có quyền phối hợp nhưng hiển thị rõ người nhận đầu và lịch sử; API xử lý cạnh tranh trạng thái.

**Thu hồi chia sẻ:** chủ hồ sơ thu hồi → người thân mất quyền đọc API/AI/export và stream đang mở → thông báo chưa gửi bị hủy → giao diện người thân xóa dữ liệu nhạy cảm khỏi bộ nhớ hiển thị. Không chỉ ẩn một nút menu.

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
| Kênh thông báo lỗi | Hộp cảnh báo vẫn lưu; badge/banner chỉ báo thông báo mới, chưa hiển thị đầy đủ trạng thái gửi/đang thử/hết lượt trong UI |
| Không được chia sẻ số đo | Dashboard/lịch sử hiện “Chủ hồ sơ không chia sẻ số đo”; cảnh báo vẫn hiển thị nếu có `canReceiveAlerts`; không hiện số 0 giả |
| AI lỗi hoặc bị tắt | Chỉ số và cảnh báo vẫn dùng được; cung cấp tóm tắt theo mẫu nếu đủ dữ liệu |

## Dễ sử dụng và quyền riêng tư

Nút hủy/SOS trên thiết bị cần thao tác dễ phân biệt. Giao diện dùng chữ rõ, nhãn có nghĩa, không dùng màu là tín hiệu duy nhất, điều hướng bàn phím và bố cục thích ứng. Cần thử nhiệm vụ thực tế để kết luận phù hợp với người cao tuổi; không coi thiết kế đẹp là bằng chứng sử dụng tốt.

Thông báo ở màn hình khóa chỉ chứa nội dung tối thiểu theo lựa chọn chia sẻ, không đưa toàn bộ chỉ số sức khỏe. Nếu thêm Web Push, xin quyền tại thời điểm người dùng chọn nhận thông báo và kiểm chính nền tảng mục tiêu. Chưa có bằng chứng app đóng vẫn nhận được thông báo.

## Hiện trạng giao diện v2 (15/11/2026)

Các màn hình dưới đây đã có trong code và test component; dữ liệu hiển thị là **tổng hợp/mô phỏng**, không phải người thật. Đây là kiểm giao diện kỹ thuật, **chưa thay thế** kiểm khả dụng với người cao tuổi/người chăm sóc thật.

- **Tổng quan:** ưu tiên cảnh báo đang mở trước số liệu; card “Xu hướng gần đây” chọn 7/14/30 ngày, hiển thị nhịp tim trung bình, tổng bước, số ngày có dữ liệu, độ phủ, cảnh báo trong kỳ. Ngày thiếu hiển thị “—” (không vẽ cột 0), có chip “Dữ liệu mô phỏng” và câu “Chỉ để theo dõi, không thay thế tư vấn y tế.”
- **Cài đặt tài khoản (`/app/settings`):** ba khối Hồ sơ, Mật khẩu, Phiên đăng nhập. Phiên hiện tại có nhãn “Thiết bị này”; phiên khác thu hồi được; đổi mật khẩu giữ phiên hiện tại và thu hồi phiên khác.
- **Lịch sử:** bảng 20 dòng kèm tải thêm trên máy tính, thẻ dữ liệu trên điện thoại; biểu đồ cuộn ngang, có nhãn ngày khi khoảng xem dài hơn 12 giờ và chú giải khoảng thiếu dữ liệu bằng chữ. Khi không có `canViewMeasurements`, trang hiện “Chủ hồ sơ không chia sẻ số đo”, không gọi API số đo và không có nút CSV.
- **Chia sẻ:** checkbox “Cho phép xem số đo và lịch sử” mặc định bật; tắt thì ô số ngày lịch sử bị vô hiệu hóa và payload gửi `canViewMeasurements:false`; danh sách người nhận ghi rõ “không xem số đo” hoặc “xem số đo N ngày”. Có cảnh báo bản CSV đã tải không thu hồi được.
- **Liên hệ khẩn cấp:** quản lý trong trang chia sẻ (tối đa 5, chọn liên hệ chính); chi tiết cảnh báo hiển thị liên hệ kèm `tel:`. Chỉ chủ hồ sơ thấy nút thêm/sửa/xóa; caregiver có quyền nhận cảnh báo chỉ đọc.
- **Cảnh báo:** tab Đang mở/Đã đóng; “Chưa xác định” cho ứng viên quá hạn; ghi chú cảnh báo bắt đầu trước mốc chia sẻ; ack/resolve có xử lý 409 và thông báo lỗi; badge chưa đọc trên sidebar/menu “Thêm”, banner “Có thông báo mới cho hồ sơ …”, banner “Mất cập nhật trực tiếp — đang thử lại”.
- **Hồ sơ:** nút Lưu trữ hồ sơ và Yêu cầu xóa dữ liệu trong vùng nguy hiểm; cả hai yêu cầu nhập lại tên hồ sơ. Lưu trữ nói rõ không xóa số đo/cảnh báo; yêu cầu xóa trả trạng thái “đã ghi nhận”, không hứa xóa ngay.
- **Công việc:** chủ hồ sơ có nút “Tạo việc” cho thiết bị đang gắn, chọn loại/ưu tiên/hạn/ghi chú; caregiver không thấy nút tạo, chỉ xem và đóng nếu có quyền.
- **Quản trị:** 5 mục Tổng quan/Người dùng/Thiết bị/Chính sách thiết bị/Audit. Tab Thiết bị có danh sách, trạng thái kết nối, hồ sơ đang gắn, cấp mã gắn và xoay khóa; mã/khóa chỉ hiện một lần, có cảnh báo sao chép. **Chưa có form tạo thiết bị mới** — việc tạo vẫn qua API admin.
- **Studio:** danh sách view, soạn draft, preview chỉ đọc (dữ liệu mẫu hoặc hồ sơ có quyền), publish có CAS, lịch sử publication và rollback tạo bản mới. Nút publish chỉ bật sau preview thành công và draft không đổi.
- **Điều hướng và tiếp cận:** thanh dưới 5 mục chính, mục phụ trong “Thêm”; có liên kết bỏ qua nội dung, focus-visible, trạng thái không chỉ dựa vào màu, chữ lớn và giảm chuyển động theo `prefers-reduced-motion`. Các thay đổi v2 có test component cho Settings, Insights, Contacts, Subjects archive, Admin devices, Tasks, AppShell.

**Bằng chứng hình ảnh:** phiên kiểm giao diện trước đó ghi ảnh ngoài repo tại `C:\tmp\ui-final` (worklog `reports/worklog/2026-11-15.md`); repo chưa có artifact nên người khác không tự kiểm lại được. Lần chạy tài liệu này **không** chụp lại toàn bộ màn hình; không dùng mô tả trên thay cho kiểm trực quan mới.

## Phần chỉ là mô phỏng hoặc chưa có

- Toàn bộ telemetry/nhịp tim/bước chân trong demo là dữ liệu tổng hợp, gắn `source=synthetic/simulator`, không phải đo từ người thật.
- Không có firmware ESP32, cảm biến, BOM hay số liệu độ chính xác té ngã; các màn hình cảnh báo chỉ phản ánh sự kiện do simulator gửi.
- Không có Web Push/PWA/native hay thông báo khi đóng trình duyệt; cảnh báo chỉ cập nhật khi trang đang mở và còn kết nối.
- Không có dịch vụ AI mặc định; khi chưa cấu hình provider, trợ lý trả tóm tắt theo mẫu và ghi rõ là fallback.
- Không có xóa cứng/retention, không có màn hình xem vùng cách ly ingest, không có báo cáo PDF và chưa có kiểm khả dụng với người cao tuổi.

