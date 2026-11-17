# Tài liệu thiết kế và trạng thái triển khai

Ngày soạn thiết kế: **10/11/2026**; cập nhật trạng thái phần mềm: **15/11/2026** (v2/v3/v4). Trạng thái: **bản đề xuất + lát cắt đã triển khai trên dữ liệu tổng hợp**, dựa trên đề cương người dùng đã lưu ngày 07/11/2026. Chưa có biểu mẫu trường, ngân sách, thời hạn, nhóm thực hiện hoặc cấu hình phần cứng đã xác nhận; chưa được giảng viên nghiệm thu.

**Phần đã có mã:** API/web/simulator v1/v2/v3/v4, test tự động, Studio, ingest cách ly, quyền xem số đo, liên hệ khẩn cấp, lưu trữ/yêu cầu xóa (chỉ ghi nhận), quản trị thiết bị và HTML tài liệu; **v4 đưa `/app` về Hôm nay**, Sức khỏe ở `/app/overview`, nav chính 4 mục. **Phần chưa có:** firmware ESP32, độ chính xác té ngã, Web Push, xóa vĩnh viễn/retention, MQTT sự kiện/ACK, AI Agent runtime/RAG. Đọc [chương 14](14-ke-hoach-trien-khai-phan-mem.md) để xem trạng thái, lệnh kiểm và giới hạn thực tế.

**Hướng bổ sung:** [chương 11](11-nen-tang-ai-va-cau-hinh-dong.md) ghi yêu cầu AI tự thực hiện nghiệp vụ, nền tảng dùng chung, Dynamic / Configurable và preview frontend; [chương 12](12-nguyen-tac-phat-trien-va-bang-chung.md) ghi cách phát triển có tài liệu và bằng chứng. Các chương v0.1 là baseline IoT trước yêu cầu mới; phần đã chốt/đã làm được ghi ở chương 14, không mặc định mọi đề xuất đã được duyệt.

**Bổ sung 11/11/2026:** [chương 13](13-dac-ta-thuc-thi-ai-va-cau-hinh.md) viết sâu các contract và luồng lỗi; [review Codex](reviews/02-nen-tang-ai-va-cau-hinh-dong.md) ghi bốn khoảng trống thiết kế cùng cách bổ sung và phép kiểm. Tất cả giải pháp chưa chốt vẫn giữ trạng thái đề xuất, chưa có kiểm runtime.

**[Đọc bản HTML](html/index.html)** — toàn bộ thiết kế, ADR, review và phụ lục trên một trang; có mục lục, tìm kiếm không dấu và chế độ in. Mở trực tiếp bằng trình duyệt, không cần server hoặc Internet. Markdown/JSON vẫn là nguồn nội dung; [công cụ sinh HTML](../tools/docs/README.md) giữ hai bản nhất quán.

| Tài liệu | Câu hỏi được giải quyết |
| --- | --- |
| [01 — Tổng quan và ý tưởng](01-tong-quan-va-y-tuong.md) | Làm cho ai, giải quyết gì, chọn hướng prototype nào? |
| [02 — Yêu cầu và phạm vi](02-yeu-cau-va-pham-vi.md) | MVP có gì, vai trò nào được làm gì, thế nào là đạt? |
| [03 — Kiến trúc hệ thống](03-kien-truc-he-thong.md) | Các thành phần kết nối ra sao, cảnh báo đi qua trạng thái nào? |
| [04 — Dữ liệu và giao tiếp](04-du-lieu-va-giao-tiep.md) | Lưu dữ liệu nào, hợp đồng MQTT/API và phân quyền ra sao? |
| [05 — Phần cứng và firmware](05-phan-cung-va-firmware.md) | Khảo sát linh kiện, vị trí đeo, pin và thuật toán thế nào? |
| [06 — Trải nghiệm và màn hình](06-trai-nghiem-va-man-hinh.md) | Trợ lý là trung tâm, người cao tuổi/người thân/admin sử dụng ra sao? |
| [07 — Trợ lý AI](07-tro-ly-ai.md) | AI được dùng dữ liệu nào và đầu ra được kiểm chứng thế nào? |
| [08 — Kiểm thử và đánh giá](08-kiem-thu-va-danh-gia.md) | Cần thu bằng chứng gì trước khi đưa ra kết luận? |
| [09 — Lộ trình và hồ sơ](09-lo-trinh-va-ho-so.md) | Thứ tự triển khai, điều kiện chuyển giai đoạn và tài liệu bàn giao? |
| [10 — Nguồn và câu hỏi mở](10-nguon-va-cau-hoi-mo.md) | Điều gì đã đọc, điều gì còn cần xác nhận? |
| [11 — Nền tảng AI, web/app và cấu hình động](11-nen-tang-ai-va-cau-hinh-dong.md) | Nền tảng tổng quát gồm gì, AI tự làm tới đâu, có sửa backend không, preview frontend thế nào? |
| [12 — Nguyên tắc phát triển và bằng chứng](12-nguyen-tac-phat-trien-va-bang-chung.md) | Duy trì docs, dùng đúng API/version, tái sử dụng và tránh sửa sót module thế nào? |
| [13 — Đặc tả thực thi AI và cấu hình](13-dac-ta-thuc-thi-ai-va-cau-hinh.md) | Quyền, tác vụ, retry, preview, lịch/trigger, code và bằng chứng được quản lý cụ thể ra sao? |
| [14 — Kế hoạch triển khai và trạng thái](14-ke-hoach-trien-khai-phan-mem.md) | Đã làm gì (v1/v2), chạy/kiểm thế nào, còn giới hạn nào, kết quả review và trạng thái xử lý ra sao? |
| [Quyết định kiến trúc dự thảo](decisions/0001-dinh-huong-prototype.md) | Vì sao đề xuất các lựa chọn hiện tại, khi nào xem xét lại? |
| [Quyết định nền tảng triển khai](decisions/0002-nen-tang-trien-khai.md) | Stack, PGlite/PostgreSQL, phiên cookie, SSE và phạm vi v1 đã chốt thế nào? |
| [Quyết định trợ lý là trung tâm](decisions/0003-tro-ly-la-trung-tam.md) | Vì sao `/app` mặc định là trợ lý, dashboard xuống `/app/overview`, và cách giữ trung thực dữ liệu? |
| [Review thiết kế v0.1](reviews/01-thiet-ke-v0.1.md) | Những điểm cần sửa/làm rõ trước khi triển khai, tình huống lỗi và giới hạn kiểm chứng? |
| [Review nền tảng AI](reviews/02-nen-tang-ai-va-cau-hinh-dong.md) | Bốn khoảng trống Codex tìm được đã bổ sung thế nào, còn phải kiểm gì khi triển khai? |

## Cách đọc trạng thái

- **Yêu cầu gốc:** đã có trong đề cương người dùng; mức ưu tiên và cách hiện thực vẫn cần đối chiếu.
- **Yêu cầu bổ sung đã xác nhận:** người dùng đã nêu trực tiếp trong trao đổi; giải pháp kỹ thuật để đáp ứng vẫn có thể đang đề xuất.
- **Đề xuất:** lựa chọn của bản thiết kế này, có thể thay đổi; không đồng nghĩa đã triển khai hoặc được người dùng chốt.
- **Chưa xác minh:** thiếu nguồn, thiết bị hoặc phép đo; không dùng làm kết luận của báo cáo.
- **Đã kiểm chứng:** chỉ dùng khi có bằng chứng cụ thể và điều kiện thực hiện.

Một số con số được đặt làm **tham số demo/đích thử nghiệm đề xuất**. Chúng không phải ngưỡng y khoa, số liệu thực nghiệm hoặc cam kết vận hành.

Số test, lệnh kiểm và lỗi còn lại được ghi theo lần chạy ngày **15/11/2026** tại [chương 14](14-ke-hoach-trien-khai-phan-mem.md) và [chương 8](08-kiem-thu-va-danh-gia.md): API 20 suite/219 test, web 35 file/250 test, E2E 26/26, randomized 219/219. Tài liệu không thay cho việc chạy lại; repo chưa có CI, còn web production build đã pass trên máy dev.

[Quay lại trang dự án](../README.md).
