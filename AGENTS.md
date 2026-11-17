# Hướng dẫn làm việc với DATN

- Dùng tiếng Việt cho tài liệu và giải thích; giữ nguyên tên kỹ thuật trong code.
- Đọc `README.md`, `docs/README.md` và tài liệu liên quan trước khi triển khai. Thiết kế v0.1 là đề xuất, không phải yêu cầu đã được giảng viên duyệt.
- Phân biệt yêu cầu gốc, giả định, quyết định được chốt và kết quả đo. Không tự điền giá linh kiện, độ chính xác, thời lượng pin hoặc kết quả kiểm thử.
- Tài liệu kỹ thuật ở `docs`; kế hoạch có trạng thái ở Obsidian theo quy ước dùng chung. Không tạo checklist tiến độ song song.
- Tài liệu là một phần của thay đổi: cập nhật yêu cầu, contract, quyết định và cách kiểm tương ứng; không đợi đến cuối dự án mới viết. Áp dụng `docs/12-nguyen-tac-phat-trien-va-bang-chung.md`.
- Trước khi dùng framework/API/dependency, xác định phiên bản và đọc tài liệu chính thức liên quan. Khảo sát built-in, dependency và shared code trước khi viết mới; không bịa API hoặc coi package trên máy là dependency của dự án.
- Khi sửa quy tắc dùng chung, tìm mọi đường ảnh hưởng: service, truy vấn, quyền, AI tool, job, báo cáo/export, UI và test. Ghi impact map khi cần; không chỉ sửa các màn hình được nêu làm ví dụ.
- Thiết kế phần nghiệp vụ cần thay đổi theo hướng Dynamic / Configurable với schema, version và validation. Không đóng cứng dữ liệu/kết quả demo; bất biến bảo mật và hằng số giao thức không mặc định phải cấu hình được.
- Frontend sản phẩm cần preview và được chấp nhận trước khi áp dụng chính thức. Chuẩn bị bản xem trước và kiểm chứng trước bước duyệt. Phân biệt canvas tạm, cấu hình đã công bố và sửa code; ranh giới AI sửa backend trong `docs/11-nen-tang-ai-va-cau-hinh-dong.md` vẫn là đề xuất cần chốt.
- Khi sửa giao tiếp thiết bị, đối chiếu `docs/04-du-lieu-va-giao-tiep.md` và ví dụ trong `packages/contracts`.
- Luồng cảnh báo không phụ thuộc lời trả lời AI. Cần xử lý gửi trùng, dữ liệu cũ, mất kết nối và quyền truy cập dữ liệu sức khỏe.
- Chỉ đưa dữ liệu tổng hợp vào ví dụ/fixture. Không commit credentials, thông tin cá nhân hay dữ liệu đo thật chưa được phép.
- Bắt đầu bằng lint/type-check liên quan khi đã có toolchain, rồi chạy test nhỏ nhất bao phủ hành vi thay đổi. Mở rộng khi có lý do; test chạy tuần tự mặc định. Không nới hoặc bỏ test hợp lệ để làm xanh kết quả.
- Khi mới sửa tài liệu: kiểm liên kết, JSON minh họa và sự nhất quán; không báo đã chạy test ứng dụng khi chưa có ứng dụng.
- `docs/html/index.html` được sinh từ Markdown/JSON bằng `tools/docs/build.py`. Sau khi sửa nguồn được đưa vào HTML, sinh lại và chạy `--check`; đọc `tools/docs/README.md`. Không sửa trực tiếp HTML đầu ra.
