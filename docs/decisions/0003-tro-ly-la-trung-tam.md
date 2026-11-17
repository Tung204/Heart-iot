# ADR 0003 — Trợ lý là trung tâm của web

- **Ngày:** 15/11/2026
- **Trạng thái:** `accepted` theo quyết định sản phẩm của người dùng trong phạm vi đồ án; không phải nghiệm thu của trường/giảng viên.
- **Liên quan:** [trải nghiệm](../06-trai-nghiem-va-man-hinh.md), [trợ lý AI](../07-tro-ly-ai.md), [nền tảng AI](../11-nen-tang-ai-va-cau-hinh-dong.md), [kế hoạch v2](../14-ke-hoach-trien-khai-phan-mem.md)

## Bối cảnh

Lát cắt v2 đã có dashboard, cảnh báo, lịch sử, chia sẻ, Studio và trợ lý tóm tắt. Tuy nhiên trợ lý đang là một mục phụ trong menu “Thêm”, còn dashboard là trang mặc định. Người dùng chốt ngày 15/11/2026: **trợ lý là phần quan trọng nhất của web; mọi thứ phải xoay quanh trợ lý**; giao diện phải là sản phẩm thật, không trình bày như bản demo, và không đưa phản hồi/duyệt của giảng viên lên web.

## Quyết định

1. `/app` mặc định là **không gian trợ lý**. Dashboard chi tiết chuyển sang `/app/overview`; các màn hình khác là công cụ kiểm chứng/xử lý việc trợ lý nêu.
2. Trợ lý có hội thoại, bản tin ngắn, gợi ý câu hỏi, câu trả lời kèm chất lượng dữ liệu/nguồn và cột bối cảnh (cảnh báo đang mở, lần nhận cuối, liên kết dữ liệu). Hành động từ trợ lý dẫn tới màn hình tương ứng; không tự xác nhận/đóng cảnh báo.
3. Điều hướng đưa Trợ lý lên đầu. Không đặt trợ lý trong mục “Thêm”.
4. Ngôn ngữ web là ngôn ngữ sản phẩm: bỏ “Bản demo”, “đồ án demo”, “giảng viên”, “nghiệm thu” khỏi giao diện. Không đưa phản hồi giảng viên lên web.
5. Vẫn giữ trung thực dữ liệu: nơi có số đo/summary ghi nguồn mô phỏng hoặc trạng thái thiếu dữ liệu. Không biến dữ liệu tổng hợp thành số đo thật.
6. Cảnh báo vẫn độc lập với AI; AI không thay thế quy trình cảnh báo, không chẩn đoán và không tự gửi thông báo khẩn.

## Hệ quả

- Phải cập nhật route, nav, link sau đăng nhập/thu hồi quyền, E2E và test copy; không được nới assertion để làm xanh.
- Cần preview trước khi thay giao diện chính thức; kiểm 1280/390/360/chữ lớn và tràn ngang.
- Trợ lý hiện dùng API summary/ask đã kiểm quyền; chưa phải runtime AI tự chạy tool. Nếu mở rộng AI thực thi nghiệp vụ phải có contract/quyền/audit riêng.
- Các tài liệu 01–14 vẫn là nguồn yêu cầu; thay đổi này được triển khai dần và phải cập nhật docs/06, docs/07, ảnh kiểm sau khi chốt.

## Phương án đã cân nhắc

| Phương án | Lý do không chọn |
| --- | --- |
| Giữ dashboard là trang chính, thêm nút mở trợ lý | Không đáp ứng yêu cầu “mọi thứ xoay quanh trợ lý” |
| Chỉ thêm cửa sổ chat nổi trên dashboard | Trợ lý vẫn phụ; khó đặt bối cảnh và hành động |
| Bỏ hoàn toàn nhãn nguồn dữ liệu mô phỏng | Biến dữ liệu tổng hợp thành số đo thật, vi phạm trung thực dữ liệu |
| Đưa trạng thái duyệt của trường lên web | Không phải nội dung sản phẩm; người dùng yêu cầu bỏ khỏi giao diện |

## Bằng chứng cần có

- Preview trợ lý trung tâm + ảnh 1280/390/360/chữ lớn; không tràn ngang.
- Web test/typecheck/build pass; E2E route mới pass hoặc ghi rõ phần chưa chạy.
- Không còn chuỗi “Bản demo/đồ án/giảng viên/nghiệm thu” trong text web; vẫn còn nhãn nguồn mô phỏng ở nơi có số liệu.
