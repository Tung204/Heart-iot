# Nguồn và câu hỏi mở

Đối chiếu ngày **10–11/11/2026**. Tài liệu trong repository là bản thiết kế phát triển từ nguồn dưới đây; các ý tưởng bổ sung không được coi là yêu cầu đã duyệt.

## Nguồn nội bộ đã đọc

| Nguồn | Nội dung dùng | Trạng thái |
| --- | --- | --- |
| Obsidian `1. PROJECT/Đồ án sức khỏe IoT/Đồ án sức khỏe IoT.md` | Tên chính thức và mục tiêu | Đã đọc |
| Obsidian `1. PROJECT/Đồ án sức khỏe IoT/Đề cương.md` | Phạm vi web/app, IoT, AI, cảnh báo, nghiên cứu và hồ sơ | Đã đọc; nguồn yêu cầu ghi trong note là 07/11/2026 |
| Obsidian `1. PROJECT/Đồ án sức khỏe IoT/Kế hoạch.md` | Đầu việc và trạng thái hiện có | Đã đọc; giữ làm kế hoạch gốc |
| Obsidian `Tài liệu.md`, `Ghi chú.md` trong cùng dự án | Chỉ mục và lịch sử tổ chức yêu cầu | Đã đọc; chưa có nguồn học thuật/biểu mẫu trường kèm theo |
| Thư mục làm việc `C:/MyFolder/Hoc_Tap/project/DATN` | Nơi tổ chức tài liệu và source tương lai | Khi bắt đầu còn trống, chưa có Git repository hoặc code |

Vault được xác định từ registry dùng chung, không đoán tên thư mục OneDrive. Nguồn yêu cầu trong đề cương dẫn Hermes session/message; lượt này đọc bản đề cương, không đọc lại raw session.

## Nguồn yêu cầu bổ sung về nền tảng AI

- Trao đổi trực tiếp ngày 10/11/2026: AI thực hiện nghiệp vụ, tự chạy trong phạm vi được giao; web/app cho khách hàng và admin; luôn viết tài liệu; Dynamic / Configurable; không bịa thông tin; kỹ thuật có căn cứ; frontend phải preview và được chấp nhận. Câu hỏi AI có nên sửa backend vẫn đang cần chốt.
- [Cuộc trò chuyện ChatGPT người dùng chia sẻ](https://chatgpt.com/share/6af3471e-9458-83ec-9204-728fa8ce2b97): đã mở và đọc các phần liên quan ngày 10/11/2026. Ngoài ý tưởng AI SaaS, có yêu cầu đọc tài liệu đúng framework/version, tìm built-in/dependency/shared code trước khi viết mới và tránh sửa sót module. Soft-delete là ví dụ từ dự án khác, chưa phải policy DATN.
- Các câu trả lời AI trong link là nguồn ý tưởng, không tự trở thành yêu cầu đã chốt hoặc bằng chứng rằng một kiến trúc/thư viện hoạt động. Chưa xác minh toàn bộ bài viết/hình ảnh được dẫn trong link.
- Yêu cầu trực tiếp ngày 11/11/2026: dùng Codex review và viết chi tiết thêm phần vừa làm. [Báo cáo review](reviews/02-nen-tang-ai-va-cau-hinh-dong.md) và [chương 13](13-dac-ta-thuc-thi-ai-va-cau-hinh.md) là đầu ra; không suy yêu cầu viết chi tiết thành chấp thuận mọi giải pháp hoặc triển khai sản phẩm ngay.

Yêu cầu, khuyến nghị và điều còn mở được tách rõ trong [chương 11](11-nen-tang-ai-va-cau-hinh-dong.md) và [chương 12](12-nguyen-tac-phat-trien-va-bang-chung.md).

## Tài liệu kỹ thuật bên ngoài đã đọc

| Nguồn | Nội dung đã đối chiếu | Giới hạn |
| --- | --- | --- |
| [ESP-IDF — ESP-MQTT](https://docs.espressif.com/projects/esp-idf/en/stable/esp32/api-reference/protocols/mqtt.html) | ESP-MQTT hỗ trợ MQTT; đã tách component riêng từ ESP-IDF v6.0 | Chưa chọn/built phiên bản cho board thực tế |
| [ESP-MQTT Programming Guide](https://docs.espressif.com/projects/esp-mqtt/en/latest/) | Hỗ trợ TLS, auth, LWT, QoS; bản tin QoS 1/2 chưa xác nhận có thể được gửi lại; outbox có expiry | Không suy ra queue bền qua mất nguồn; phải thiết kế/đo riêng |
| [NestJS — Modules](https://docs.nestjs.com/modules) | Tổ chức capability bằng module và quan hệ imports/exports/providers | Chỉ dùng để đánh giá cách tổ chức backend; chưa dựng ứng dụng |
| [IETF — RFC 9110: HTTP Semantics](https://www.rfc-editor.org/rfc/rfc9110.txt), 2022 | §9.2.2: idempotency và retry; §13.1.1: `If-Match` với strong ETag để tránh lost update; §13.2.2: thứ tự đánh giá precondition | HTTP semantics không tự chống trùng mọi `POST`; phải kiểm transaction, version và tác động thực tế trong ứng dụng |
| [OpenAPI Initiative — OpenAPI Specification 3.1.1](https://spec.openapis.org/oas/v3.1.1.html), 2024 | Hợp đồng mô tả HTTP API; Schema Object dựa trên JSON Schema Draft 2020-12; `format` mặc định là annotation | 3.1.1 là phiên bản nguồn đã đọc, chưa khóa version toolchain dự án; mô tả security không thay backend enforcement |
| [JSON Schema — Validation, Draft 2020-12](https://json-schema.org/draft/2020-12/json-schema-validation) | Kiểm cấu trúc và các từ khóa validation; phân biệt format-annotation và format-assertion | Phải kiểm khả năng/cấu hình validator cụ thể; schema đúng cấu trúc chưa chứng minh đúng nghiệp vụ |
| [OWASP — Authorization Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html) | Deny by Default; Validate the Permissions on Every Request | Hướng dẫn không tự triển khai quyền; cần kiểm object/tenant, export, tác vụ nền và thu hồi quyền |
| [Microsoft — RESTful web API design](https://learn.microsoft.com/en-us/azure/architecture/best-practices/api-design) | Thiết kế quanh resource, URI, HTTP methods và request stateless | Căn cứ thiết kế, không phải benchmark hoặc quyết định chọn Azure/framework |
| [OWASP — LLM Prompt Injection Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/LLM_Prompt_Injection_Prevention_Cheat_Sheet.html), đọc 11/11/2026 | Structured Prompts with Clear Separation: nhãn/prompt không phải enforcement; Agent-Specific Defenses/Least Privilege: kiểm tool với quyền và context; Monitoring: lọc secrets/dữ liệu nhạy cảm; Report results with their limits: công bố giới hạn tập thử | Không sao chép ví dụ SDK/regex làm cơ chế bảo vệ; không hứa chống prompt injection tuyệt đối hoặc coi passing smoke test là an toàn production |

Các nguồn khảo sát ban đầu trong bảng được truy cập trực tiếp và đọc phần liên quan ngày **10/11/2026**; nguồn đọc bổ sung được ghi ngày riêng bên dưới. Các nguồn trả HTTP 200 ở lần đọc thành công; JSON Schema trả 403 ở một lần truy cập bổ sung. Tra cứu Context7 gặp giới hạn quota nên dùng nguồn chính thức trực tiếp. Không sao chép mã thư viện; khi lấy code/asset/dataset cần ghi giấy phép cụ thể. Các nguồn phần mềm này mô tả tiêu chuẩn/hướng dẫn, không cung cấp kết quả thực nghiệm của đồ án.

Ngoại lệ ngày đọc trong bảng: nguồn OWASP Prompt Injection được đọc bổ sung **11/11/2026**. Cùng ngày đọc lại RFC 9110 §13.1.1, §15.5.10 và §15.5.13 để phân biệt `If-Match`, `409` và `412`; cập nhật nhất quán chương 04/13. Công cụ web không trả nội dung ở lượt tra cứu này nên lấy trực tiếp nguồn chính thức qua HTTP, nhận 200 và đọc phần liên quan. Không ghi các lần tra cứu rỗng thành nguồn đã xác minh. Các quy tắc run/lineage/quota/cutover/sandbox trong chương 13 là thiết kế đề xuất của dự án có review, không gán chúng thành nội dung được RFC hoặc OWASP bảo đảm.

React/Vite, PostgreSQL, Mosquitto và các mã cảm biến hiện chỉ là ứng viên kiến trúc. Chưa khảo sát đầy đủ API/version, datasheet module, giá linh kiện hay nền tảng push. Không coi bảng công nghệ là kết quả benchmark hoặc bằng chứng tương thích.

## Thông tin còn cần xác nhận

| Thông tin | Vì sao ảnh hưởng thiết kế | Giả định tạm dùng |
| --- | --- | --- |
| Trường, ngành, giảng viên, rubric và biểu mẫu | Quyết định mức nghiên cứu và hồ sơ nộp | Chưa giả định chương/bìa/mẫu bắt buộc |
| Thời hạn, số người và kinh nghiệm công nghệ | Quyết định quy mô và stack khả thi | Chưa đặt lịch; ưu tiên một backend và web responsive |
| Ngân sách và linh kiện đang có | Quyết định board, cảm biến, nguồn, vỏ | Chưa có giá, chưa đặt mua |
| Vị trí đeo và cách đo nhịp tim | Ảnh hưởng chất lượng tín hiệu và ngã giả | Khảo sát trên bàn trước, chưa chốt cổ tay |
| Dùng trong nhà hay ngoài nhà | Quyết định Wi-Fi/BLE/gateway/SIM | Prototype đầu ở vùng Wi-Fi |
| Người cao tuổi có tài khoản riêng không | Quyết định chủ hồ sơ/người đại diện và đồng ý chia sẻ | Mô hình chủ hồ sơ rõ ràng; đại diện cần đặc tả thêm |
| Kênh báo người thân | Ảnh hưởng app nền, chi phí và khả năng giao nhận | Demo trong web đang kết nối; push là mở rộng cần thử |
| Ranh giới tự chủ và quyền AI | Yêu cầu AI thực thi đã rõ; còn cần chốt tool, ủy quyền, hành động cần duyệt và phép đánh giá | Đề xuất runtime dùng tools/config; code mới đi qua luồng phát triển riêng; không tự chẩn đoán |
| Mức tổng quát và ý nghĩa workspace/tenant | Quyết định module dùng chung, phạm vi dữ liệu và cách chứng minh mở rộng | Đề xuất sức khỏe IoT là ứng dụng đầu tiên, module công việc/bảo trì là bằng chứng tái sử dụng |
| Phạm vi cấu hình và duyệt frontend | Quyết định ai sửa/duyệt giao diện cá nhân hoặc dùng chung, công bố version và rollback | Yêu cầu preview đã xác nhận; cơ chế cụ thể ở chương 11 còn là đề xuất |
| Thu dữ liệu người thật và retention | Quyết định đồng ý, quyền dùng, lưu/xóa, thử nghiệm | Dữ liệu tổng hợp cho bản đầu |

Các câu hỏi này dùng để hoàn thiện thiết kế khi có thông tin, không chặn phần tài liệu và khung thư mục đã chuẩn bị. Ưu tiên làm rõ yêu cầu trường và thiết bị sẵn có trước khi khóa công nghệ.

## Cách bổ sung nguồn nghiên cứu

Với mỗi tài liệu mới, ghi tác giả/tổ chức, tiêu đề, URL/DOI/tệp, năm, ngày đọc, giấy phép/điều kiện dùng, luận điểm sử dụng, phương pháp/dữ liệu đánh giá và giới hạn. Phân biệt nguồn y tế, thuật toán cảm biến, kỹ thuật phần mềm và yêu cầu trường. Không thêm trích dẫn chưa đọc để làm đầy phần tài liệu tham khảo.
