# Simulator thiết bị

Công cụ dự kiến tạo dữ liệu tổng hợp theo hợp đồng thiết bị để làm demo và kiểm lỗi trước khi có phần cứng. **Hiện chưa có script simulator chạy được.**

Các kịch bản cần triển khai: nhịp tim/vận động hợp lệ, tín hiệu kém, candidate rồi cancel, candidate rồi confirmed, SOS, gửi trùng, đảo thứ tự revision, mất mạng/gửi lại, clock unsynced và đổi boot.

Mỗi kịch bản cần seed hoặc bộ input cố định, thời gian/ID kiểm soát được, nhãn mô phỏng rõ và khả năng chạy qua cùng đường ingest với thiết bị. Không tạo đường tắt bỏ kiểm quyền thiết bị chỉ cho demo.

Tham chiếu [hợp đồng và ví dụ](../../packages/contracts/README.md), [kịch bản kiểm thử](../../docs/08-kiem-thu-va-danh-gia.md). Chọn ngôn ngữ sau khi chốt backend; không cần thêm runtime riêng nếu TypeScript hiện có đáp ứng.
