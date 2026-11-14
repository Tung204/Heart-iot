# Trải nghiệm và màn hình

> **Baseline v0.1:** danh sách màn hình dưới đây chưa bao gồm đầy đủ AI Workspace, theo dõi tác vụ và preview cấu hình. Yêu cầu mới về [AI và preview frontend](11-nen-tang-ai-va-cau-hinh-dong.md) cần được đặc tả trước khi triển khai giao diện; chưa có bản preview sản phẩm được duyệt.

**Đề xuất:** web responsive dùng được trên màn hình điện thoại và máy tính. Chưa có mockup đã duyệt, chưa triển khai PWA/native hoặc kiểm thông báo nền.

## Sơ đồ trang

| Khu vực | Màn hình | Thông tin/hành động chính |
| --- | --- | --- |
| Công khai | Trang chủ, giới thiệu sản phẩm | Hệ thống làm gì, phạm vi prototype, đăng nhập/đăng ký |
| Tài khoản | Đăng ký, đăng nhập, hồ sơ | Phiên đăng nhập và thông tin tối thiểu |
| Thiết lập | Gắn thiết bị, kết nối, mời người thân | Trạng thái từng bước; không hoàn tất giả khi thiết bị chưa online |
| Người được theo dõi | Tổng quan | Tình trạng thiết bị, nhịp tim mới nhất, vận động, cảnh báo đang mở |
| Người thân | Danh sách hồ sơ được chia sẻ | Ai có cảnh báo, dữ liệu mới lúc nào, có quyền gì |
| Chi tiết hồ sơ | Biểu đồ và lịch sử | Khoảng thời gian, chất lượng, đoạn thiếu, lịch sử incident |
| Cảnh báo | Chi tiết sự kiện | Nghi ngã/xác nhận/nhận trễ; ai đang hỗ trợ; xác nhận/đóng; liên hệ thủ công |
| AI | Tóm tắt và câu hỏi giới hạn | Khoảng dữ liệu, nguồn, dữ liệu thiếu và khả năng không trả lời |
| Chia sẻ | Người thân và quyền | Mời, chấp nhận, khoảng lịch sử, thu hồi |
| Admin | Tình trạng hệ thống | Thiết bị online/offline, phiên bản, lỗi ingest/gửi; audit đã lọc |

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
| Candidate thiếu kết quả | “Chưa xác định”; giữ trong lịch sử kỹ thuật, không tự chuyển thành an toàn |
| Kênh thông báo lỗi | Hộp cảnh báo vẫn lưu; hiển thị chưa gửi/đang thử/đã hết lượt thử |
| AI lỗi hoặc bị tắt | Chỉ số và cảnh báo vẫn dùng được; cung cấp tóm tắt theo mẫu nếu đủ dữ liệu |

## Dễ sử dụng và quyền riêng tư

Nút hủy/SOS trên thiết bị cần thao tác dễ phân biệt. Giao diện dùng chữ rõ, nhãn có nghĩa, không dùng màu là tín hiệu duy nhất, điều hướng bàn phím và bố cục thích ứng. Cần thử nhiệm vụ thực tế để kết luận phù hợp với người cao tuổi; không coi thiết kế đẹp là bằng chứng sử dụng tốt.

Thông báo ở màn hình khóa chỉ chứa nội dung tối thiểu theo lựa chọn chia sẻ, không đưa toàn bộ chỉ số sức khỏe. Nếu thêm Web Push, xin quyền tại thời điểm người dùng chọn nhận thông báo và kiểm chính nền tảng mục tiêu. Chưa có bằng chứng app đóng vẫn nhận được thông báo.

## Hiện trạng giao diện v1 (15/11/2026)

Phần giao diện đã được triển khai và kiểm thủ công bằng Playwright, không chỉ dựa vào test tự động:

- Tổng quan ưu tiên **cảnh báo đang mở** trước số liệu; sau đó là tổng hợp ngày và trạng thái thiết bị.
  Hồ sơ đang xem dùng thanh ngữ cảnh gọn, có vai trò (chủ hồ sơ/người thân) và lối tắt quản lý chia sẻ.
- Lịch sử hiển thị bảng 20 dòng kèm tải thêm trên máy tính, thẻ dữ liệu trên điện thoại; biểu đồ cuộn ngang,
  có nhãn ngày khi khoảng xem dài hơn 12 giờ và chú giải khoảng thiếu dữ liệu bằng chữ.
- Landing, đăng nhập và đăng ký nêu rõ phạm vi demo; đăng nhập có lối điền nhanh tài khoản demo theo vai trò.
  Trang lời mời, chia sẻ, thiết bị, thông báo, trợ lý, công việc, Studio và Quản trị đều có trạng thái trống/lỗi/quyền.
- Điều hướng di động dùng thanh dưới với 5 mục chính; mục phụ nằm trong “Thêm”. Chữ lớn, vùng chạm rộng,
  trạng thái không chỉ dựa vào màu và có liên kết bỏ qua nội dung.
- Đã kiểm ở 1280×900, 390×844, 360×740 và chế độ chữ lớn; không có tràn ngang. Đây là kiểm giao diện kỹ thuật,
  **chưa thay thế** kiểm khả dụng với người cao tuổi/người chăm sóc thật.

