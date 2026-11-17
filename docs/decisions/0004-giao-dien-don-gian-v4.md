# Quyết định giao diện đơn giản v4

- **Ngày:** 15/11/2026.
- **Trạng thái:** đã áp dụng cho phần mềm; không thay đổi API/nghiệp vụ.
- **Liên quan:** [chương 06](../06-trai-nghiem-va-man-hinh.md), [chương 07](../07-tro-ly-ai.md), [chương 14](../14-ke-hoach-trien-khai-phan-mem.md), [ADR 0003](0003-tro-ly-la-trung-tam.md).

## Bối cảnh

v3 đưa trợ lý thành không gian mặc định nhưng màn đầu có bản tin, 4 chỉ số, cột bối cảnh và nhiều liên kết. Người dùng bác giao diện vì “quá nhiều thông tin, không hiểu ngay”; yêu cầu thay trực tiếp, không preview, và sửa cả công khai, ứng dụng, quản trị.

## Quyết định

1. `/app` là **Hôm nay**: một câu trạng thái ưu tiên (cảnh báo/thiết bị/quyền), một hành động chính, ô hỏi ngắn + 3 gợi ý; không bản tin/4 chỉ số/cột bối cảnh.
2. `/app/overview` là **Sức khỏe**, mở bằng link `← Hôm nay`; nav chính còn **4 mục**: Hôm nay, Cảnh báo, Người thân, Thêm.
3. Công khai: landing hero + 3 thẻ + một dòng an toàn; login/register một thẻ; không khối tài khoản trải nghiệm/nút tự điền.
4. Quản trị: 4 tab Tổng quan/Người dùng/Thiết bị/Nâng cao; chi tiết audit/policy trong Nâng cao.
5. Trợ lý vẫn độc lập với cảnh báo; AI không nằm trên đường quyết định, không tự xác nhận/đóng cảnh báo. Không hứa “an toàn” khi thiếu dữ liệu.

## Hệ quả

- Giữ nguyên route nghiệp vụ/API; chỉ đổi IA, thứ tự ưu tiên và copy.
- Màn phụ vẫn có thể dài; các P2 còn lại (menu tài khoản, gộp số liệu trùng, tải lịch sử) được ghi trong `reports/qa/v4-rereview-*.md`, không tuyên bố đã đóng.
- Cần kiểm lại 1280/390/360/chữ lớn, focus, không tràn ngang và E2E sau mỗi lần đổi CSS/route.
