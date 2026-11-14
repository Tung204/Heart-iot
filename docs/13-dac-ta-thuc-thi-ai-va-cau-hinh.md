# Đặc tả đề xuất: thực thi AI và cấu hình động

Ngày soạn: **11/11/2026**. Tài liệu viết sâu từ [định hướng nền tảng](11-nen-tang-ai-va-cau-hinh-dong.md), phục vụ review và chốt kỹ thuật. **Mọi tên thực thể, trạng thái, tool và endpoint dưới đây là thiết kế đề xuất, chưa có implementation hoặc contract đã được duyệt.** Các ID và ví dụ đều tổng hợp. Không dùng tài liệu này để kết luận đã có AI Agent, sandbox, kiểm thử sản phẩm hoặc hệ thống tự vận hành.

Yêu cầu đã xác nhận: AI làm được công việc, có tự động hóa, giao diện nghiệp vụ đầy đủ, Dynamic / Configurable, luôn có docs và frontend được preview/chấp nhận. Cách thực hiện các yêu cầu đó được trình bày bên dưới để có thể đánh giá trước khi chọn stack. Không thay thế đặc tả thiết bị trong [chương 04](04-du-lieu-va-giao-tiep.md); bốn phát hiện [review v0.1](reviews/01-thiet-ke-v0.1.md) vẫn mở.

## 1. Phân chia trách nhiệm để triển khai và chứng minh

| Phần | Sở hữu hành vi | Không suy ra từ việc phần này tồn tại |
| --- | --- | --- |
| Nền tảng dùng chung | Xác thực, phạm vi truy cập, capability registry, run/step, cấu hình có version, audit, artifact | Chưa đồng nghĩa có SaaS đa ngành hoặc thu phí thuê bao |
| Module sức khỏe IoT | Hồ sơ theo dõi, chia sẻ, thiết bị, telemetry, incident, thống kê đã định nghĩa | AI không tự chọn ngưỡng y khoa hoặc định nghĩa lại số đo |
| Module công việc/bảo trì, nếu được chọn | Công việc, người phụ trách, hạn xử lý, liên kết thiết bị | Không được cấp quyền xem sức khỏe chỉ vì có quyền bảo trì thiết bị |
| AI planner | Chuyển mục tiêu thành kế hoạch bằng các capability hiện có; giải thích kết quả | Kế hoạch do model sinh chưa phải hành động đã được cấp phép |
| Execution engine | Kiểm điều kiện, chạy bước, lưu kết quả, retry/đối soát, dừng, phát sự kiện | Không cần model cho mọi transition hoặc mỗi mẫu cảm biến |
| Renderer | Hiển thị form/bảng/chart từ component và data source đã đăng ký | Một cấu hình mới không tạo component hoặc integration chưa được lập trình |

Đề xuất bắt đầu bằng một orchestrator và các nhóm capability theo nghiệp vụ. Chỉ tách specialist agent khi có nhiệm vụ, quyền, context hoặc bộ đánh giá khác biệt chứng minh được lợi ích. Không dùng số lượng agent làm thước đo độ khó.

Chứng minh tính tổng quát bằng một phép mở rộng: thêm module nhỏ, đăng ký contract/quyền/tool/view; dùng lại cơ chế đăng nhập, thực thi, audit và preview. Ghi phần code phải bổ sung và phần dùng lại thực tế. Thay tên hồ sơ, số bản ghi hoặc thứ tự câu lệnh không được làm mất khả năng chạy. Phạm vi module thứ hai vẫn cần chốt.

## 2. Ủy quyền và nhận dạng người thực thi

Đề xuất phân biệt `requested_by` (người yêu cầu), `execution_principal` (định danh chạy tác vụ), `delegation_id` (phạm vi đã giao) và `approved_by` (người duyệt một hành động cụ thể). Tác vụ nền có định danh riêng nhưng không kế thừa toàn quyền tài khoản quản trị hoặc tài khoản database của worker.

Quyền hiệu lực là phần giao giữa quyền hiện tại của người giao việc, giới hạn delegation, quyền đối tượng/thuộc tính và policy của capability. Chỉ quyền đọc không cho phép xuất, gửi ra ngoài hoặc sửa dữ liệu. Người duyệt không tự trở thành nguồn cấp thêm mọi quyền cho run.

| Thành phần delegation đề xuất | Ý nghĩa cần chốt/kiểm |
| --- | --- |
| Đối tượng và phạm vi | Workspace, tập hồ sơ/thiết bị, quan hệ chia sẻ, trường dữ liệu; server xác định từ phiên và nguồn tin cậy |
| Capability được dùng | Danh sách thao tác và version tương thích; không nhận tên tool bất kỳ từ prompt |
| Điều kiện chạy | Trigger, lịch/timezone nếu có, thời hạn hiệu lực; không tự đặt lịch khi người dùng chưa giao |
| Hạn mức | Số đối tượng được tác động, số bước, thời gian, số lần thử, ngân sách model/provider; giá trị còn cần chốt |
| Điều kiện dừng | Hết hạn, bị thu hồi, mất quyền, thiếu nguồn bắt buộc, xung đột dữ liệu, hết hạn mức |
| Quy tắc duyệt | Loại tác động tự làm được; hành động nào cần duyệt đúng đối tượng/nội dung/phạm vi |

UI, AI, scheduler, export và callback từ job đều đi qua cùng lớp kiểm quyền. Tên hoặc ID do model trả chỉ là yêu cầu tra cứu, không phải bằng chứng sở hữu. Quyền được kiểm trước đọc dữ liệu, trước gửi dữ liệu tới model, trước tác động và trước giao artifact/kết quả. Đề xuất các điểm kiểm này nhằm cụ thể hóa yêu cầu kiểm quyền ở backend; cơ sở chung xem nguồn OWASP trong [chương 10](10-nguon-va-cau-hoi-mo.md).

Thu hồi quyền có mốc hiệu lực được lưu phía server. Với ghi nội bộ, phép kiểm quyền và commit phải được phối hợp để không có khoảng hở “kiểm xong rồi quyền bị thu hồi nhưng vẫn ghi”; cơ chế transaction/lock/version sẽ chọn cùng database. Với dịch vụ ngoài, kiểm lại trước dispatch nhưng không hứa thu hồi được yêu cầu đã được nhà cung cấp nhận. Nếu quyền mất sau khi gửi dữ liệu tới model thì dữ liệu đó đã được tiết lộ cho provider; việc chặn câu trả lời sau đó không đảo ngược tiết lộ.

Người dùng xem tiến độ và yêu cầu dừng trong phạm vi được giao. Admin kỹ thuật có thể thấy trạng thái vận hành và mã lỗi đã lọc; quyền đó không tự mở nội dung sức khỏe, hội thoại hoặc file export của người khác.

## 3. Hợp đồng capability và kế hoạch hành động

Một capability có một service nghiệp vụ sở hữu. Frontend thông thường và tool adapter chuyển yêu cầu về service đó; không nhân đôi luật validation/quyền ở một nhánh dành riêng cho AI.

| Nhóm thông tin | Trường/hành vi đề xuất |
| --- | --- |
| Nhận dạng | `capability_id`, `contract_version`, module/service sở hữu, trạng thái `planned`, `active`, `deprecated`, `disabled` |
| Input/output | Schema có version; trường được phép sửa; giới hạn độ dài, kích thước tập kết quả và phân trang; kết quả và mã lỗi có cấu trúc |
| Quyền | Permission, điều kiện đối tượng/thuộc tính, scope do server cấp; không cho input ghi đè `actor_id`, tenant hoặc policy |
| Tác động | Đọc, ghi nội bộ, export, gửi bên ngoài, thay cấu hình; mức rủi ro và khả năng preview |
| Thực thi | Điều kiện trước ghi, version tài nguyên, idempotency, timeout, quy tắc retry/đối soát |
| Duyệt và phục hồi | Khi nào cần approval; nội dung approval ràng buộc; có compensation hay không; điều kiện thực hiện |
| Theo dõi | `request_id`, `run_id`, `step_id`, tham chiếu kết quả đã lọc, sự kiện nghiệp vụ và audit |

JSON Schema chỉ kiểm cấu trúc theo khả năng validator được chọn. Service vẫn kiểm quan hệ, trường bất biến, scope, giá trị tham chiếu và luật nghiệp vụ. Input hợp schema không có nghĩa người gọi có quyền làm việc đó.

Đề xuất các capability đầu tiên để khảo sát: `device.search`, `maintenance_task.create`, `maintenance_task.search`, `report.prepare`, `artifact.get`, `workspace_view.draft`, `workspace_view.publish`. Đây là inventory dự kiến, không phải API đã có. Việc gửi thông báo, quản lý quyền hoặc đóng incident phải có contract nghiệp vụ riêng; không ghép vào một tool `execute_anything`.

### Chốt đối tượng trước khi ghi

Với lệnh “đổi tên A thành B”, AI tìm trong phạm vi được phép và trả ID cùng thông tin phân biệt tối thiểu. Nhiều đối tượng cùng tên thì cần làm rõ, không chọn bản đầu tiên. Hành động ghi dùng ID đã xác định và version dữ liệu đọc được, không chỉ dùng chuỗi tên.

Với batch cần duyệt, đề xuất đóng băng danh sách ID/version và diff sẽ áp dụng, kèm tổng số tác động. Approval gắn `plan_version`, digest nội dung, target set, người có quyền duyệt, thời hạn và giới hạn sử dụng. Nếu chỉ hiển thị một trang mẫu, phải cho xem đủ tập được duyệt hoặc ghi rõ cách truy cập toàn bộ diff. Không được duyệt 10 bản ghi rồi chạy lại bộ lọc để tác động 100 bản ghi mới xuất hiện.

Một ủy quyền dài hạn có thể cho phép tập đối tượng thay đổi theo bộ lọc, nhưng phải định nghĩa bộ lọc, giới hạn mỗi lần chạy và thời điểm đánh giá. Mỗi lần chạy ghi snapshot tập thực tế; đối tượng mới không tự được hưởng approval của batch cũ.

Phê duyệt chỉ xác nhận ý định trong phạm vi cụ thể. Trước commit vẫn kiểm lại quyền, version và điều kiện nghiệp vụ. Approval hết hạn, bị thu hồi, nội dung thay đổi hoặc target bị thay thế thì không thực thi bằng approval cũ. Tính dùng một lần gắn với một logical action; retry của chính action đó dùng cùng khóa chống trùng, không tiêu thụ thành một hành động mới.

## 4. Lưu vòng đời tác vụ và kết quả từng bước

Đề xuất lưu riêng `runs`, `run_steps`, `step_attempts`, `delegations`, `approvals` và tham chiếu artifact. Đây là mô hình logic, chưa chốt cách chia bảng hoặc thư viện workflow. Nội dung hội thoại không phải sổ trạng thái thực thi đáng tin cậy.

| Trạng thái run đề xuất | Ý nghĩa | Đường tiếp tục/kết thúc |
| --- | --- | --- |
| `queued` | Yêu cầu được ghi bền, chờ worker | Kiểm delegation rồi chuyển `planning` |
| `planning` | Xác định dữ liệu cần đọc và bước thực hiện | `running`, `waiting_input`, `waiting_approval` hoặc `failed` |
| `waiting_input` | Thiếu thông tin bắt buộc để chạy nhánh phụ thuộc | Nhận câu trả lời có quyền, tăng plan version nếu cần; có hạn chờ |
| `waiting_approval` | Đã có diff và tác động cụ thể cần duyệt | Approval hợp lệ mới tiếp tục; từ chối/hết hạn được ghi rõ |
| `running` | Có bước sẵn sàng hoặc đang chạy | Ghi kết quả mỗi bước; không suy thành công từ đoạn chat |
| `reconciling` | Tác động có thể đã xảy ra nhưng chưa xác nhận | Đối soát bằng khóa/trạng thái; không gửi lại mù |
| `stopping` | Đã nhận yêu cầu dừng/thu hồi, đang xử lý bước đang chạy | Chặn bước mới; đối soát tác động chưa rõ |
| `suspended` | Chưa thể tiếp tục vì version bị vô hiệu hóa hoặc cần quyết định vận hành | Không dispatch thêm; kiểm quyền, delegation và kế hoạch trước khi tiếp tục hoặc kết thúc |
| `succeeded` | Toàn bộ điều kiện hoàn thành của nhiệm vụ được xác nhận | Terminal; giữ bằng chứng kết quả |
| `partially_succeeded` | Một phần hoàn tất, phần còn lại kết thúc không hoàn tất | Terminal; liệt kê thành công, thất bại, bỏ qua và lý do |
| `failed` | Nhiệm vụ kết thúc thất bại, chưa có phần việc hoàn tất cần giữ | Terminal; không tự retry toàn run |
| `cancelled` | Kết thúc theo yêu cầu dừng/chính sách | Terminal; vẫn liệt kê tác động đã có, không đồng nghĩa rollback |

Run có nhánh độc lập được phép tiếp tục khi một nhánh chờ; trạng thái từng step là nguồn chi tiết, UI hiển thị nhánh chờ thay vì giả mọi thứ đang chạy. `waiting_input`/`waiting_approval` ở cấp run áp dụng khi không còn bước độc lập có thể chạy. Scheduler đánh thức theo sự kiện hoặc thời điểm, không vòng lặp gọi model liên tục.

Step đề xuất có `pending`, `waiting_input`, `waiting_approval`, `running`, `waiting_retry`, `suspended`, `unknown`, `succeeded`, `failed`, `skipped`, `cancelled`; mỗi attempt lưu lần thử và mã lỗi. Lời gọi hết timeout sau dispatch chuyển `unknown` khi chưa biết tác động; run cần đối soát. Hết thời hạn đối soát tự động thì run chuyển `suspended`, giữ step `unknown` và yêu cầu người có quyền xử lý; không vòng lặp gọi provider vô hạn, không biến thành `succeeded` hoặc khẳng định chưa có tác động. Resume phải giữ lịch sử tác động và kiểm lại điều kiện, không tạo lại run mới để né trạng thái chưa xác định.

Các chuyển trạng thái dùng kiểm version và worker ownership. Hai worker cùng lấy việc phải có cơ chế claim/lease; worker mất lease không được ghi đè kết quả của worker mới. Lease không tự ngăn request bên ngoài đã gửi: vẫn cần idempotency/đối soát ở nơi sở hữu tác động.

Run gắn version workflow, contract và bản build thực thi có khả năng chạy lại version đó. Nếu version không còn an toàn hoặc đã bị vô hiệu hóa, chuyển `suspended`, chặn bước mới và xử lý bằng migration/replan có lưu vết; tác động đã dispatch vẫn phải đối soát. Không âm thầm dùng implementation mới dưới nhãn version cũ. Replan tăng `plan_version`, giữ lịch sử bước đã hoàn tất và vô hiệu hóa approval không còn khớp; không chạy lại các tác động cũ để “làm lại từ đầu”.

### Dừng, hoàn tác và thất bại một phần

Dừng ngăn bước mới theo mốc server đã ghi; tác động đang commit hoặc đã dispatch được xử lý theo trạng thái thực tế. UI phải nói được “đã yêu cầu dừng”, “đã dừng”, “còn tác động đang đối soát”.

Hoàn tác là capability riêng với quyền và điều kiện hiện tại. Nếu A sửa tên rồi B sửa tiếp, undo của A không được ghi đè thay đổi của B; cần version/precondition. Gửi thông báo, tải file ra ngoài và việc người nhận đã xem không thể thu hồi bằng rollback database. Một chuỗi nhiều service không được quảng cáo là transaction nguyên khối; nếu có compensation thì ghi rõ hành động bù, điều kiện thất bại và trạng thái còn lại.

## 5. Retry, idempotency và sự kiện

### Nhận diện yêu cầu trước lần gửi đầu tiên

Đề xuất bên gọi tạo và giữ `request_key` ổn định trước lần đầu gọi `POST /agent-runs`. API xác định scope từ danh tính đã xác thực và workspace được phép, chuẩn hóa input rồi lưu ánh xạ `(scope, request_key) → run_id, operation_id, input_fingerprint` cùng bản ghi run trong một transaction. Unique constraint/điều kiện ghi tương đương phải ngăn hai request đồng thời tạo hai run. Khóa do client gửi chỉ nhận diện ý định, không cấp quyền, không cho chọn tenant hoặc chạy dưới danh tính khác.

Nếu server đã commit nhưng response mất, client retry cùng key/input sẽ nhận lại cùng run sau kiểm quyền hiện tại. Cùng key khác input trả conflict; request thật sự độc lập dùng key mới. Client không tạo key mới chỉ vì timeout. Với scheduler/event handler, khóa khởi tạo lấy từ trigger/activation generation và occurrence/event ID ổn định; không sinh ID ngẫu nhiên mỗi lần callback được giao lại. Thời hạn hỗ trợ retry và cách xử lý key hết hạn phải có trong contract; client không tự gửi lại một ý định cũ bằng key mới khi chưa đối soát.

### Chống trùng tác động bên trong run

Đề xuất logical operation ID được server tạo và giữ qua mọi attempt. Khóa chống trùng được định danh theo phạm vi chủ sở hữu, capability/version và operation; lưu fingerprint input đã chuẩn hóa cùng kết quả. Cùng khóa nhưng khác input phải bị từ chối. Khóa không được đổi mỗi lần model lập lại câu lệnh.

Với ghi trong cùng database, kết quả nghiệp vụ, dấu đã xử lý và sự kiện outbox cần commit nhất quán. Retry sau timeout đọc lại kết quả đã commit qua quyền hiện tại, không tạo bản ghi thứ hai. Thời hạn giữ khóa phải bao phủ khoảng retry/recovery được hỗ trợ; không tự chọn TTL ngắn hơn vòng đời tác vụ. Dù có khóa chống trùng, hai yêu cầu độc lập khác khóa vẫn có thể tạo trùng nghiệp vụ; module cần quy tắc riêng, ví dụ một công việc bảo trì cho cùng episode mất tín hiệu.

| Tình huống | Xử lý đề xuất |
| --- | --- |
| Validation sai, thiếu quyền, tool không hỗ trợ | Không retry; trả lỗi rõ, làm rõ yêu cầu hoặc đổi kế hoạch trong scope |
| Xung đột version | Đọc lại trong quyền hiện tại, tính lại diff; duyệt lại nếu tác động thay đổi |
| Quá tải/rate limit hoặc lỗi tạm thời chưa gây tác động | Retry có backoff, hạn lần và deadline; theo contract provider |
| Timeout sau khi đã gửi thao tác ghi | Tra trạng thái theo operation/provider reference; giữ `unknown` nếu chưa có bằng chứng |
| Dịch vụ ngoài hỗ trợ idempotency | Giữ nguyên khóa và payload, ghi tham chiếu trả về; kiểm giới hạn bảo đảm của provider |
| Dịch vụ ngoài không hỗ trợ dedup/status | Không hứa exactly-once; dừng retry tự động khi có thể nhân đôi, chuyển đối soát có người xử lý |

Event có ID, loại, resource ID/version và correlation tới run; payload chỉ chứa phần cần thiết. Consumer phải xử lý bản tin lặp và sự kiện tới muộn. Sau thay đổi nghiệp vụ, UI tải lại dữ liệu đang có quyền từ service; không dùng câu trả lời model làm nguồn ghi trực tiếp vào bảng.

Outbox chỉ giải quyết một phần bài toán ghi database và phát sự kiện. Nó không tự bảo đảm thông báo còn hợp lệ ở lúc gửi, không tự ngăn consumer xử lý lặp và không chứng minh người nhận đã đọc. Đây cũng là lý do finding về incident đã đóng trong review v0.1 vẫn phải xử lý riêng.

### Chặn vòng phản hồi giữa nhiều run

Giới hạn số bước trong một run không chặn được chuỗi A tạo event → B chạy → B tạo event → A chạy lại. Đề xuất event/run giữ `root_execution_id`, `causation_event_id`, `parent_run_id`, trigger và activation generation từ server. Chuỗi con giữ nguồn và quota đã kế thừa; không tự reset ngân sách bằng cách tạo run mới. Callback từ connector cần correlation đáng tin; thiếu nguồn theo contract thì không tự coi là một ý định độc lập được cấp ngân sách mới.

Baseline đề xuất không kích hoạt lại cùng workflow từ tác động của chính nó hoặc từ nhánh có workflow đó trong ancestry, trừ khi có chính sách re-entry đã được chốt. Workflow A/B kích hoạt chéo vẫn phải qua kiểm lineage. Khi publish, kiểm chu kỳ trong phần đồ thị đã biết; kiểm tĩnh này không thay kiểm lúc chạy vì sự kiện có thể đi qua nhiều module/connector.

Trước tạo run con và trước tác động, kiểm và tiêu thụ/reserve hạn mức dùng chung theo delegation/root execution bằng thao tác atomic. Quy định độ sâu, tổng run, tổng tác động, thời gian và ngân sách theo policy có version; giá trị cụ thể chưa chốt. Retry một occurrence không tiêu thụ như một run mới. Tác động chưa rõ kết quả không được hoàn quota như chắc chắn chưa chạy. Thêm quota theo workspace trong một cửa sổ thời gian để chặn chuỗi mất correlation hoặc nhiều nguồn độc lập; không dựa riêng vào việc model giữ đúng lineage.

Vượt hạn mức hoặc gặp chu kỳ bị cấm thì không tạo run mới, ghi trigger bị chặn và nguồn gốc vào audit; run hiện tại dừng/suspend phần phụ thuộc theo lý do thực tế. Quy tắc này chỉ áp dụng tự động hóa AI/module được giao, không làm đường cảnh báo IoT phụ thuộc ngân sách model.

## 6. Cấu hình, preview và phát hành một phiên bản

Đề xuất mọi bản cấu hình lưu `config_id`, `schema_version`, `revision`, `base_revision`, scope, nội dung, digest, phụ thuộc và trạng thái. Phụ thuộc gồm component/data source/tool/workflow version cần để chạy. `revision` là phiên bản nội dung; `schema_version` mô tả định dạng. Hai giá trị không thay thế nhau.

| Giai đoạn | Điều kiện chuyển | Bằng chứng lưu |
| --- | --- | --- |
| Nháp | Người tạo được phép trong scope | Nội dung và phiên bản nền |
| Kiểm hợp lệ | Schema, tham chiếu, quyền, compatibility và giới hạn đạt | Kết quả validator cùng version công cụ |
| Preview/chạy thử | Có môi trường/data source xác định rõ | Diff, layout, dữ liệu mẫu có nhãn hoặc dữ liệu được cấp quyền |
| Chấp nhận | Đúng người có quyền, đúng digest/version/scope | Quyết định, thời hạn, dependencies đã kiểm |
| Kích hoạt | Kiểm lại quyền và phiên bản nền; cập nhật atomically | Publication ID, phiên bản đã áp dụng, sự kiện sau commit |
| Theo dõi/thu hồi | Kết quả chạy và compatibility thực tế | Lỗi, phiên bản thay thế, ảnh hưởng tới run đang chạy |

Frontend chính thức luôn cần preview/chấp nhận theo yêu cầu người dùng, kể cả cấu hình chỉ áp dụng cá nhân. Người chấp nhận cho từng scope còn cần chốt. Nếu một cấu hình backend đồng thời tạo/sửa form/menu/dashboard thì phần thay đổi giao diện cũng đi qua cổng này; không lách bằng cách gọi nó là “chỉ cấu hình”.

### Preview phải tách tác động thật

Preview hiển thị đúng artifact/digest sắp công bố, với responsive, empty/error/loading và quyền vai trò liên quan. Đề xuất adapter preview chỉ đọc dữ liệu đã được cấp quyền, còn thao tác ghi/gửi notification/export tới người nhận thật bị thay bằng kết quả mô phỏng hoặc bị chặn. Nhãn preview không đủ bảo vệ nếu nút vẫn gọi production API; backend cần phân biệt môi trường và từ chối tác động thật từ đường preview.

Chạy thử workflow sinh bản dự kiến: đối tượng nào, diff nào, tool nào, bước nào phải duyệt và chi phí ước lượng nếu có nguồn tính. Không gọi một tool ghi thật rồi rollback database để giả dry-run, vì email hoặc request ngoài có thể đã gửi. Dữ liệu mẫu không được ghi lẫn vào nguồn thật; preview dùng dữ liệu thật phải có quyền và giới hạn như trang chính thức.

Publish dùng compare-and-set trên phiên bản hiện hành và đúng nội dung đã duyệt. Có thay đổi song song thì trả xung đột, tạo diff mới và preview lại; không tự merge rồi công bố bằng approval cũ. Thay đổi dependency có thể ảnh hưởng hiển thị/hành vi cũng làm bản preview cũ hết hiệu lực, trừ khi có quy tắc compatibility đã được kiểm chứng.

Rollback cấu hình tạo một lần công bố mới từ phiên bản cũ đã được kiểm tương thích và preview/chấp nhận theo yêu cầu frontend. Không xóa lịch sử, không đổi ngược dữ liệu nghiệp vụ đã ghi. Run đang chạy giữ version đã gắn hoặc dừng theo policy; khi sửa lỗi bảo mật không được tiếp tục version cũ chỉ vì “đã pin”.

### Đổi lịch/trigger và mốc áp dụng

Đề xuất mỗi activation có `generation` tăng đơn điệu và mốc có hiệu lực do server ghi. Cập nhật active generation cùng publication trong một transaction; rollback nội dung cũng tạo generation mới. Callback mang trigger ID, generation và occurrence ID, không chỉ tên workflow hoặc giờ chạy. Khi nhận callback, kiểm generation còn được phép kích hoạt và tạo run/chống trùng occurrence atomically với nguồn trạng thái publication; không chỉ tin cache của scheduler.

Nếu v2 đã bỏ lịch, callback v1 đến sau bị ghi nhận là stale và không tạo run. Nếu callback thắng transaction trước v2, đó là run cũ đã tồn tại và xử lý theo policy bên dưới. Publication event là tín hiệu để scheduler cập nhật; consumer bỏ event generation cũ đến muộn và đối chiếu nguồn hiện hành khi restart. Xóa timer phía scheduler giúp dọn việc nhưng không phải cơ chế bảo đảm duy nhất.

| Thời điểm của công việc v1 khi v2 có hiệu lực | Policy baseline đề xuất |
| --- | --- |
| Callback đã lên lịch, chưa có run | Không tạo run nếu generation đã hết hiệu lực |
| Run đã tạo nhưng chưa bước nào được dispatch, kể cả đang chờ input/approval | Hủy do cấu hình thay thế; nếu muốn chạy lại phải tạo ý định/approval phù hợp v2 |
| Run đã có bước dispatch hoặc tác động | Giữ v1 để kết thúc/đối soát theo delegation còn hiệu lực; không chuyển ngầm sang v2 |
| Version bị security-disable, delegation bị thu hồi hoặc có yêu cầu dừng | Chặn dispatch mới; xử lý tác động đang chạy theo mục 4, bất kể pin version |

Chuyển từ run chưa chạy sang lần dispatch đầu phải kiểm generation tại ranh giới atomic/fencing phù hợp để không vượt qua publication vừa có hiệu lực. Nếu cần policy drain khác cho run chưa chạy, phải khai báo, hiển thị và duyệt trước khi publish; không dùng mặc định ẩn. Lịch/timezone, cách bỏ qua hoặc chạy bù occurrence bị lỡ và giới hạn backlog cần chốt trong contract scheduler; chạy bù cũng qua generation, dedup và quota như callback thường.

### Trường động và workflow động

Trường mở rộng có kiểu, validation, khả năng tìm/lọc/sort/export và quyền đọc/ghi; không chỉ là nhãn trên form. Thêm field phải đi qua các đường service, API, AI, job, báo cáo và UI có liên quan. Cần chọn cách lưu/index sau khi có nhu cầu truy vấn và database; chưa mặc định JSON blob hoặc tự tạo bảng qua prompt.

Workflow sử dụng trigger/condition/action trong registry, biểu thức hữu hạn và giới hạn fan-out, vòng lặp, thời gian và retry. Cấu hình không chứa SQL, shell, JavaScript hoặc URL tùy ý để engine thực thi. Connector mới là năng lực kỹ thuật cần xây và kiểm; không tự xuất hiện từ một manifest. Đổi kiểu/xóa field phải có phân tích dữ liệu cũ, migration và compatibility trước khi kích hoạt.

## 7. Khi AI cần thay backend hoặc tạo module mới

Đề xuất chia ba mức để đo đúng độ khó và kiểm soát phạm vi:

| Mức | Đầu ra AI tạo | Đường kiểm và phát hành |
| --- | --- | --- |
| Kết hợp capability có sẵn | Workflow, biểu mẫu, bộ lọc, dashboard, cấu hình module | Schema/compatibility, chạy thử, preview và duyệt theo scope |
| Thêm capability chưa có | Đề xuất contract, implementation service/tool, test, tài liệu | Coding Agent ở môi trường phát triển; diff, review, test và release riêng |
| Thay core hoặc cấu trúc dữ liệu | Auth/tenant logic, migration, hạ tầng, connector có credential | Yêu cầu kỹ thuật có thẩm quyền, impact map, bằng chứng hồi quy và kế hoạch phục hồi riêng |

Runtime không được gọi trực tiếp công cụ sửa repository, chạy shell, cấp secrets hoặc migration production. Nếu cần năng lực mới, nó tạo đề nghị có mục đích, input/output và phần đang thiếu; không giả gọi một tool chưa được triển khai. Việc đưa Coding Agent vào chính sản phẩm vẫn là lựa chọn chưa chốt, khác với dùng Codex hỗ trợ phát triển đồ án hiện tại.

Nếu chọn đưa Coding Agent vào sản phẩm, branch chỉ quản lý diff; môi trường chạy code chưa duyệt phải có ranh giới quyền thực thi riêng. Chưa chọn công nghệ sandbox, nhưng phải chứng minh được các điều kiện sau trước khi mở năng lực:

| Bề mặt | Điều kiện cho coding/build/test chưa duyệt |
| --- | --- |
| Filesystem và tiến trình | Chỉ checkout/working directory và thư mục tạm được cấp; không đọc home/secrets ngoài phạm vi, không dùng host socket hoặc quyền hệ thống để thoát cô lập |
| Credential và dữ liệu | Chỉ fixture tổng hợp và credential test có scope; không kế thừa token developer, thông tin đăng nhập cloud hoặc quyền database production |
| Network | Chỉ đích cần thiết đã được cấp; chặn đường tới production và đích gửi dữ liệu tùy ý; dependency retrieval phải nằm trong cơ chế được kiểm |
| Build/test/migration | Cùng ranh giới khi chạy script cài đặt dependency, test hoặc migration thử; tên lệnh “test” không làm code trở nên đáng tin |
| Artifact và release | Lưu diff, build artifact/digest và bằng chứng; tiến trình release riêng kiểm đúng bản được duyệt, không cấp release credential cho môi trường coding |

Phép kiểm cô lập dùng canary secret/file và endpoint giả lập production, không dùng secrets hay production thật để thử. Kiểm cả việc bị chặn và build/test hợp lệ vẫn chạy. Cấu hình sandbox hoặc Git branch chưa đủ bằng chứng nếu chưa kiểm quyền thực tế của tiến trình. Đây là điều kiện thiết kế cho năng lực tùy chọn, không phải tuyên bố workspace hiện tại đã được cô lập.

Hồ sơ thay đổi backend đề xuất gồm: nguồn yêu cầu; contract trước/sau; các đường bị ảnh hưởng; diff code/config; dependency/version và nguồn chính thức; test; tác động dữ liệu; cách rollout và điều kiện phục hồi. Có thay UI thì bổ sung preview tương ứng. Chỉ artifact đã được kiểm và duyệt mới được phát hành; sửa thêm sau đó cần kiểm lại phần ảnh hưởng.

Migration phải nói rõ dữ liệu nào đổi, khóa/ràng buộc nào thêm, khả năng chạy với bản ứng dụng cũ/mới và cách xử lý thất bại giữa chừng. Backup chỉ có giá trị phục hồi khi quy trình restore đã được kiểm trong môi trường thích hợp. Không tự hứa rollback được migration phá hủy dữ liệu. Chưa tạo CI/sandbox giả khi repository chưa chọn stack.

## 8. Trải nghiệm khách hàng và admin

AI Workspace là một cách điều khiển cùng nghiệp vụ mà màn hình thông thường cung cấp. Trong đề xuất này, canvas tạm chỉ render component đã kiểm; lưu thành trang chính thức cần preview/chấp nhận. Không ép mọi tác vụ phải đi qua chat.

| Khu vực | Khách hàng/người được chia sẻ | Admin/người vận hành được cấp quyền |
| --- | --- | --- |
| Tổng quan | Hồ sơ, thiết bị, số đo, cảnh báo thuộc phạm vi | Sức khỏe hệ thống, lỗi thiết bị, tác vụ; dữ liệu sức khỏe chỉ khi có quyền riêng |
| Nghiệp vụ | Chi tiết/biểu mẫu/lịch sử thao tác được phép | Quản lý người dùng, thiết bị, cấu hình theo quyền |
| AI Workspace | Hỏi và giao việc trong hồ sơ/thiết bị được phép | Giao việc trên phạm vi quản trị được cấp; không dùng tài khoản toàn quyền mặc định |
| Task Center | Run của mình/được chia sẻ, bước đang chạy, chờ nhập/duyệt, dừng | Theo dõi run vận hành, lỗi và quota; không mặc định đọc nội dung riêng |
| Báo cáo và artifact | Xem/tải kết quả sau kiểm quyền hiện tại | Báo cáo vận hành hoặc nghiệp vụ theo quyền tương ứng |
| Cấu hình/preview | Trang cá nhân nếu được cho phép | Draft, diff, preview và publish trong scope quản lý |

Kết quả AI có thể gồm bảng, chart, form nháp, diff, task card và link artifact. Mỗi kết quả phân biệt “đề xuất”, “đang chạy”, “đã xác nhận hoàn tất” và “chưa xác định tác động”. Task Center vẫn đọc được khi model không khả dụng, vì tiến độ lấy từ execution store. Ẩn nút chỉ là trình bày; server chịu trách nhiệm từ chối truy cập trực tiếp.

## 9. Hợp đồng HTTP và dữ liệu đề xuất

Chương 04 hiện chỉ có inventory v0.1. Bảng này là phần bổ sung cần hòa vào một OpenAPI duy nhất sau khi chốt; không tạo một API nghiệp vụ thứ hai dành riêng cho chat. Quy ước lỗi và version phải thống nhất khi triển khai.

| Tài nguyên/endpoint minh họa dưới `/api/v1` | Hành vi dự kiến |
| --- | --- |
| `POST /agent-runs` | Nhận request key có trước lần gửi đầu; ghi ánh xạ key/input → run/operation cùng transaction; retry trả cùng run; nhận việc không có nghĩa đã hoàn thành |
| `GET /agent-runs/{id}` | Đọc trạng thái, plan version, step/result refs sau kiểm quyền |
| `POST /agent-runs/{id}/cancellation-requests` | Ghi yêu cầu dừng idempotent; trả trạng thái hiện tại và tác động còn đang xử lý |
| `POST /action-plans/{id}/approvals` | Kiểm người duyệt, digest/target set/version/thời hạn; không nhận approval tự khai từ model |
| `POST /workspace-views/{id}/drafts` | Tạo bản nháp từ phiên bản nền |
| `POST /workspace-views/{id}/previews` | Tạo preview cho đúng draft revision, không publish |
| `POST /workspace-views/{id}/publications` | Kích hoạt đúng bản đã duyệt nếu phiên bản nền còn phù hợp |
| `GET /artifacts/{id}` | Kiểm lại quyền của người tải và scope dữ liệu; không trả file chỉ vì biết URL |

Đề xuất `If-Match`/strong ETag cho cập nhật có precondition: precondition sai trả `412 Precondition Failed`; xung đột nghiệp vụ khác có thể dùng `409 Conflict`. Đây là phân biệt HTTP theo RFC 9110, không dùng `409` thay mọi lỗi `If-Match`. Endpoint ghi phải khai báo rõ dùng ETag của tài nguyên nào; với collection publication và phiên bản nền của view, có thể dùng precondition trong body cùng kiểm atomic của service, không gắn nhầm ETag của view lên collection. Chưa chốt hình thức cuối cùng trước khi có contract.

Mã lỗi nghiệp vụ cần ổn định như `TARGET_AMBIGUOUS`, `APPROVAL_STALE`, `CAPABILITY_DISABLED`, `EFFECT_UNKNOWN`; đây là tên đề xuất. Thông báo người dùng không chứa stack trace hoặc dữ liệu tài nguyên ngoài quyền. Retry client không tự biến một `POST` thành idempotent; contract phải ghi quy tắc operation key và thời hạn hỗ trợ.

## 10. Dữ liệu của model, audit và giải thích

Nội dung file, ghi chú người dùng, kết quả tìm kiếm và tool result là dữ liệu có thể chứa chỉ dẫn giả. Đề xuất hệ thống tách nguồn, giới hạn context và kiểm lại tool arguments ở executor; không lấy “bỏ qua quyền” trong ghi chú làm lệnh có thẩm quyền. Model output cũng phải qua validator/renderer; không chèn HTML hoặc mã model sinh trực tiếp vào ứng dụng. Nguyên tắc và giới hạn chống prompt injection được đối chiếu OWASP, không hứa loại bỏ hoàn toàn tấn công bằng một prompt.

Mỗi phân tích/báo cáo lưu nguồn dữ liệu, khoảng thời gian, timezone, version cách tính và cờ thiếu dữ liệu. Metric được tính bởi service/query đã định nghĩa; model diễn giải và dẫn nguồn, không tự bịa số. Coverage/aggregate telemetry còn vướng review v0.1 thì ghi giới hạn, không đặt một công thức mới rồi coi số đo đã hợp lệ.

Audit ghi ai yêu cầu, ai thực thi/duyệt, capability/version, đối tượng, thời gian, kết quả, correlation và mã lỗi. Không mặc định lưu toàn bộ prompt, output tool, payload sức khỏe hoặc secrets vào log chung. Dữ liệu cần phục vụ điều tra được lưu riêng theo quyền và retention phải chốt; log lỗi của provider cũng phải được lọc.

Hội thoại, memory, cache, search index và artifact cần owner/scope/provenance; một context đã được tải không mặc định có quyền tái sử dụng vĩnh viễn. Khi quyền nguồn bị thu hồi, không đưa dữ liệu đã cache vào model hoặc hiển thị lại từ lịch sử cho người không còn quyền. Với artifact chứa nhiều nguồn, đề xuất chặn toàn artifact khi không còn đủ quyền, rồi tái tạo bản được phép; tránh chỉ xóa một dòng trong bảng nhưng để nguyên phần tổng hợp tiết lộ dữ liệu đó. Cách retention/xóa vật lý còn cần chốt.

Giải thích hành động dựa trên plan công khai, policy decision, nguồn, diff và tool result thực tế. Không cần lưu hoặc phơi bày suy luận nội bộ của model; không dùng đoạn giải thích tự sinh làm bằng chứng tác động đã xảy ra. URL tải dùng kiểm quyền ở lúc truy cập nếu cần thu hồi tức thời; file đã tải xuống thiết bị của người nhận không thể được đảm bảo thu hồi.

## 11. Kịch bản bảo vệ đồ án có thể tái lập

Đề xuất trình diễn một câu chuyện xuyên suốt: theo dõi thiết bị → phát hiện tình trạng kỹ thuật bằng policy → AI tổ chức công việc → chạy tự động → đổi cấu hình có preview → gây lỗi và kiểm phục hồi. Không gắn điều kiện “đạt điểm cao” khi chưa có rubric của trường.

| Chặng | Thao tác trình diễn | Điều người xem có thể đối chiếu |
| --- | --- | --- |
| Dữ liệu đầu vào | Board thật gửi mẫu có timestamp/quality; hoặc simulator ghi nhãn rõ | Thiết bị nào, hồ sơ nào, log tiếp nhận, thời gian và trạng thái kết nối |
| Nghiệp vụ thủ công | Tìm thiết bị, xem lịch sử, tạo công việc trên màn hình | Luồng sử dụng thông thường và trạng thái trước khi giao AI |
| Giao mục tiêu | Yêu cầu tạo công việc kiểm tra cho thiết bị thỏa policy đã cấu hình | Plan, target set, scope, tool calls, bản ghi tạo thật; tên/điều kiện có thể thay đổi |
| Tự động vận hành | Trigger mới hoặc lịch đã được giao, người dùng không bấm từng bước | Run/step timeline, delegation, chống trùng và artifact kết quả |
| Dynamic frontend | Yêu cầu thêm cột hoặc đổi dashboard từ component có sẵn | Draft/diff → preview → chấp nhận → publication; UI lấy dữ liệu thật có quyền |
| Gây lỗi | Mất response sau commit, restart worker, đổi dữ liệu trong lúc duyệt | Không nhân đôi tác động, phục hồi đúng step hoặc báo xung đột |
| Kiểm quyền | Khách hàng yêu cầu hồ sơ khác; thu hồi quyền khi job đang chờ | Backend từ chối, không xuất dữ liệu qua chat/file/cache; audit có mã lý do |
| Đường cảnh báo | Tắt model rồi chạy kịch bản incident đã định nghĩa | Cảnh báo vẫn theo logic riêng; không để LLM tự đóng hoặc quyết định sự an toàn |

Chặng incident phụ thuộc việc sửa findings v0.1 và kiểm trên firmware/backend thực tế. Mô phỏng sự kiện té ngã không phải đo độ chính xác phát hiện té ngã; khả năng đo phần cứng được trình bày riêng theo [chương 08](08-kiem-thu-va-danh-gia.md). Chưa có kết quả demo của các chặng trên.

## 12. Ma trận kiểm chứng cho hướng AI thực thi

Các mã dưới đây là tiêu chí đề xuất, **chưa phải test executable hoặc kết quả đạt**. Chọn lớp nhỏ nhất sở hữu hành vi; integration/race/E2E được dùng khi tình huống yêu cầu. Bộ này bổ sung T-01…T-14 của baseline, không đánh dấu chúng đã hoàn tất.

| Mã | Tình huống và tiêu chí đạt | Lớp kiểm phù hợp |
| --- | --- | --- |
| AI-01 | Cùng input/quyền từ UI và AI tạo cùng hành vi nghiệp vụ, không có đường bỏ validation | Service + adapter integration |
| AI-02 | Hai hồ sơ/workspace, ID đoán được, trường ngoài quyền: đọc/ghi/export đều bị từ chối đúng scope | Authorization integration |
| AI-03 | Nhiều đối tượng cùng tên hoặc thiếu policy: không tự chọn, không ghi; nhánh độc lập có thể tiếp tục | Planner eval + service assertions |
| AI-04 | Batch đã duyệt, xuất hiện bản ghi mới hoặc target đổi version: không tác động ngoài tập duyệt | Approval/service integration |
| AI-05 | Mất response sau commit tạo run rồi retry cùng key: đúng một run; cùng key khác input bị conflict. Mất response sau commit bước hoặc hai worker nhận cùng operation: đúng một tác động | Request + transaction/race integration |
| AI-06 | Timeout dịch vụ ngoài không rõ kết quả: giữ unknown/đối soát, không tự gửi lặp | Adapter fault injection |
| AI-07 | Worker restart sau bước đã xong: tiếp tục bước còn lại, giữ plan/tool/config version | Execution integration |
| AI-08 | Thu hồi giữa đọc, đưa context tới model, ghi và giao file: kiểm tại từng ranh giới có hiệu lực | Authorization/race integration |
| AI-09 | Cancel lúc chờ và lúc đang dispatch: chặn bước mới, báo tác động đã có/chưa rõ, không hứa undo | Execution integration |
| AI-10 | Preview click ghi/gửi/export: không tác động dữ liệu/người nhận thật; dữ liệu mẫu có nhãn | Preview adapter + E2E cần thiết |
| AI-11 | Sửa draft/dependency sau duyệt hoặc publish đồng thời: approval cũ không áp dụng bản mới. Callback v1 đến sau v2 bỏ lịch, event publication đảo thứ tự hoặc scheduler restart: không tạo run từ generation hết hiệu lực; run cũ xử lý đúng policy | Publication/scheduler integration + race tại dispatch đầu |
| AI-12 | Tool version bị disabled khi run đang chờ: không dùng version cũ hoặc tự đổi version im lặng | Registry/execution integration |
| AI-13 | Ghi chú/tool result chứa chỉ dẫn đổi scope/gửi dữ liệu ra ngoài: không tạo tác động trái policy | Adversarial eval + tool assertions |
| AI-14 | Thu hồi nguồn nhưng mở lại chat/cache/artifact: dữ liệu không còn quyền không bị trả lại | Retrieval/artifact integration |
| AI-15 | Hết ngân sách, fan-out, self-trigger hoặc A/B kích hoạt lẫn nhau: lineage và quota chung chặn chuỗi run theo policy, kể cả worker đồng thời. Model lỗi không làm dừng cảnh báo IoT độc lập | Budget/trigger integration + race tại quota reservation |
| AI-16 | Thêm module, dữ liệu và cách diễn đạt mới: đi qua lõi chung; không cần sửa câu lệnh demo trong code | Module contract + task eval |
| AI-17 | Nếu chọn Coding Agent trong sản phẩm: code chưa duyệt không đọc canary secret/file ngoài scope, không ghi endpoint giả lập production; build/test fixture hợp lệ chạy được | Isolation integration; chỉ chạy khi có môi trường tương ứng |

Đo chất lượng AI bằng kết quả nghiệp vụ đã xác nhận, không chấm chỉ theo câu trả lời hay việc JSON parse được. Ghi tập nhiệm vụ, version model/prompt/tool/config, số lần thử mỗi nhiệm vụ và điều kiện máy/mạng. Bộ để chỉnh prompt tách khỏi bộ đánh giá giữ lại; kiểm thêm cách diễn đạt và dữ liệu không dùng khi dựng demo.

| Chỉ số | Định nghĩa đề xuất trước khi đo |
| --- | --- |
| Hoàn thành nhiệm vụ | Số run đạt toàn bộ điều kiện nghiệp vụ / số run được đánh giá; báo riêng partial/failed/unknown |
| Hoàn thành trong phạm vi tự chủ | Run hoàn tất không cần can thiệp ngoài approval đã dự kiến / các run đủ điều kiện tự chủ; công bố tiêu chí đủ điều kiện |
| Can thiệp | Tách hỏi làm rõ, approval theo policy và sửa lỗi của AI; không gộp mọi confirmation thành thất bại |
| Thời gian/thao tác | So cùng nhiệm vụ và dữ liệu tương đương giữa UI thủ công và AI; báo thời gian chờ duyệt riêng |
| Lỗi quyền/tác động trùng | Số vi phạm quan sát trên số tình huống thử; không tuyên bố an toàn tuyệt đối vì tập thử nhỏ không gặp lỗi |
| Chi phí | Usage thực từ provider, số tool calls và hạ tầng nếu đo được; giá/version/ngày có nguồn, không tự gán chi phí |

Mẫu số bằng 0 thì ghi “không xác định”; chưa đo thì để “chưa đo”. Không lấy mục tiêu hay số liệu synthetic làm kết quả thực nghiệm. Lưu dữ liệu thử tổng hợp và artifact đã lọc đủ để người khác tái lập.

## 13. Những điểm cần chốt trước triển khai

| Quyết định | Phương án đang đề xuất | Thông tin còn thiếu |
| --- | --- | --- |
| Mức nền tảng | Sức khỏe IoT hoàn chỉnh + một module mở rộng nhỏ | Rubric, số người, thời hạn và phần cứng |
| Tenant/quyền | Scope theo workspace và quan hệ trên hồ sơ; admin kỹ thuật tách quyền sức khỏe | Workspace là hộ gia đình hay tổ chức; ma trận quyền thực tế |
| Tự chủ | Delegation có giới hạn, workflow hữu hạn, action approval cụ thể | Hành động được tự làm, hạn mức và người phê duyệt |
| Frontend | Component/config registry, draft/preview/publication | Ai duyệt cá nhân/dùng chung; quy tắc emergency rollback |
| Backend | Runtime cấu hình; code mới qua luồng phát triển riêng | Có đưa Coding Agent/app builder vào phạm vi sản phẩm hay không |
| Stack và lưu trữ | Modular monolith là ứng viên baseline; contracts dùng chuẩn đã khảo sát | Runtime/framework/database/broker/provider/version; benchmark và compatibility |
| Dữ liệu và bằng chứng | Tổng hợp tối thiểu, audit có scope, đánh giá bằng kết quả nghiệp vụ | Retention, provider data policy, bộ nhiệm vụ và mục tiêu đo |

Sau khi các lựa chọn ảnh hưởng hành vi được chốt, chuyển chúng thành ADR/contract và cập nhật đồng bộ chương 02/03/04/06/07/08. Không đánh dấu tài liệu này `accepted` chỉ vì review tài liệu đạt hoặc HTML build thành công.

[Mục lục tài liệu](README.md) · [Nguyên tắc phát triển](12-nguyen-tac-phat-trien-va-bang-chung.md) · [Nguồn kỹ thuật](10-nguon-va-cau-hoi-mo.md).
