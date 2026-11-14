# Lộ trình, triển khai và hồ sơ

Đây là **trình tự kỹ thuật đề xuất**, không có deadline hoặc người phụ trách được tự gán. Kế hoạch có checkbox/trạng thái duy nhất nằm trong `Kế hoạch.md` của dự án Obsidian. Tài liệu này chỉ mô tả phụ thuộc, đầu ra và điều kiện chuyển giai đoạn.

## Các giai đoạn

| Giai đoạn | Đầu ra | Điều kiện chuyển tiếp |
| --- | --- | --- |
| G0 — Chốt bối cảnh | Yêu cầu trường, thời hạn, nguồn lực, linh kiện sẵn có, phạm vi demo | Phân biệt yêu cầu bắt buộc và mở rộng; biết giới hạn thực tế |
| G1 — Prototype cảm biến và hợp đồng | Phiên đo PPG/IMU trên bàn, khảo sát vị trí đeo, payload/schema v1, baseline | Có dữ liệu đọc được và chỉ rõ chất lượng; hợp đồng được đối chiếu với backend |
| G2 — Lát cắt phần mềm | Simulator → ingest → DB → dashboard → cảnh báo → acknowledge/resolve | Demo được cancel/confirm/trùng/mất mạng và quyền A/B trên dữ liệu tổng hợp |
| G3 — Ghép phần cứng | Thiết bị thật thay simulator; provisioning, reconnect, buffer, application ACK | Phép thử mạng/nguồn không làm lùi trạng thái hoặc gán sai hồ sơ; đo độ trễ |
| G4 — AI giới hạn và đánh giá | Tóm tắt dựa trên aggregate, nguồn dùng được, bộ đánh giá | Kết quả kiểm số liệu/quyền/thiếu dữ liệu có bằng chứng; tắt AI không hỏng cảnh báo |
| G5 — Hoàn thiện hồ sơ và demo | Báo cáo, sơ đồ, bảng kết quả thật, demo script, hướng dẫn bàn giao | Đối chiếu rubric trường, ghi đủ giới hạn và kiểm tái lập |

G1 và chuẩn bị G2 có thể tiến hành độc lập sau khi thống nhất hợp đồng; trạng thái thực tế vẫn cập nhật ở kế hoạch gốc. Không chờ có AI để bắt đầu kiểm phần cứng hoặc cảnh báo.

## Lát cắt triển khai đầu tiên

Phạm vi đề xuất: một hồ sơ demo, hai tài khoản người thân với quyền khác nhau, một thiết bị giả lập, telemetry tổng hợp, candidate/cancel/confirmed, hộp cảnh báo và thao tác xác nhận/đóng. Dữ liệu tổng hợp giúp kiểm backend trước khi có cảm biến ổn định.

Điều kiện hoàn tất lát cắt: chạy lại cùng kịch bản cho cùng kết quả; gửi lặp không nhân cảnh báo; tài khoản không có quyền không đọc dữ liệu; mất kết nối tạo trạng thái cũ/offline; restart worker không mất bản ghi cần gửi. Sau đó mới mở rộng số màn hình và nguồn dữ liệu.

## Môi trường và vận hành dự kiến

| Môi trường | Mục đích | Dữ liệu |
| --- | --- | --- |
| Local | Phát triển và kiểm hợp đồng | Fixture tổng hợp |
| Demo | Trình diễn ổn định, tập cấu hình được ghi lại | Dữ liệu tổng hợp hoặc thử nghiệm đã được phép và ẩn danh |
| Thử nghiệm có người | Đo khả năng sử dụng/độ tin cậy có giới hạn | Chỉ sau khi có quy trình đồng ý, quyền và retention |

Khi có code, cấu hình local sẽ được đặt trong `infra`; secret ở môi trường thực thi, file mẫu chỉ chứa tên biến và giá trị vô hại. Chốt runtime/package manager/version trước khi thêm manifest và lockfile. Nêu rõ cổng, TLS, broker ACL, migration và rollback trong hướng dẫn triển khai thực tế.

Quan sát tối thiểu: last_seen thiết bị, số bản tin nhận/từ chối/trùng, sự kiện cách ly, tuổi notification outbox, số lần gửi lỗi, độ trễ xử lý, lỗi AI. Log dùng ID tham chiếu, không dump toàn bộ dữ liệu sức khỏe hoặc secret.

Trước dữ liệu thật: thử backup/restore, thu hồi quyền và credential, migration với backup, giới hạn retention/xóa, khôi phục worker và hành vi khi DB/broker lỗi. Bản backup phải được bảo vệ và có vòng đời; không đặt cạnh code để đồng bộ công khai.

## Hồ sơ học thuật đề xuất

Chưa có yêu cầu chính thức của trường. Cấu trúc tham khảo có thể gồm:

1. Bối cảnh, mục tiêu, phạm vi và phương pháp thực hiện.
2. Cơ sở lý thuyết, nghiên cứu/sản phẩm liên quan và nguồn có quyền sử dụng.
3. Phân tích yêu cầu, use case, phân quyền và thiết kế hệ thống.
4. Thiết kế phần cứng, firmware, phần mềm và hợp đồng dữ liệu.
5. Cách tích hợp AI, nguồn dữ liệu và đánh giá đầu ra.
6. Thử nghiệm, số liệu thực đo, phân tích lỗi và giới hạn.
7. Kết luận, khả năng phát triển và hướng dẫn vận hành/bàn giao.

Phụ lục có thể gồm BOM, sơ đồ mạch, API/schema, bộ kịch bản, hướng dẫn cài đặt và demo. Không tạo tài liệu Word/PDF theo một mẫu trường chưa biết; soạn Markdown kỹ thuật trước, sau đó xuất theo biểu mẫu được cung cấp.

## Các yếu tố dễ làm thay đổi phạm vi

| Yếu tố | Tác động | Hướng xử lý đề xuất |
| --- | --- | --- |
| Không đủ thời gian hoặc linh kiện | Không thể chứng minh đủ phần cứng/AI | Giữ lát cắt cảnh báo và phép đo tối thiểu; ghi rõ mô phỏng và phần chưa kiểm |
| PPG không ổn khi vận động | Sai cách mô tả theo dõi liên tục | Đo theo phiên hoặc đổi thiết kế đeo; giữ tỷ lệ mất tín hiệu trong đánh giá |
| Báo ngã giả nhiều | Người dùng bỏ qua cảnh báo | Chỉnh vị trí/đặc trưng, cửa sổ hủy, đo false alarms/hour |
| Mất Wi-Fi | Không báo từ xa đúng lúc | Cảnh báo tại chỗ, buffer hữu hạn, thông báo nhận trễ; xem xét gateway ở giai đoạn sau |
| Không có nguồn AI đủ tin cậy | Hỏi đáp dễ suy diễn | Giới hạn AI ở tóm tắt dữ liệu và fallback theo mẫu |
| Rubric trường khác đề xuất | Bộ hồ sơ/phạm vi cần thay đổi | Đối chiếu nguồn chính thức trước khi hoàn thiện báo cáo |

Việc có tài liệu không chứng minh đã triển khai, nghiệm thu hoặc sẵn sàng dùng cho người thật. Bằng chứng hoàn thành được lưu theo [quy ước kiểm thử](08-kiem-thu-va-danh-gia.md).
