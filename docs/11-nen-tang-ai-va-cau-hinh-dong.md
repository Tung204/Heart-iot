# Nền tảng AI, web/app và cấu hình động

Ngày ghi nhận: **10/11/2026**. Đây là tài liệu thu thập yêu cầu và đề xuất để chốt hướng, **chưa phải đặc tả triển khai được duyệt**.

**Trạng thái 15/11/2026:** đã có ứng dụng IoT v1/v2 (API, web, simulator) và trợ lý tóm tắt/hỏi đáp giới hạn; **chưa có AI runtime dài hạn**, planner/tool registry, scheduler, approval flow, RAG hay cơ chế sinh module chạy được. Các mục dưới đây là đề xuất cho phần chưa triển khai, trừ khi được ghi rõ là đã có trong [chương 14](14-ke-hoach-trien-khai-phan-mem.md).

Bổ sung ngày **11/11/2026**: [chương 13](13-dac-ta-thuc-thi-ai-va-cau-hinh.md) cụ thể hóa delegation, capability, vòng đời tác vụ, chống trùng, cấu hình/preview, ranh giới code và phép kiểm. [Review Codex](reviews/02-nen-tang-ai-va-cau-hinh-dong.md) ghi các khoảng trống tìm được và cách bổ sung đặc tả; chưa chứng minh cơ chế runtime đã hoạt động.

## Điều đã xác nhận và điều còn đề xuất

| Nội dung | Trạng thái và nguồn |
| --- | --- |
| Web/app có giao diện nghiệp vụ thông thường, CRUD, tìm kiếm, lọc, báo cáo, xuất và hướng dẫn | Yêu cầu người dùng trong cuộc trao đổi và [link chia sẻ](https://chatgpt.com/share/6af3471e-9458-83ec-9204-728fa8ce2b97); v1/v2 đã có một phần giao diện, chưa đủ mọi mục |
| AI thực hiện công việc, có khả năng tự chạy trong phạm vi được giao; khách hàng ít quyền hơn admin | Yêu cầu người dùng; danh sách quyền cụ thể chưa chốt |
| Luôn duy trì tài liệu; Dynamic / Configurable; không bịa nghiệp vụ hoặc quyết định kỹ thuật thiếu căn cứ | Yêu cầu trực tiếp ngày 10/11/2026 |
| Frontend phải có preview và được chấp nhận trước khi áp dụng chính thức | Yêu cầu trực tiếp; cơ chế preview/phiên bản bên dưới là đề xuất |
| Đọc tài liệu framework đúng phiên bản, ưu tiên tái sử dụng, tránh sửa sót module | Yêu cầu được đọc trong cuộc trò chuyện chia sẻ; quy trình ở [nguyên tắc phát triển](12-nguyen-tac-phat-trien-va-bang-chung.md) |
| Nền tảng thực thi AI dùng chung, sức khỏe IoT là ứng dụng hoàn chỉnh đầu tiên | Hướng đề xuất được tiếp tục thảo luận; ranh giới nền tảng và mức mở rộng còn cần chốt |
| AI sửa mã backend qua môi trường phát triển riêng | Khuyến nghị trả lời câu hỏi đang mở; chưa coi là chính sách sản phẩm đã duyệt |
| Multi-agent, app builder sinh code, simulation, marketplace, digital twin | Ý tưởng tham khảo dài hạn, chưa cam kết triển khai |

Đã truy cập nội dung cuộc trò chuyện chia sẻ, gồm cả phần bổ sung về tái sử dụng thư viện và sửa đổi xuyên module. Bài trả lời của ChatGPT là nguồn ý tưởng; những liên kết/khẳng định bên trong không mặc nhiên trở thành bằng chứng kỹ thuật đã kiểm chứng.

Các chương 02/03/06/07 mô tả baseline v0.1 trước yêu cầu AI thực thi. Giữ chúng để đối chiếu; phạm vi AI chỉ đọc trong baseline không còn mô tả đầy đủ mục tiêu mới. Sau khi chốt tài liệu này phải cập nhật đồng bộ yêu cầu, kiến trúc, API, giao diện và kiểm thử trước khi triển khai AI Agent. Những giới hạn về quyền sức khỏe và đường cảnh báo độc lập vẫn có giá trị.

## Một nền tảng tổng quát cần làm những gì

Đề xuất xây lõi dùng chung có hợp đồng mở rộng rõ ràng. Mức tổng quát được chứng minh bằng khả năng tái sử dụng ở module thứ hai, không bằng số lượng tên Agent hoặc số trang CRUD.

| Thành phần | Trách nhiệm | Bằng chứng cần có khi triển khai |
| --- | --- | --- |
| Workspace và quyền | Tài khoản, thành viên, phạm vi dữ liệu, quyền theo vai trò và đối tượng | Hai workspace/hai hồ sơ không đọc hoặc sửa chéo qua UI, API, AI, export, tác vụ nền |
| Module và capability registry | Module khai báo chức năng, schema, service sở hữu và quyền cần thiết | Thêm module qua cơ chế mở rộng đã định nghĩa, không chép lại auth/audit/AI orchestration |
| Business Services và API | Một nơi thực thi mỗi nghiệp vụ; UI thủ công và AI cùng gọi | Cùng đầu vào/quyền cho hành vi nhất quán; không có đường AI bỏ qua validation |
| AI execution | Hiểu yêu cầu, chọn tool, lập kế hoạch, chạy nhiều bước, lưu tiến độ, tiếp tục/dừng | Mất kết nối hoặc worker khởi động lại không làm mất trạng thái hoặc lặp tác động đã hoàn tất |
| Dynamic workspace | Form, bảng, bộ lọc, báo cáo, dashboard và workflow cấu hình được | Thay cấu hình có version, preview; dữ liệu mới không đòi sửa nhánh code theo kịch bản demo |
| Theo dõi và quản trị | Lịch sử thực thi, quyền được giao, chi phí, tác vụ chờ duyệt, lỗi | Truy được người yêu cầu → tác vụ → tool → kết quả thực tế, kể cả thất bại một phần |

Ứng dụng sức khỏe IoT vẫn cần hoàn chỉnh: thiết bị → tiếp nhận dữ liệu → quyền chia sẻ → giao diện theo dõi → vòng đời cảnh báo → trợ lý và báo cáo. Đề xuất module thứ hai là **công việc/bảo trì thiết bị** để chứng minh lõi dùng chung. Chưa chốt thêm CRM, ERP, thanh toán thuê bao hay nhiều ứng dụng độc lập vào phạm vi đồ án.

Workspace/tenant cần định nghĩa theo người dùng thực tế: hộ gia đình, tổ chức hay đơn vị cung cấp dịch vụ. Không mặc định một tài khoản tương đương một tenant; quyền trên hồ sơ sức khỏe vẫn cần xét riêng. Admin kỹ thuật không mặc định được đọc sức khỏe hoặc hội thoại riêng.

## AI có nên sửa backend

**Khuyến nghị: cho AI thay đổi hành vi qua dữ liệu/cấu hình được phép; cho AI phát triển mã backend trong một luồng phát triển tách biệt.** Không cấp khả năng sửa code đang chạy hoặc migration tùy ý cho Agent vận hành.

| Loại thay đổi | Cách AI thực hiện đề xuất | Điều kiện |
| --- | --- | --- |
| Dữ liệu nghiệp vụ: hồ sơ, công việc, báo cáo | Gọi Business Tool/API đã đăng ký | Quyền thực tế của người giao việc, validation, điều kiện trước thực thi, audit |
| Cấu hình: lịch chạy, mẫu báo cáo, workflow, trường mở rộng | Tạo/cập nhật cấu hình theo schema đã hỗ trợ | Phạm vi được giao, version, kiểm tác động; chỉ tự áp dụng nếu chính sách cho phép |
| Giao diện: form, dashboard, menu, trang | Tạo bản nháp từ component/capability có sẵn | Preview và người có quyền chấp nhận trước khi áp dụng chính thức |
| Module cấu hình trong khả năng của engine | Soạn manifest, cấu hình trường/quy trình/quyền được đề nghị | Kiểm tương thích, chạy thử; duyệt giao diện và các thay đổi cần quyền quản trị |
| Tool mới có hành vi chưa được cài đặt, code backend hoặc migration | Coding Agent tạo diff trong branch; chạy code trong môi trường có quyền bị giới hạn riêng | Có yêu cầu, impact analysis, kiểm thử, review và quyền phát hành riêng; branch không phải sandbox thực thi |
| Cơ chế auth, cách ly tenant, secrets, luật bảo vệ cốt lõi | Luồng thay đổi kỹ thuật đặc biệt của người có thẩm quyền | Agent runtime không tự sửa cơ chế kiểm quyền hoặc tự cấp thêm quyền |

Hai vai trò AI có thể sử dụng cùng model nhưng phải khác credential và đường thực thi. **AI vận hành** chỉ dùng capability được cấp; **AI hỗ trợ phát triển** tạo code/tài liệu/bài kiểm thử ở môi trường phát triển. Không chuyển quyền production hoặc credential của developer vào Agent runtime.

Luồng đề xuất khi thật sự cần code mới: yêu cầu → khảo sát/tài liệu/impact map → branch chứa diff và môi trường thực thi giới hạn quyền → test → review/preview phù hợp → phát hành đúng bản được duyệt → theo dõi. Nếu đưa Coding Agent vào sản phẩm, tiến trình coding/build/test không được có credential hoặc đường ghi production, không đọc secrets/file ngoài phạm vi được cấp; filesystem, network và database phải được cưỡng chế ở môi trường chạy. Quyền release nằm ở đường phát hành riêng. Đây là điều kiện cho năng lực còn đang đề xuất, chưa yêu cầu dựng sandbox ngay hoặc khẳng định sandbox đã có. Chi tiết và cách kiểm nằm ở mục 7 của chương 13.

Rollback code không tự phục hồi dữ liệu đã biến đổi; migration cần xét riêng khả năng phục hồi, backup và tương thích với phiên bản cũ.

## Dynamic / Configurable có ranh giới cụ thể

| Có thể cấu hình | Cơ chế đề xuất | Giới hạn cần giữ |
| --- | --- | --- |
| Nhãn, cột, bố cục, bộ lọc, form, dashboard | Metadata tham chiếu component/schema được hỗ trợ | Không nhận HTML/JavaScript tùy ý từ model để chạy với quyền ứng dụng |
| Workflow, lịch chạy, điều kiện và hành động | Đồ thị hữu hạn với trigger và tool đã đăng ký | Giới hạn vòng lặp, thời gian, chi phí, retry; không thực thi chuỗi lệnh tùy ý |
| Trường mở rộng của module | Schema có kiểu dữ liệu, validation và version | Thay đổi kiểu/xóa trường có tác động dữ liệu; không coi mọi thay đổi schema đều an toàn |
| Vai trò và quyền được gán | Cấu hình assignment/grant theo capability | Chỉ người có quyền quản trị tương ứng được cấp/thu hồi; AI không đổi chính cơ chế enforcement |
| Chọn model/provider và giới hạn tác vụ | Adapter có hợp đồng và cấu hình phía server | Chọn trong tập đã kiểm tương thích; secrets không nằm trong prompt hoặc cấu hình UI |
| Chu kỳ nhận dữ liệu, timeout kỹ thuật, kênh thông báo | Cấu hình có đơn vị, miền giá trị và phạm vi | Ngưỡng phát hiện ngã/thuật toán sức khỏe cần nguồn và kiểm chứng riêng; model không tự điều chỉnh vì suy đoán |

Đề xuất vòng đời cấu hình: **nháp → kiểm hợp lệ → xem trước/chạy thử → chấp nhận theo chính sách → kích hoạt → theo dõi**. Lưu phiên bản nền, nội dung thay đổi, người yêu cầu, phạm vi, người duyệt nếu có và phiên bản đang áp dụng. Thay nội dung sau khi duyệt thì bản duyệt cũ không còn hiệu lực cho nội dung mới.

Mỗi lần chạy gắn với phiên bản workflow/tool phù hợp để giải thích và phục hồi. Quyền truy cập phải kiểm lại theo trạng thái hiện tại trước từng tác động và trước giao kết quả; version cũ không được giữ lại quyền đã bị thu hồi. Cấu hình thay đổi không được âm thầm đổi cách xử lý một tác vụ đang chạy.

Các hằng số giao thức, thuật toán đã kiểm thử và bất biến bảo mật có thể nằm trong code. “Không hard-code” ở đây là không đóng cứng dữ liệu khách hàng, tên hồ sơ, kết quả báo cáo hay quy trình cần thay đổi vào code/prompt để demo. Một manifest mới chỉ kết hợp những khả năng engine đã hỗ trợ; nó không tự tạo ra một integration hoặc thuật toán chưa tồn tại.

## Tự chủ mà vẫn biết lúc thiếu thông tin

Đề xuất người dùng giao **mục tiêu kèm phạm vi ủy quyền**: đối tượng, tool được phép, thời hạn, lịch chạy, hạn mức tác động/chi phí, điều kiện dừng và hành động cần duyệt. Với quy trình đã được ủy quyền, AI tự làm các bước hợp lệ mà không hỏi lại từng thao tác. Có thể thu hồi nhiệm vụ và quyền; nút dừng ngăn bước tiếp theo, không mặc định đảo ngược tác động đã xảy ra.

Ví dụ tổng hợp: “Theo dõi các thiết bị được giao, tạo công việc kiểm tra khi mất tín hiệu theo chính sách đã cấu hình và chuẩn bị báo cáo hằng ngày.” AI có thể tìm thiết bị, kiểm lại tình trạng, tạo công việc tránh trùng, cập nhật báo cáo và ghi lịch sử. Quy trình xác định được chạy bằng scheduler/event handler; không cần gọi model cho từng mẫu cảm biến. Model hỗ trợ lập kế hoạch, phân tích và xử lý ngoại lệ trong phạm vi tool.

Thiếu ngưỡng đã được chấp thuận, không rõ hồ sơ nào, hoặc có nhiều bản ghi cùng tên thì AI tìm thêm bằng chứng hoặc yêu cầu làm rõ phần đó. Nó có thể tiếp tục phần độc lập nhưng không tự bịa giá trị rồi ghi dữ liệu. Tool không tồn tại thì báo giới hạn và tạo đề xuất mở rộng, không giả báo thành công.

Đường cảnh báo té ngã tiếp tục hoạt động khi model lỗi hoặc không có AI. Không dùng sự tự chủ của Agent để thay quyền của người thân hoặc tự kết luận người được theo dõi đã an toàn.

## Preview frontend phải kiểm được gì

Yêu cầu người dùng là **xem trước và chấp nhận trước khi áp dụng**. Cơ chế hiện thực đề xuất:

1. Tạo bản nháp có ID/version, diff với bản hiện tại và phạm vi cá nhân/workspace/toàn hệ thống.
2. Hiển thị preview có thể tương tác: layout, dữ liệu mẫu có nhãn hoặc dữ liệu được phép, trạng thái rỗng/lỗi và màn hình nhỏ. Những nút trong preview không được âm thầm ghi vào dữ liệu thật.
3. Kiểm schema, component/data source được phép và quyền; ẩn nút không thay kiểm quyền backend.
4. Người có quyền chấp nhận đúng phiên bản. Ghi nhận phiên bản nền để phát hiện có người đã sửa trong lúc xem trước.
5. Áp dụng phiên bản được duyệt, đồng bộ giao diện; cung cấp cách trở lại cấu hình trước nếu tương thích.

Bảng/biểu đồ trả về trong AI Canvas là kết quả tạm của yêu cầu, không tự được lưu thành trang chính thức. Nếu có thao tác “Lưu thành dashboard/trang”, phải đi qua preview và chấp nhận. Cần chốt cụ thể ai duyệt giao diện cá nhân và ai duyệt giao diện dùng chung.

## Các lựa chọn kỹ thuật để chốt có căn cứ

Đây là **đề xuất có nguồn**, chưa phải quyết định chốt framework/version. Nguồn chính thức và giới hạn được ghi ở [chương 10](10-nguon-va-cau-hoi-mo.md).

| Đề xuất | Căn cứ đã đọc | Cần kiểm chứng trong dự án |
| --- | --- | --- |
| HTTP API thiết kế theo REST cho tài nguyên nghiệp vụ | Microsoft RESTful API design; HTTP semantics trong RFC 9110 | Quy ước resource, method, lỗi, phân trang, xác thực và compatibility; không gọi bất kỳ JSON endpoint nào là REST hoàn chỉnh |
| OpenAPI làm hợp đồng HTTP API | OpenAPI 3.1.1 mô tả giao diện HTTP; hỗ trợ sinh tài liệu và công cụ | Chọn phiên bản thực sự được toolchain hỗ trợ, kiểm contract khớp service; đặc tả không tự thực thi phân quyền |
| JSON Schema cho đầu vào tool và cấu hình động | JSON Schema Validation 2020-12; Schema Object của OpenAPI 3.1.1 | Chọn validator tương thích, cấu hình rõ việc kiểm `format`; schema đúng cấu trúc chưa bảo đảm đúng nghiệp vụ |
| Kiểm quyền ở backend tại mọi đường truy cập | OWASP Authorization Cheat Sheet: deny by default, validate every request | Kiểm quyền trên đối tượng/thuộc tính, tenant, export, job, realtime; AI không được tự khai scope đáng tin |
| Conditional update khi dữ liệu thay đổi đồng thời | RFC 9110 §13.1.1: `If-Match` với strong ETag | Áp dụng check phiên bản cùng thao tác ghi; preview cũ bị từ chối khi không còn phù hợp |
| Chống lặp tác động khi retry | RFC 9110 §9.2.2 giải thích idempotency và giới hạn retry | Khóa chống trùng ở ứng dụng, transaction và kiểm trạng thái; dùng REST không tự làm mọi `POST` idempotent |

REST không thay MQTT cho thiết bị, không thay cơ chế đẩy realtime và không tự cung cấp durable workflow. Tool runtime có thể gọi service nội bộ đã kiểm quyền; không bắt mọi lời gọi trong cùng backend phải đi vòng qua HTTP. Framework, database, broker, AI provider, version và thư viện workflow vẫn chưa khóa.

## Demo và bằng chứng để bảo vệ đồ án

Kịch bản dưới đây là đề xuất chuẩn bị, chưa có kết quả thực nghiệm hoặc rubric của trường.

| Phần trình diễn | Điều cần chứng minh | Bằng chứng lưu |
| --- | --- | --- |
| Thiết bị thật gửi dữ liệu | Tín hiệu đến đúng hồ sơ, timestamp/chất lượng/offline đúng; phân biệt dữ liệu mô phỏng | Sơ đồ phần cứng, cấu hình firmware, log có định danh, phép đo độ trễ/chất lượng |
| Giao một nhiệm vụ nhiều bước | AI dùng công cụ thật, UI cùng cập nhật, không dùng kết quả cài sẵn | Run ID, tool calls đã lọc dữ liệu nhạy cảm, trước/sau trong database/API |
| Vận hành tự động | Sự kiện/lịch kích hoạt công việc trong phạm vi đã giao | Event và task timeline, kết quả, quyền/phiên bản cấu hình |
| Thay workflow/giao diện bằng hội thoại | Hành vi đổi qua cấu hình; preview trước khi áp dụng | Diff/version, tương tác preview, chấp nhận và kết quả sau áp dụng |
| Gây lỗi có chủ đích | Retry không lặp tác động; restart tiếp tục; dữ liệu cũ không ghi đè | Test timeout sau commit, khởi động lại worker, xung đột version |
| Kiểm quyền và dữ liệu thiếu | Customer không vượt quyền; tác vụ mất quyền dừng đúng; không bịa khi không có số đo | Test chéo hồ sơ/tenant, thu hồi giữa tác vụ, ambiguous target, nguồn thiếu |
| Thêm module nhỏ | Dùng lại lõi/service/tool contracts; không phải một chuỗi demo đóng cứng | Diff thêm module, phần lõi được tái sử dụng, test với dữ liệu/tên/điều kiện mới |
| Quá trình phát triển | Giải thích được lựa chọn và sửa lỗi xuyên module | ADR, impact map, tài liệu versioned, test và kết quả đo có điều kiện |

Đo tỷ lệ hoàn thành nhiệm vụ, số lần cần người can thiệp, bước/thời gian thủ công so với AI, độ trễ, chi phí, lỗi quyền và tác động lặp. Xác định bộ tình huống trước khi đo, dùng trường hợp chưa có trong prompt demo; không đặt con số thành tích hoặc hứa điểm số khi chưa có dữ liệu/rubric.

## Những quyết định còn cần chốt

- Phê chuẩn ranh giới AI runtime/coding ở trên; có đưa sinh code module vào đồ án hay chỉ mở rộng bằng cấu hình.
- Ý nghĩa workspace/tenant, đối tượng người dùng và ma trận quyền thực tế; ai duyệt giao diện dùng chung.
- Phạm vi tự chạy, loại hành động phải duyệt, khả năng hoàn tác và giới hạn chi phí.
- Rubric, nhóm, thời hạn, phần cứng và ngân sách; từ đó chốt mức nền tảng và stack cụ thể.

Không cần đủ mọi thông tin để tiếp tục khảo sát tài liệu, nhưng chưa được điền các lựa chọn còn thiếu vào code như quyết định đã duyệt. Bốn phát hiện trong [review v0.1](reviews/01-thiet-ke-v0.1.md) vẫn chưa được giải quyết bởi tài liệu định hướng này.
