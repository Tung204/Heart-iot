# Tổng quan và ý tưởng

## Bài toán

Người thân cần biết người cao tuổi có đang đeo thiết bị, dữ liệu có còn mới và một cảnh báo đã có ai xử lý hay chưa. Chỉ hiển thị số nhịp tim và gửi thông báo chưa giải quyết được việc mất kết nối, báo động giả hoặc không ai nhận trách nhiệm.

**Hướng đề xuất:** một hệ thống theo dõi tại nhà, lấy vòng đời cảnh báo và chất lượng dữ liệu làm trung tâm. Thiết bị ghi nhận nhịp tim, vận động và dấu hiệu nghi té ngã; người dùng có thể hủy báo nhầm; người thân xem tình trạng và xác nhận đang hỗ trợ. AI giúp đọc dữ liệu đã ghi nhận.

Đối tượng đầu tiên là một người được theo dõi và một số người thân được cấp quyền. Đây là phạm vi prototype học thuật; số người dùng thực tế và mô hình triển khai cần xác định sau.

## Nguồn yêu cầu và phần phát triển thêm

Đề cương gốc yêu cầu IoT, nhịp tim, bước chân/mức vận động, phát hiện té ngã, web/app có tài khoản, chia sẻ người thân, admin và trợ lý AI. Bản này bổ sung đề xuất: trạng thái dữ liệu cũ, quyền chia sẻ có thể thu hồi, xác nhận xử lý cảnh báo, chống gửi trùng, simulator và phép đo đánh giá.

Không tự bổ sung SpO₂, huyết áp, ECG, GPS, gọi cấp cứu tự động hoặc ứng dụng native vào MVP. Nếu cần thêm, phải xem tác động đến cảm biến, nguồn, dữ liệu và thời gian.

## So sánh hướng sản phẩm

| Hướng | Giá trị | Khó khăn cần chứng minh | Đánh giá cho đồ án |
| --- | --- | --- | --- |
| Một thiết bị đeo cổ tay + Wi-Fi + web | Ít thành phần, dễ thao tác, có thể đo PPG tại vị trí đeo | Nhiễu vận động; cử động tay dễ tạo báo ngã giả; tiêu thụ pin Wi-Fi | Ứng viên khảo sát, chưa chốt hình dạng |
| IMU đeo thân/thắt lưng + đo nhịp tim theo phiên | Tách bài toán chuyển động và đo quang học; dễ so sánh vị trí | Hai thao tác/thiết bị; không được mô tả là đo nhịp tim liên tục | Phương án dự phòng có thể kiểm chứng trên bàn |
| BLE qua điện thoại hoặc thiết bị có kết nối di động | Có khả năng theo dõi ngoài nhà | Gateway, ứng dụng nền, vùng phủ, SIM và pin | Mở rộng sau prototype Wi-Fi |

Đề xuất bắt đầu bằng **prototype trên bàn, rồi khảo sát vị trí đeo**. Một MAX30102 gắn trên mạch thử không chứng minh được nhịp tim ổn định khi đeo và đi lại. Thuật toán IMU được thử ở thắt lưng cũng không mặc nhiên đúng cho cổ tay.

## Ý tưởng tạo khác biệt có thể đánh giá

1. **Cảnh báo có vòng đời:** nghi ngã → cửa sổ hủy → xác nhận từ thiết bị → gửi cảnh báo → người thân xác nhận → kết thúc có lý do. Có lịch sử thao tác và thông báo tới muộn.
2. **Dữ liệu biết chất lượng:** hiển thị rõ `valid`, `poor_signal`, `not_worn`, dữ liệu cũ và thiết bị offline. Không vẽ tiếp một đường đo như thể vẫn đang nhận dữ liệu.
3. **AI có bằng chứng:** mỗi tóm tắt chỉ rõ khoảng dữ liệu và phần bị thiếu; giải thích kiến thức chung phải có nguồn đã duyệt. Không để AI tự quyết định có gửi cảnh báo hay không.

## Kịch bản demo đề xuất

Người thân được mời vào hồ sơ theo dõi và xem dữ liệu tổng hợp từ simulator. Một sự kiện nghi ngã xuất hiện; lần đầu được hủy trên thiết bị giả lập, lần sau hết cửa sổ hủy và tạo cảnh báo. Người thân nhận cảnh báo trên dashboard, xác nhận đang xử lý, rồi đóng với kết quả “báo nhầm” hoặc “đã hỗ trợ”.

Sau đó mô phỏng mất mạng, gửi lại cùng sự kiện, thu hồi quyền chia sẻ và một ngày thiếu dữ liệu. Hệ thống phải giữ đúng số cảnh báo, chặn quyền đã thu hồi, và AI nói rõ dữ liệu thiếu. Khi thay simulator bằng phần cứng, giữ nguyên hợp đồng dữ liệu.

## Giới hạn đã biết

Wi-Fi chỉ phục vụ vùng có mạng đã cấu hình. Cảnh báo tại chỗ có thể hoạt động khi mất mạng, nhưng báo từ xa cần đường truyền. Nhịp tim là dữ liệu cảm biến cần đối chiếu, không phải chẩn đoán. Chưa có ngân sách, thời lượng pin, độ chính xác hoặc biểu mẫu trường để cam kết.

Chi tiết phạm vi ở [yêu cầu](02-yeu-cau-va-pham-vi.md); các lựa chọn chưa chốt ở [quyết định dự thảo](decisions/0001-dinh-huong-prototype.md).
