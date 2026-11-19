# Phần cứng và firmware

**Trạng thái:** danh sách ứng viên và phương án thử. Chưa xác nhận đã sở hữu linh kiện, sơ đồ chân, giá mua, điện áp module hoặc độ chính xác.

## Phương án khảo sát

| Khối | Ứng viên | Cần kiểm trước khi chốt |
| --- | --- | --- |
| Vi điều khiển | Một board thuộc họ ESP32 | Mã board, nguồn, RAM/flash, chân khả dụng, thư viện cảm biến, tiêu thụ điện |
| Nhịp tim quang học | Module MAX30102 hoặc cảm biến PPG tương đương | Datasheet đúng chip/module, tiếp xúc da, che sáng, nhiễu cử động, thuật toán suy BPM |
| Vận động/té ngã | IMU 6 trục; so sánh MPU6050 và lựa chọn đang có | Dải đo, tần số lấy mẫu, tuổi đời/nguồn hàng, driver, nhiễu và vị trí gắn |
| Tương tác | Nút SOS/hủy, LED, buzzer hoặc rung | Bấm nhầm, lực bấm, phân biệt trạng thái, giới hạn dòng driver |
| Nguồn | Nguồn bàn/USB trước; pin sau | Mạch sạc/bảo vệ đúng loại pin, đường cấp nguồn, nhiệt độ, tiêu thụ đỉnh |
| Cơ khí | Vỏ thử và dây đeo | Tiếp xúc da, khối lượng, độ chắc, dễ tháo, không lộ dây/mạch khi đeo |

Tên linh kiện chỉ là ứng viên. Không suy ra module bất kỳ tương thích 3,3 V/5 V từ tên chip; phải đọc datasheet và sơ đồ module được mua. Chưa đưa pin/charger vào thiết kế chi tiết trước khi xác định yêu cầu nguồn.

**Ràng buộc gọn nhẹ cho thiết bị đeo (xác nhận 18/11/2026):** thiết bị ưu tiên kích thước nhỏ gọn, ít linh kiện để người cao tuổi đeo thoải mái hằng ngày. Thân đeo chỉ giữ cảm biến cốt lõi, nút bấm và bộ rung/còi bíp mini báo trạng thái; **không gắn loa phát giọng nói, micro đàm thoại hay màn hình lớn** trên thiết bị. Toàn bộ tính năng trợ lý AI (như đọc/tóm tắt/hỏi đáp) xử lý ở phía server và trình duyệt web.

## Trình tự khảo sát vị trí đeo

1. Trên bàn: đọc định danh cảm biến, kiểm nguồn và dữ liệu thô ổn định; ghi cấu hình và phiên bản driver.
2. PPG: thu phiên ngồi yên, so với thiết bị tham chiếu đã biết giới hạn; ghi tỷ lệ mất tín hiệu và ảnh hưởng tiếp xúc.
3. IMU: ghi hoạt động thường ngày có nhãn ở vị trí đề xuất như cổ tay/thắt lưng; không trộn vị trí mà không lưu metadata.
4. So sánh tỷ lệ báo nhầm, khả năng đeo và chất lượng nhịp tim để chọn một thiết bị hay tách phép đo theo phiên.

Không yêu cầu người cao tuổi cố tình té ngã. Thử va chạm trước bằng mô hình/vật thay thế; dữ liệu đó chỉ chứng minh phản ứng với kịch bản cơ học, không đại diện độ nhạy trên người. Thử có người cần phương án phù hợp, đồng ý và điều kiện an toàn riêng.

## Thuật toán ban đầu có thể giải thích

Luồng dự kiến: kiểm chất lượng → lọc nhiễu IMU → trích độ lớn gia tốc/thay đổi tư thế → nhận diện chuỗi đặc trưng → `fall.candidate` → cửa sổ hủy → `fall.confirmed` hoặc `fall.cancelled`.

Free-fall, impact và bất động có thể là đặc trưng nghiên cứu; không bắt buộc mọi cú ngã đều có đủ ba dấu hiệu. Ngồi mạnh, vỗ tay, tháo/rơi thiết bị cũng phải có trong tập hoạt động âm tính. Ngưỡng lấy từ calibration, không đặt một giá trị g rồi gọi là đã phát hiện ngã chính xác.

Bắt đầu bằng rule-based baseline và ghi version/tham số. Chỉ cân nhắc mô hình học máy sau khi có dữ liệu đủ nguồn, chia tập đúng và chứng minh cải thiện trên cùng phép đo. Không dùng AI ngôn ngữ để phân loại từng mẫu cảm biến trong đường cảnh báo.

## Ranh giới module firmware dự kiến

| Module | Trách nhiệm |
| --- | --- |
| `sensors` | Driver, timestamp, chất lượng, lỗi bus |
| `signal_processing` | Lọc, suy BPM, bước chân, đặc trưng IMU |
| `fall_detection` | State machine nghi ngã, tham số, version thuật toán |
| `interaction` | Nút, chống dội, LED/rung/còi; hủy/SOS, xác nhận nhắc việc và còi tìm thiết bị |
| `connectivity` | Provisioning mạng, TLS/MQTT/HTTP, backoff kết nối (mở rộng di động 4G ở giai đoạn sau) |
| `commands` | Nhận lệnh tìm thiết bị và đồng bộ lịch nhắc đã xác thực, giới hạn tần suất/thời lượng phát còi-rung |
| `buffer` | Hàng đợi hữu hạn, ưu tiên incident, phục hồi khi boot |
| `telemetry` | Envelope, sequence, application ACK và số mẫu mất |
| `config` | Phiên bản cấu hình, thông tin board, secret provisioned ngoài source |

Chưa tạo cây source chi tiết trước khi chọn ESP-IDF/driver. Cấu trúc trên là ranh giới trách nhiệm, không phải danh sách file đã có.

## Lấy mẫu, pin và lưu đệm

Tách tốc độ lấy mẫu cảm biến khỏi chu kỳ gửi mạng. Thử các tốc độ IMU trong khả năng cảm biến, ghi lại tradeoff độ nhạy/CPU/điện; chỉ gửi tổng hợp thường kỳ và sự kiện, trừ phiên thu raw được bật rõ ràng.

Hàng đợi có dung lượng/tuổi tối đa được cấu hình và đo. Khi đầy: ưu tiên giữ sự kiện quan trọng, bỏ mẫu telemetry cũ theo chính sách có bộ đếm; nếu sự kiện vẫn phải bị bỏ thì báo lỗi/trạng thái degraded khi có kết nối. Không hứa lưu vô hạn hoặc không mất dữ liệu khi tắt nguồn.

Ước lượng sơ bộ thời lượng pin bằng `usable_capacity_mAh / average_current_mA`, sau đó đo dòng ở các chế độ và kiểm thời gian chạy thực tế. Ghi thêm hiệu suất nguồn, chu kỳ Wi-Fi, rung/còi và điều kiện đo; chưa có con số thời lượng pin.

## BOM và hồ sơ phần cứng

Mỗi linh kiện được chọn phải có: mã cụ thể, số lượng, đường dẫn datasheet/module, nhà cung cấp, giá tại ngày kiểm, tổng tiền, tình trạng sẵn có và lý do chọn. Hồ sơ lưu ở [hardware](../hardware/README.md). Giá để chưa xác minh cho đến khi đọc được nguồn; không đặt số 0 thay cho chưa biết.

## Hạng mục phần cứng và firmware mở rộng (bổ sung 18/11/2026)

**Trạng thái:** kế hoạch mở rộng do người dùng bổ sung ngày 18/11/2026; **chưa làm**, chưa chọn mã linh kiện cụ thể, chưa có giá mua, sơ đồ chân hoặc số liệu đo dòng/thời lượng pin.

1. **Nhắc uống thuốc & sinh hoạt hai chiều (`FR-15`):** Lưu lịch nhắc cục bộ trên thiết bị để rung/bíp nhẹ đúng giờ ngay cả khi Wi-Fi chập chờn; kiểu rung và âm báo nhắc việc phải tách biệt rõ với còi báo ngã/SOS; nút bấm xác nhận gửi bản tin *"đã thực hiện"* có chống trùng về backend.
2. **Đế sạc kèm còi tìm thiết bị & nhắc quên đeo (`FR-18`):** Khảo sát đế sạc đặt cố định trên bàn dễ thao tác cho người cao tuổi (tiếp điểm/nam châm hoặc cổng sạc thuận tiện) để **không làm tăng kích thước hay khối lượng vòng đeo**; trên thân đeo chỉ dùng bộ rung/còi bíp nhỏ sẵn có để phát tiếng bíp ngắn khi nhận lệnh tìm máy đã xác thực từ web (tự tắt nhanh để tránh cạn pin) và kết hợp trạng thái `not_worn` với cảm biến đứng yên để nhắc khi bỏ quên thiết bị ban ngày quá lâu.
3. **Định vị GPS + SIM 4G ngoài nhà (`FR-19` — giai đoạn nâng cao):** Khảo sát module GNSS, mạng di động (4G LTE Cat-1/NB-IoT), dòng đỉnh khi phát sóng, anten và kích thước vỏ/pin. Do linh kiện định vị và SIM 4G làm thiết bị to và nặng hơn đáng kể, **không nhồi cứng vào bản đeo nhỏ gọn trong nhà**, mà chỉ khảo sát như phiên bản/thiết bị mang riêng khi đi ra ngoài ở giai đoạn nâng cao sau khi bản Wi-Fi cơ bản chạy ổn định và giải quyết được bài toán kích thước/nguồn.
