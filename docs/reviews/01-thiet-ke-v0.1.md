# Review thiết kế sức khỏe IoT v0.1

**Ngày review:** 10/11/2026 — Codex. **Trạng thái:** đã review tĩnh; các phát hiện bên dưới chưa được sửa trong đặc tả.

Phạm vi: README, tài liệu thiết kế, ADR, trách nhiệm các thư mục và ba payload mẫu. Dự án chưa có ứng dụng, firmware hoặc simulator chạy được. Các phát hiện là thiếu sót/mâu thuẫn của thiết kế, không phải lỗi runtime đã tái hiện. P1 cần giải quyết trước khi triển khai luồng liên quan; P2 cần làm rõ để các thành phần thực hiện thống nhất. Mức độ này thuộc báo cáo review, không thay thứ tự P0/P1 của phạm vi sản phẩm hoặc kế hoạch gốc.

## R-01 — P1: Thông báo chờ gửi chưa bị vô hiệu hóa khi incident đã đóng

**Vị trí:** [kiến trúc](../03-kien-truc-he-thong.md), dòng 56 và 63; [mô hình outbox](../04-du-lieu-va-giao-tiep.md), dòng 18.

Đặc tả yêu cầu `user.cancel_requested` đóng incident và gửi cập nhật cho người đã nhận. Worker vẫn retry tác vụ outbox; quy tắc gửi chỉ nêu chống trùng và kiểm quyền, chưa kiểm trạng thái/version hiện tại của incident hoặc hủy tác vụ cũ.

Tình huống: `confirmed` được commit cùng thông báo đang chờ → worker chưa gửi hoặc đang backoff → người dùng hủy và incident đóng → worker tiếp tục gửi cảnh báo mở. Nếu chưa có người nhận tại lúc hủy, nhánh “cập nhật cho những người đã nhận” không tạo thông báo đính chính cho họ. Unique key không giải quyết tác vụ hợp lệ nhưng đã lỗi thời. Reconnect tải snapshot cũng chưa bảo vệ người đang xem một stream liên tục.

**Hướng sửa đề xuất:** đặc tả việc đánh dấu tác vụ chưa gửi là `superseded` khi đóng incident, kiểm version/trạng thái trước dispatch và quy tắc cho tác vụ đang gửi dở. Sự kiện gửi tới client cần version nghiệp vụ tăng đơn điệu; client không áp dụng trạng thái cũ. Nếu thông báo cũ đã ra ngoài thì bảo đảm người thực tế nhận được cũng nhận cập nhật kết thúc. Phân biệt version nghiệp vụ server với `event_revision` của firmware nếu cả hai đều thay đổi trạng thái.

**Kiểm chứng cần bổ sung khi triển khai:** mở rồi hủy trước dispatch; hủy trong lúc dispatch; worker restart sau hủy. T-07 kiểm khôi phục worker và T-10 kiểm hủy sau gửi hiện chưa mô tả đủ các trường hợp này.

## R-02 — P1: Khóa incident chưa có phạm vi định danh và kiểm quyền thiết bị rõ ràng

**Vị trí:** [mô hình dữ liệu](../04-du-lieu-va-giao-tiep.md), dòng 15–16, 70 và 74.

Thiết bị cung cấp `incident_id`, nhưng bảng sự kiện dùng unique `(incident_id, event_revision)` toàn cục. Hợp đồng chưa quy định ID phải duy nhất toàn hệ thống hay chỉ trong một thiết bị; cũng chưa quy định ingest phải đối chiếu thiết bị đã xác thực với thiết bị trong assignment của incident trước mỗi cập nhật. Quyền thiết bị trong tài liệu yêu cầu đã nêu “sự kiện của chính nó”, nhưng quy tắc đó chưa được cụ thể hóa tại phép tra cứu/cập nhật incident.

Hai firmware tạo cùng ID cục bộ có thể khiến một sự kiện hợp lệ bị coi là trùng/xung đột. Nếu handler tra cứu bằng `incident_id` rồi chỉ kiểm topic với `payload.device_id`, thiết bị B có thể gửi ID của incident A kèm revision tiếp theo và làm thay đổi sự cố của A, dù topic vẫn thuộc B. Đây là đường xử lý thiết kế chưa loại trừ, chưa phải lỗ hổng đã chứng minh trên code.

**Hướng sửa đề xuất:** chọn namespace `(authenticated_device_id, device_incident_id)` hoặc quy tắc ID toàn cục, đồng thời bắt buộc kiểm nguồn phát của incident trong transaction. UUID riêng lẻ không thay kiểm quyền. `assignment_id` được server gắn khi tạo incident phải bất biến; sự kiện tiếp theo không được chuyển incident sang assignment mới khi thiết bị đổi chủ.

**Kiểm chứng cần bổ sung khi triển khai:** hai thiết bị dùng cùng ID cục bộ; thiết bị B cập nhật incident của A với revision mới; thiết bị A gửi bản tin cũ sau khi đổi assignment. Kết quả phải tách incident đúng namespace hoặc từ chối rõ ràng, không thay đổi sự cố của hồ sơ khác.

## R-03 — P2: Chưa thống nhất xử lý confirmed không xác định được assignment

**Vị trí:** [chính sách thời gian/cảnh báo](../03-kien-truc-he-thong.md), dòng 75–82; [quy tắc gán dữ liệu](../04-du-lieu-va-giao-tiep.md), dòng 55.

Kiến trúc hứa confirmed không rõ giờ sẽ được lưu lịch sử và gửi thông báo nhận trễ. Đồng thời, dữ liệu không đủ bằng chứng để gán vào assignment phải bị cách ly. Sau chuyển thiết bị A → B, một confirmed trong buffer có `measured_at: null` và boot chưa có mốc thời gian tin cậy không cho backend biết người được theo dõi nào liên quan. Không thể vừa cách ly vừa gửi thông báo sức khỏe đúng người nếu chưa có quy tắc giải quyết trường hợp này.

**Hướng sửa đề xuất:** tách “không rõ giờ nhưng biết chắc assignment” khỏi “không rõ assignment”. Trường hợp đầu có thể gửi thông báo nhận trễ. Trường hợp sau tiếp tục cách ly, có trạng thái theo dõi, quyền xử lý, cách bổ sung bằng chứng và quy tắc tái xử lý đúng một lần; sửa lời hứa gửi thông báo cho phù hợp. Có thể nghiên cứu assignment epoch/token do server cấp, gắn với từng bản tin lúc tạo và giữ qua reboot, kèm quy trình chuyển chủ được xác nhận. Không để firmware tự khai `subject_id` hoặc mặc định chọn chủ hiện tại.

**Kiểm chứng cần bổ sung khi triển khai:** đổi chủ khi thiết bị có sự kiện chưa gửi, reboot trước đồng bộ giờ, nhận lại confirmed/cancel nhiều lần và giải quyết cách ly. Không gửi sai người, không mất dấu sự kiện cần xử lý, không nhân đôi cảnh báo khi tái xử lý. T-03 hiện chỉ yêu cầu cách ly; chưa nêu đường đi tiếp.

## R-04 — P2: Telemetry chưa đủ ngữ nghĩa để tính coverage và thống kê khi gộp mẫu

**Vị trí:** [hợp đồng telemetry](../04-du-lieu-va-giao-tiep.md), dòng 45–53 và 63; [lấy mẫu firmware](../05-phan-cung-va-firmware.md), dòng 52; [đầu vào AI](../07-tro-ly-ai.md), dòng 19.

Payload chỉ có một `heart_rate_bpm` và một timestamp. README ví dụ gọi đây là một mẫu BPM, nhưng tài liệu giao tiếp cho phép tổng hợp mẫu để giảm băng thông và firmware dự kiến chỉ gửi tổng hợp thường kỳ. Backend lại phải tính số mẫu hợp lệ, coverage theo cấu hình thu, min/max/trung bình. Chưa xác định một giá trị gửi lên là snapshot hay trung bình của cửa sổ, coverage đếm mẫu nào và cấu hình có hiệu lực trong khoảng nào.

Khi hai gói tổng hợp có số mẫu hợp lệ khác nhau, lấy trung bình hai giá trị không bằng trung bình của toàn bộ mẫu hợp lệ. Min/max của các trung bình cũng không khôi phục được min/max mẫu gốc. Đếm số gói nhận được chỉ phản ánh lượng gói nhận, không chứng minh độ phủ cảm biến mà phần tóm tắt muốn công bố.

**Hướng sửa đề xuất:** chốt một semantics v1. Nếu dùng snapshot, định nghĩa rõ nhịp tạo snapshot, coverage và thống kê chỉ trên các snapshot đó. Nếu gửi aggregate, bổ sung ranh giới cửa sổ, số mẫu hợp lệ/kỳ vọng, thống kê đủ để gộp theo định nghĩa đã chọn và cấu hình có version/thời điểm hiệu lực. Không nhất thiết gửi raw PPG/IMU. Đồng bộ payload, schema tương lai và cách diễn đạt trên dashboard/AI với lựa chọn này.

**Kiểm chứng cần bổ sung khi triển khai:** gói có số mẫu khác nhau, đổi chu kỳ thu/gửi giữa ngày, tín hiệu kém và mất một gói. Đối chiếu mean/coverage với tập dữ liệu tổng hợp có đáp án biết trước; không chỉ đếm envelope.

## Kiểm chứng và giới hạn

Trước khi thêm báo cáo này, đã kiểm **24 file Markdown, 53 liên kết nội bộ và 3 JSON mẫu** bằng Python standard library: đọc được UTF-8, code fence cân bằng, không có link nội bộ đứt, JSON parse được. Đối chiếu device/message/incident/revision giữa sự kiện và ACK, cùng cửa sổ hủy trong ví dụ: đạt. Đây là kiểm tài liệu và tính nhất quán của ví dụ, chưa phải validate JSON Schema hoặc test ứng dụng.

Không chạy lint/type-check hoặc test ứng dụng vì chưa có toolchain/code. Chưa đo cảm biến, pin, độ trễ hoặc chất lượng thuật toán. Các tình huống trong findings là lập luận review và tiêu chí test đề xuất, không được ghi nhận là đã chạy.

Phạm vi cảnh báo chỉ trong web đang kết nối, framework/linh kiện chưa chốt và thiếu rubric/ngân sách đã được bản v0.1 công bố rõ; không coi những giới hạn đó là lỗi mới. Cấu trúc thư mục đủ để tiếp tục đặc tả; chưa có căn cứ cần thêm microservices hoặc mở rộng cây source.

**Bước tiếp theo đề xuất:** sửa đồng bộ quy tắc ingest và vòng đời thông báo trong tài liệu 03/04, bổ sung tình huống vào tài liệu 08, rồi chốt semantics telemetry trước khi viết schema/simulator. Báo cáo này không đánh dấu các việc sửa là đã thực hiện.

[Mục lục tài liệu](../README.md).
