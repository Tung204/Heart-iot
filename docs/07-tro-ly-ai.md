# Trợ lý AI

> **Baseline v0.1 — AI đọc và tóm tắt:** đây là phạm vi thiết kế ban đầu. Người dùng đã yêu cầu AI thực thi nghiệp vụ và tự chạy trong phạm vi được giao; xem [chương 11](11-nen-tang-ai-va-cau-hinh-dong.md). Phần **AI vận hành dài hạn** (planner/tool registry/scheduler/RAG) chưa triển khai; các nguyên tắc kiểm quyền, dẫn nguồn và cảnh báo độc lập tiếp tục được giữ.

**Trạng thái 21/11/2026:** đã có `GET /subjects/:id/assistant/summary` và `POST /subjects/:id/assistant/ask` trên aggregate đã kiểm quyền, adapter OpenAI-compatible tùy chọn và **fallback template xác định**; thêm **backend FR-21** cho nháp lịch nhắc có preview/confirm, gồm parser rule-based cho một số câu lệnh đơn giản (chưa có UI, chưa hiểu câu phức tạp). Web đưa trợ lý vào **ô hỏi ngay trên màn Hôm nay `/app`**; câu trả lời chỉ hiện sau khi người dùng hỏi, không còn bản tin/cột bối cảnh chiếm màn đầu. Sức khỏe chi tiết ở `/app/overview`; cảnh báo vẫn có route riêng. AI không nằm trong đường quyết định phát hiện/gửi cảnh báo té ngã, không tự xác nhận/đóng cảnh báo. Chưa có RAG, chưa có bằng chứng chất lượng trả lời với provider thật, chưa có toggle tắt AI trên UI và chưa có runtime AI tự chạy tool.

## Trải nghiệm trợ lý hiện tại

- **Mặc định:** `/app` là Hôm nay; trợ lý là một ô hỏi + 3 gợi ý ngắn, không phải một workspace riêng. Sức khỏe chi tiết ở `/app/overview`; cảnh báo vẫn có route riêng và không phụ thuộc AI.
- **Không chiếm màn đầu:** không còn bản tin, 4 chỉ số, cột bối cảnh hay `DataQualityPanel` trên Hôm nay. Câu trả lời chỉ xuất hiện sau câu hỏi đầu tiên; hội thoại nhiều lượt vẫn giữ trong phiên.
- **Hội thoại:** câu hỏi và câu trả lời nối tiếp; composer nằm ngay dưới thẻ trạng thái, trên bottom-nav ở mobile. Câu trả lời vẫn đi qua API đã kiểm quyền, có nguồn/chất lượng dữ liệu/disclaimer trong nội dung.
- **Quyền là tín hiệu:** thiếu `canViewMeasurements` thì ô hỏi hiện trạng thái quyền, không mời thử lại vô ích; thiếu `canReceiveAlerts` thì không tải cảnh báo. Không biến 403 thành “chưa có cảnh báo mở”.
- **Quyền:** thiếu `canViewMeasurements` → 403 hiển thị trạng thái “Chủ hồ sơ không chia sẻ số đo”, khóa gửi câu hỏi và không mời thử lại vô ích. Thiếu `canReceiveAlerts` → không gọi API cảnh báo.
- **Cô lập hồ sơ:** đổi hồ sơ làm reset thread/câu hỏi/lỗi; phản hồi muộn của hồ sơ cũ bị bỏ. Có test cho cả hai trường hợp.
- **Hành động (FR-21 backend, 21/11/2026):** trợ lý có thể tạo **nháp** lịch nhắc chăm sóc (`care_reminder.create`); người dùng xem preview rồi xác nhận mới ghi `care_reminders`. Nháp hết hạn sau 15 phút, chỉ chủ hồ sơ, xác nhận lặp không nhân đôi; audit không chứa tiêu đề/ghi chú. Ngoài input có cấu trúc, `POST /subjects/:id/assistant/drafts/from-text` dùng **parser rule-based** cho câu đơn giản (“nhắc tôi … lúc 8h”, “hằng ngày”, “thứ 2 đến thứ 6”, “mai”); parser **không gọi LLM**, từ chối liều lượng/ngày kết thúc chưa hỗ trợ; nếu không nêu thứ thì mặc định cả tuần, nếu mọi giờ hôm nay đã qua thì bắt đầu từ mai. Chủ hồ sơ có thể `PATCH /assistant/drafts/:id` để sửa preview trước confirm; sửa nháp không ghi nghiệp vụ. `GET /subjects/:id/assistant/drafts` trả nháp còn hạn để UI khôi phục. **Chưa có UI**. Prompt summary/ask cũng cấm tự tạo/sửa/xóa lịch nhắc, cảnh báo, công việc hoặc quyền.
- **Không can thiệp:** trợ lý không tự xác nhận/đóng/hủy cảnh báo, không đổi cấu hình/ngưỡng thiết bị, không cấp/thu quyền, không xóa dữ liệu, không chẩn đoán/kê đơn, không gửi tin khẩn và không điều khiển firmware. Catalog này trả qua `GET /subjects/:id/assistant/capabilities`; backend vẫn kiểm quyền ở từng endpoint, không dựa vào UI ẩn nút.

## Phạm vi theo mức hoàn thiện

| Mức | Đầu vào | Đầu ra | Điều kiện |
| --- | --- | --- | --- |
| Baseline không dùng LLM | Thống kê xác định bằng code | Tóm tắt theo mẫu và cảnh báo thiếu dữ liệu | Có thể làm ngay khi có aggregate đúng |
| MVP AI giới hạn | Aggregate đã kiểm quyền, chất lượng/coverage, khoảng thời gian | Diễn đạt tóm tắt ngày dễ đọc; dẫn tham chiếu dữ liệu | Kiểm số liệu và khoảng thời gian trước trả kết quả |
| Hỏi đáp có nguồn | Câu hỏi và đoạn tài liệu đã duyệt | Giải thích chung có nguồn; từ chối khi không đủ căn cứ | Có danh mục tài liệu, quyền sử dụng và bộ đánh giá |
| Gợi ý nguyên nhân/biện pháp trong đề cương | Bối cảnh được phép và nguồn y tế phù hợp | Chỉ khả năng chung được dẫn nguồn, không kết luận bệnh | Chưa đủ nguồn/đánh giá nên chưa đưa vào MVP |

MVP vẫn có thành phần AI, nhưng bắt đầu bằng việc tóm tắt có thể đối chiếu. Chưa chọn nhà cung cấp, chưa có corpus y tế được duyệt và chưa có bằng chứng chất lượng trả lời.

## Luồng dữ liệu

1. Backend xác thực người yêu cầu và quyền trên hồ sơ/khoảng thời gian: phải có `canViewMeasurements` (hoặc là chủ hồ sơ) **và** `canViewAi`; thiếu quyền số đo trả 403 nghiệp vụ, thiếu quyền AI trả 403.
2. Code truy vấn và tính aggregate: số mẫu hợp lệ, coverage theo cấu hình thu, khoảng bị thiếu, min/max/trung bình trên mẫu hợp lệ và incident. Mẫu cách ly/tương lai/unsynced bị loại khỏi aggregate.
3. Bộ lọc tạo đầu vào tối thiểu, bỏ tên, số điện thoại, credential và thông tin không phục vụ câu hỏi.
4. Adapter gọi model hoặc trả tóm tắt theo mẫu khi AI tắt/lỗi. Model không tự chạy SQL, truy cập broker hoặc gửi thông báo.
5. Validator kiểm cấu trúc, tham chiếu nguồn, khoảng thời gian và các số liệu được trích. Không đạt thì trả fallback hoặc yêu cầu diễn đạt lại có giới hạn.
6. Kiểm lại quyền trước khi trả/lưu kết quả; thao tác thu hồi quyền trong lúc sinh không được làm rò dữ liệu.

Đầu ra hiện tại gồm `headline`, `sections`, `sources`, `degradedReason` và **`dataQuality`**. `dataQuality` có `coveragePercent`, `observedCount`, `expectedCount`, `gaps {count, reasons}`, `lastSeenAt`, `synthetic`, `limitations`; chỉ chứa số đếm/phần trăm/thời điểm/mã lý do, không chứa BPM/bước/pin thô. `sources` chỉ dùng các tài liệu đã tra được. Dẫn nguồn không tự chứng minh nội dung suy luận đúng.

**Hành vi đã kiểm:** template và prompt provider buộc nêu coverage/gaps/synthetic; hậu kiểm thay cụm “bình thường/ổn định” bằng “chưa đủ dữ liệu để kết luận” khi thiếu dữ liệu. Câu hỏi ngoài phạm vi bị từ chối; câu hỏi chẩn đoán không được trả lời như kết luận y khoa. Test API ở `backend/test/assistant.spec.ts`; FR-21 ở `backend/test/assistant-actions.spec.ts` (nháp không ghi, confirm idempotent, hết hạn/hủy/digest sai, quyền, from-text, sửa nháp, danh sách nháp) và `backend/test/assistant-draft-parser.spec.ts` (7 mẫu câu lỗi/hợp lệ); test web ở `AssistantPage.test.tsx` (hội thoại nhiều lượt, 403, 429, đổi hồ sơ, không auto-ack). Lượt v4: API 20 suite/219 test; web 35 file/250 test; E2E 26/26 trên Chromium headless. FR-21 ngày 21/11/2026: API **34 suite/313 test**; chưa có UI/E2E preview-confirm. Chưa kiểm provider thật, Firefox/WebKit hay chất lượng câu trả lời ngoài bộ mock/template.

## Quy tắc nội dung

- Không suy luận “sức khỏe bình thường” từ việc không có sự kiện hoặc từ thời gian thiết bị offline.
- Không biến ít dữ liệu thành kết luận tăng/giảm vận động; nêu giới hạn khi so sánh hai ngày có độ phủ khác nhau.
- Không tự đề xuất thuốc, liều dùng hoặc kết luận bệnh từ BPM/cảnh báo ngã.
- Khi câu hỏi về tình huống cần hỗ trợ ngay, ưu tiên hướng dẫn liên hệ người hỗ trợ/chuyên môn phù hợp; không trì hoãn hành động để chờ AI.
- Nội dung tài liệu và lời người dùng là dữ liệu, không được ghi đè quyền truy cập hoặc chỉ dẫn hệ thống. Kiểm prompt injection trong tài liệu được truy hồi.
- Không huấn luyện lại hoặc gửi dữ liệu sức khỏe thật sang dịch vụ bên ngoài mặc định; phải xác định cơ sở đồng ý và chính sách lưu dữ liệu trước.
- AI không được vượt quyền của người đang xem: không đọc hồ sơ khác, không đọc số đo khi `canViewMeasurements=false`, không đọc khi thiếu `canViewAi`, không dùng role admin để mở dữ liệu sức khỏe. Quyền được kiểm ở backend trước khi tổng hợp và trước khi trả kết quả, không dựa vào việc UI ẩn nút.
- Không đưa số đo, tên, số điện thoại, token hay nội dung chat riêng tư vào audit/log mặc định; audit chỉ ghi metadata cần điều tra.

## Chuẩn bị nguồn

Mỗi nguồn kiến thức cần URL/tài liệu gốc, tổ chức/tác giả, ngày xuất bản/cập nhật, ngày truy cập, quyền sử dụng, chủ đề, đoạn được dùng và người/cách kiểm. Đề xuất tìm ở tổ chức y tế có thẩm quyền, hướng dẫn chuyên môn và bài nghiên cứu được đánh giá; chưa xem một URL chưa đọc là nguồn đã xác minh.

Chưa cần vector database ở bản đầu. Bắt đầu bằng tập tài liệu nhỏ được duyệt và truy xuất có kiểm soát; chỉ thêm tìm kiếm ngữ nghĩa khi có bài toán và phép đo cần thiết.

## Đánh giá đề xuất

Chuẩn bị bộ tình huống tổng hợp với đáp án/tiêu chí trước khi chạy: ngày đủ dữ liệu, thiếu 80% thời gian, chỉ số không hợp lệ, thay đổi timezone, một incident trùng, câu hỏi ngoài phạm vi, yêu cầu dữ liệu người khác, nguồn không có câu trả lời và prompt injection.

Chấm riêng tính đúng số liệu, đúng người/khoảng dữ liệu, khả năng nhận biết thiếu dữ liệu, độ đúng của dẫn nguồn, mức suy diễn vượt bằng chứng, độ trễ và chi phí mỗi lượt. Không chỉ chấm “nghe hợp lý”. Một số lỗi như lộ dữ liệu hồ sơ khác hoặc bịa số đo là lỗi chặn sử dụng, dù điểm trung bình cao.

Kết quả lưu model/version, prompt/config version, tập tình huống và điều kiện; **chưa có kết quả với provider thật** ở thời điểm này. Test hiện có dùng adapter giả/mock, kiểm fallback, quyền, dữ liệu thiếu và từ chối chẩn đoán; chưa có test prompt injection, chưa đo chi phí/độ trễ. Xem [kiểm thử và đánh giá](08-kiem-thu-va-danh-gia.md).

## Kế hoạch mở rộng trợ lý AI (bổ sung 18/11/2026 — đang triển khai từng phần)

**Nguyên tắc phần cứng và an toàn:** toàn bộ tính năng trợ lý AI dưới đây chạy ở phía server và giao diện web, **không đưa phát giọng nói hay xử lý AI xuống thiết bị đeo** nhằm giữ thiết bị nhỏ gọn cho người cao tuổi. Mọi chức năng mới vẫn tuân thủ kiểm quyền theo hồ sơ (`canViewMeasurements` + `canViewAi`), không tự chẩn đoán/kê đơn và không can thiệp đường cảnh báo té ngã/SOS.

| Mã | Tính năng mở rộng | Mô tả và ranh giới đề xuất |
| --- | --- | --- |
| `FR-20` | Bản tin tóm tắt cuối ngày/cuối tuần tự động | Tự động tổng hợp ngắn gọn tình hình đeo máy, mức vận động, pin, nhắc việc và khoảng thiếu dữ liệu theo lịch gửi vào hộp thông báo cho người có quyền; giữ fallback theo mẫu khi chưa cấu hình provider |
| `FR-21` | Nhờ AI tạo lịch nhắc/công việc có bước Xem trước – Xác nhận | **Đã có một phần backend (21/11/2026):** nháp `care_reminder.create` → preview → confirm, owner-only, audit, hết hạn/hủy/digest sai bị chặn; parser rule-based cho câu đơn giản (giờ, hằng ngày, thứ 2–6, mai). **Còn thiếu:** UI preview/confirm, câu phức tạp/ngày kết thúc, công việc bảo trì và xuất phiếu |
| `FR-22` | Điểm chú ý chuẩn bị đi khám trên phiếu theo dõi | Tổng hợp 3–5 thay đổi số liệu hoặc sự cố đáng chú ý kèm mốc thời gian và độ phủ dữ liệu để đính kèm phiếu PDF 1 trang (`FR-16`); chỉ nêu số liệu thực tế, không kết luận bệnh |
| `FR-23` | Hỏi đáp hướng dẫn chăm sóc có trích nguồn đã duyệt | Chỉ trả lời kiến thức chăm sóc/phòng ngã chung từ danh mục tài liệu chính thống đã kiểm duyệt và trích rõ tên nguồn; từ chối câu hỏi ngoài nguồn hoặc hỏi chẩn đoán cá nhân |
