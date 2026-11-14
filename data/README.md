# Dữ liệu phát triển và thử nghiệm

Chỉ commit dữ liệu tổng hợp hoặc dữ liệu có quyền sử dụng đã được xác minh. Payload minh họa hiện đặt trong [contracts/examples](../packages/contracts/README.md); không nhân bản thành một bộ dữ liệu khác ở đây.

Các vùng local `raw/`, `private/`, `processed/`, `exports/` đã được loại khỏi Git. Chỉ tạo khi có nhu cầu; `.gitignore` không phải cơ chế kiểm soát truy cập hoặc bảo đảm bảo mật.

Dataset thử nghiệm cần manifest mô tả nguồn/giấy phép hoặc sự đồng ý, cảm biến, vị trí đeo, đơn vị, sample rate, thời gian, nhãn, cách ẩn danh, version xử lý và cách chia tập. Không đưa tên/số điện thoại/ảnh nhận diện vào fixture.

Chưa có dữ liệu đo hoặc dataset học thuật được tải trong lượt chuẩn bị này. Chính sách retention/xóa phải được chốt trước dữ liệu thật theo [đặc tả dữ liệu](../docs/04-du-lieu-va-giao-tiep.md).
