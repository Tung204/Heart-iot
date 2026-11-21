# Nguyên tắc phát triển, tái sử dụng và bằng chứng

Ngày ghi nhận: **10/11/2026**. Tài liệu lưu yêu cầu cách làm của người dùng và quy trình áp dụng cho dự án. Các cơ chế CI, registry tự động, sandbox và quy trình kiểm thử sản phẩm mô tả bên dưới **chưa được triển khai** (đã có unit/integration test ở các package; xem [`tests/README.md`](../tests/README.md)); không coi một file hướng dẫn là hệ thống cưỡng chế đã hoạt động.

## Tài liệu là một phần của thay đổi

Trước khi thay đổi, đọc nguồn liên quan và phân biệt: yêu cầu đã xác nhận, đề xuất đang xét, giả định tạm, kết quả có bằng chứng. Thiếu thông tin ảnh hưởng hành vi thì xác minh hoặc hỏi; không tự đặt dữ liệu/luật nghiệp vụ để hoàn tất cho nhanh. Quyết định triển khai thường lệ trong phạm vi đã giao có thể tự xử lý và ghi rõ lý do, không yêu cầu người dùng duyệt lại từng bước.

Mỗi thay đổi đáng kể cần trả lời được: vấn đề gì, hành vi mong muốn, phạm vi ảnh hưởng, nguồn kỹ thuật, cách kiểm và phần còn chưa biết. Không tạo một file riêng cho mỗi hàm hoặc chép nguyên log/hội thoại vào tài liệu.

| Khi thay đổi | Nguồn cần cập nhật hoặc đối chiếu |
| --- | --- |
| Yêu cầu và hành vi | [Yêu cầu/phạm vi](02-yeu-cau-va-pham-vi.md), tài liệu module tương ứng |
| Ranh giới hệ thống hoặc lựa chọn kỹ thuật lớn | [Kiến trúc](03-kien-truc-he-thong.md), ADR trong `docs/decisions`; ADR còn đề xuất không gắn trạng thái accepted |
| HTTP API, dữ liệu và sự kiện | [Dữ liệu/giao tiếp](04-du-lieu-va-giao-tiep.md), `packages/contracts`; OpenAPI/schema/migration khi đã tồn tại |
| Giao diện và cấu hình động | [Trải nghiệm](06-trai-nghiem-va-man-hinh.md), [định hướng nền tảng](11-nen-tang-ai-va-cau-hinh-dong.md), bản preview và version khi có |
| Năng lực/quyền của AI | [AI](07-tro-ly-ai.md), capability/tool registry khi triển khai, policy và phép đánh giá |
| Hành vi hoặc rủi ro cần kiểm | [Kiểm thử](08-kiem-thu-va-danh-gia.md), test ở lớp sở hữu hành vi và kết quả thực tế |
| Dependency/công nghệ | Manifest và lockfile của dự án khi có; [nguồn/câu hỏi mở](10-nguon-va-cau-hoi-mo.md) cho lựa chọn quan trọng |
| Nội dung đưa vào HTML | Nguồn Markdown/JSON → `tools/docs/build.py` → `--check`; không sửa bản generated |

Một nguồn chính cho mỗi loại thông tin. Code/schema/manifest là nguồn chi tiết kỹ thuật có thể kiểm; tài liệu giải thích nghiệp vụ và lý do. Khi hai bên mâu thuẫn, đối chiếu yêu cầu và test trước khi sửa, không mặc định bên nào cũng đúng. Obsidian giữ quyết định, tiến độ và liên kết, không thành bản sao đặc tả thứ hai.

## Đọc tài liệu chính thức và dùng đúng phiên bản

1. Xác định ngôn ngữ, runtime/SDK, framework, package, version và công cụ build/test từ repository và môi trường thực. Editor không quyết định framework; ví dụ dùng C# trong một editor không xác định phiên bản .NET hay framework web.
2. Đọc tài liệu chính thức/API reference đúng chức năng và phiên bản; khi nâng phiên bản đọc migration guide và release notes liên quan. Không cần đọc toàn bộ tài liệu framework cho một sửa đổi nhỏ.
3. Kiểm API/package thực sự tồn tại và cách sử dụng; không tự sáng tác tên method rồi xem như API thư viện.
4. Ghi nguồn, phiên bản, luận điểm dùng và giới hạn vào tài liệu quyết định phù hợp. Blog/câu trả lời AI hỗ trợ tìm hướng, không thay xác minh API.
5. Kiểm hành vi trong môi trường dự án. “Có tiêu chuẩn”, “thư viện hỗ trợ” và “đã chạy đúng trong đồ án” là ba mức bằng chứng khác nhau.

Nếu công cụ tra cứu không dùng được, truy cập nguồn chính thức khác hoặc tài liệu đúng version có sẵn. Ghi rõ phần chưa đọc được, không báo đã xác minh hoặc tự nâng dependency để né vấn đề.

## Tái sử dụng trước khi viết mới

Khảo sát source hiện có, manifest/lockfile, API và component nội bộ liên quan; đối chiếu chức năng chuẩn của ngôn ngữ/framework. Ưu tiên implementation đúng nghiệp vụ đã tồn tại. Nếu chưa có, đánh giá thư viện được duy trì phù hợp; tự viết phần nhỏ đặc thù khi lựa chọn đó có lý do rõ ràng.

Thư viện “đã cài trên máy” chưa chắc là dependency của dự án hoặc tái lập được trên CI. Khi dùng phải khai báo ở đúng manifest/lockfile. Cân nhắc compatibility, license, bảo trì, lỗ hổng liên quan, kích thước và chi phí vận hành; không thêm dependency chỉ để tránh viết vài dòng đơn giản.

Không ép các nghiệp vụ khác nhau dùng chung một abstraction vì tên hàm giống nhau. Shared Core chứa cơ chế chung có trách nhiệm rõ; luật đặc thù thuộc module sở hữu. Frontend và AI không tự viết lại nghiệp vụ đã có ở Business Service.

## Tra cứu năng lực và phạm vi ảnh hưởng

Đề xuất khi bắt đầu có source: mỗi capability có tên, mục đích, nơi triển khai chính thức, contract, quyền, module dùng, test/tài liệu liên quan và trạng thái `planned`/`active`/`deprecated`. Phần có thể suy ra từ source/manifest nên sinh hoặc kiểm tự động; không duy trì danh sách endpoint/package thủ công thứ hai.

Hiện repository đã có `packages/contracts` với zod schema cho các miền nghiệp vụ (được API, web và simulator import), các module NestJS trong `backend/src` và web React trong `frontend/src`; ngày 15/11/2026 API chạy 20 suite/219 test và web chạy 35 file/250 test; randomized 219/219, E2E 26/26, build web pass. **Chưa có** runtime tool registry/capability `active`, OpenAPI máy sinh hoặc quality gate tự động trong CI. Dùng manifest và README hiện có; không tạo index giả chứa đường dẫn code chưa tồn tại.

Với thay đổi xuyên module, thực hiện:

1. **Discovery:** tìm định nghĩa, call sites, truy vấn, quyền, event/job, báo cáo/export, frontend, AI tools và test liên quan. Bắt đầu bằng tìm text/file, bổ sung symbol/reference/dependency search nếu cần.
2. **Impact map:** ghi đường đi dữ liệu, module ảnh hưởng, thay đổi cần làm, nơi không cần đổi và bằng chứng cho kết luận đó. Không suy phạm vi chỉ từ trang người dùng nhắc đến.
3. **Thực hiện:** sửa nguồn quy tắc chính và mọi điểm chịu ảnh hưởng trong phạm vi đã giao; xét migration/backward compatibility. Không tiện tay refactor phần độc lập.
4. **Xác minh:** kiểm hành vi ở các điểm đã liệt kê, tìm implementation cũ còn sót, đối chiếu contract và cập nhật docs. Search không thấy chuỗi cũ chưa đủ chứng minh hành vi đúng.

Mẫu ghi ngắn, dùng khi đã có thay đổi thực tế:

| Nguồn quy tắc/đường gọi | Hành vi bị ảnh hưởng | Thay đổi hoặc lý do không đổi | Bằng chứng | Trạng thái |
| --- | --- | --- | --- | --- |
| Điền từ source thật | Điền từ yêu cầu đã xác minh | Không đoán module | Test/log/diff có thật | Chưa kiểm / đạt / còn lỗi |

## Ví dụ soft-delete: chốt nghĩa trước khi chia sẻ code

Đây là tình huống người dùng kể về dự án khác, **chưa phải chính sách xóa đã chọn cho DATN**. “Soft-delete”, “archive”, vô hiệu hóa truy cập và tháo liên kết có thể là các hành vi khác nhau. Không suy việc gắn `deleted_at` sẽ tự gỡ khóa ngoại hoặc tự thu hồi toàn bộ quyền.

Khi đặc tả chính sách xóa, cần xác định: dữ liệu giữ lại, quyền đọc chi tiết/truy vấn trực tiếp, quan hệ còn giữ hay được kết thúc, tác vụ đang chạy, phục hồi, xung đột định danh và lịch sử audit. Quan hệ lịch sử phục vụ báo cáo có thể cần giữ nguyên; nếu cần tháo quan hệ hoạt động thì mô tả riêng, không xóa khóa ngoại hàng loạt từ một tên chức năng.

Tình huống hồi quy phù hợp: một đối tượng bị xóa theo chính sách không còn xuất hiện hoặc được thao tác qua các đường bị cấm như danh sách, URL chi tiết, search, export, AI tool, job và cache; những đường lịch sử/quản trị được phép vẫn đúng quyền. Có kiểm restore nếu nghiệp vụ cho phép. Không chỉ test một utility hoặc hai trang rồi kết luận toàn hệ thống nhất quán.

## Phát triển backend và preview frontend

Áp dụng ranh giới trong [định hướng nền tảng](11-nen-tang-ai-va-cau-hinh-dong.md). Người dùng yêu cầu frontend có preview/chấp nhận; chuẩn bị đầy đủ bản xem trước, diff và kiểm liên quan trước khi xin quyết định áp dụng. Thay đổi nội dung tài liệu hiện tại không phải phát hành frontend của sản phẩm.

Việc AI được giao sửa backend ở môi trường phát triển không có nghĩa AI runtime có quyền sửa chính backend đang chạy. Cơ chế branch/review/release/sandbox của sản phẩm là đề xuất cần chốt, không tự coi bài trả lời ở link chia sẻ là ủy quyền triển khai production.

## Kiểm chứng đúng lớp và đúng phạm vi

- Bắt đầu bằng lint/type-check hoặc syntax liên quan khi đã có toolchain, rồi test nhỏ nhất bao phủ hành vi ứng dụng sở hữu.
- Mở rộng integration/contract khi luồng dữ liệu qua nhiều module, quyền hoặc lưu trữ bị ảnh hưởng. E2E, race, load và stress dùng khi khớp rủi ro cần điều tra.
- Không test lại nội bộ framework, không viết test chỉ lặp lại implementation hoặc tạo test hình thức cho sửa đổi tài liệu nhỏ.
- Chạy test tuần tự mặc định. Lỗi thì đọc bằng chứng và sửa nguyên nhân; không retry mù, bỏ/nới test để làm xanh.
- Chỉ chạy full suite khi cần release gate hoặc bằng chứng hồi quy rộng. Chạy đạt không đồng nghĩa đã deploy hoặc được nghiệm thu.

Khi có source, có thể thêm kiểm dependency boundary, contract và policy để ngăn lệch kiến trúc. Chọn kiểm tra gắn với rủi ro cụ thể; không mặc định phải cài mọi công cụ nêu trong bài tham khảo. Ở HEAD đã có `pnpm -r typecheck`, test từng package, `tools/docs/build.py --check` và `tools/docs/check-examples.mjs`; **chưa có** CI tự động, dependency boundary hay contract test sinh tự động nên các cổng này vẫn phải chạy tay.

## Bảo mật, quyền riêng tư và bằng chứng v2

Phần này ghi các bất biến phải giữ khi mở rộng, không tuyên bố sản phẩm đã tuân thủ pháp lý hay đủ an toàn cho dữ liệu thật.

| Chủ đề | Quy tắc đang áp dụng | Bằng chứng/giới hạn |
| --- | --- | --- |
| Quyền xem số đo | `canViewMeasurements` tách khỏi `canReceiveAlerts`; thiếu quyền số đo trả 403 nghiệp vụ, không 404 vì người thân vẫn có quyền hồ sơ; áp cho measurements/daily-summary/insights/export/status/devices/assistant/Studio | Test `care.spec.ts`, `devices.spec.ts`, `assistant.spec.ts`, `studio.spec.ts`; chưa có test xuyên toàn bộ đường trong một kịch bản thu hồi |
| AI không vượt quyền | Assistant gọi `requireMeasurementsHistory` + `assertAction('view_ai')`; aggregate chỉ từ mẫu đã lọc quyền/cách ly; response có `dataQuality` | Test assistant quyền/fallback; chưa test prompt injection, chưa dùng provider thật |
| AI hành động có kiểm soát | FR-21: nháp `care_reminder.create` → preview → confirm; owner-only; confirm tạo lịch trong cùng transaction; catalog việc không được làm; audit không chứa nội dung nháp | `assistant-actions.spec.ts`; chưa có parser tự nhiên/UI/retention cho `assistant_drafts` |
| Admin và dữ liệu sức khỏe | `AccessService` chỉ cho owner/care link; role admin không tự mở hồ sơ; admin device tab chỉ metadata thiết bị | Test admin subject 404, notifications 404; policy/audit có test |
| Thu hồi quyền | Care link thu hồi chặn REST/export/AI/Studio/notification; SSE gửi `revoked`; khóa tài khoản/phiên hết hạn cũng đóng stream | `sse.spec.ts` S1–S6, `notifications.spec.ts` N4–N10, `studio.spec.ts` T12/T13 |
| Dữ liệu trẻ em/người cao tuổi | Demo chỉ dùng dữ liệu tổng hợp; chưa có quy trình đồng ý cho người giám hộ, chưa thử với người thật; mô hình người đại diện còn mở | Không có bằng chứng pháp lý/đồng thuận thực tế; không được tuyên bố tuân thủ luật cụ thể |
| Lưu trữ/xóa/retention | Archive chỉ ẩn + thu hồi chia sẻ; deletion request chỉ ghi audit `recorded`; retention job mặc định tắt xóa một số lớp theo tuổi; không xóa toàn bộ hồ sơ/export/backup | `subjects.spec.ts`, `retention.spec.ts`; UI nói rõ chưa xóa; chưa có API/UI retention |
| Dữ liệu nhạy cảm trong log/audit | Audit cảnh báo/thiết bị/liên hệ không ghi HR, bước, số điện thoại, token hay evidence | Test metadata quarantine/contact; chưa kiểm log production |
| Secret và phiên | Cookie HttpOnly/SameSite, mật khẩu scrypt, session bảng DB thu hồi được, Origin check cho ghi; secret ngoài Git | `auth.spec.ts`, `account.spec.ts`; chưa có TLS termination/rotation production |
| Cách ly ingest | Mẫu lệch giờ/ngoài assignment không tạo incident/outbox/SSE; telemetry cách ly không vào đường đọc; audit không chứa số đo | `ingest.spec.ts`, `incidents.spec.ts` T19–T24; chưa có UI xem vùng cách ly |

**Không tuyên bố:** chưa có đánh giá pháp lý, chưa ký thỏa thuận xử lý dữ liệu, chưa có cơ chế đồng ý/khôi phục/xóa theo yêu cầu pháp lý, chưa kiểm với dữ liệu người thật. Các câu “đã bảo vệ dữ liệu” trong báo cáo phải giới hạn ở hành vi kỹ thuật có test nêu trên.

## Điều kiện báo hoàn thành

### Hồ sơ thay đổi có thể đối chiếu

Bổ sung ngày **11/11/2026**. Mẫu dưới đây dùng trong tài liệu module, ADR hoặc mô tả thay đổi tương ứng; không tạo checklist tiến độ thứ hai. Điền bằng nguồn thật, ghi rõ “chưa có/chưa đo” khi thiếu. Với sửa tài liệu đơn giản, chỉ cần các mục liên quan; không tạo hồ sơ hình thức cho mỗi câu chữ.

| Trường | Nội dung cần lưu |
| --- | --- |
| Nguồn và trạng thái yêu cầu | Người dùng/đề cương/issue có thật; đã xác nhận, giả định hay đề xuất |
| Hành vi trước/sau | Trigger, actor/scope, đầu vào, kết quả quan sát và tình huống lỗi |
| Contract và quy tắc | API/tool/config version; quyền, validation, concurrency, retry và side effect bị ảnh hưởng |
| Impact map | Service, query, job/event, export, UI/AI, migration và test liên quan; lý do nơi không phải sửa |
| Căn cứ kỹ thuật | Tài liệu chính thức và phiên bản đã đọc; built-in/shared code/dependency đã khảo sát |
| Artifact thay đổi | File/diff, commit hoặc build/config digest khi đã có; không bịa commit ở thư mục chưa Git |
| Preview/chấp nhận | Bản preview, version và phạm vi nếu đổi frontend; ai chấp nhận và bằng chứng thực tế; chưa duyệt thì ghi chưa duyệt |
| Kiểm chứng | Lệnh, môi trường/version, dữ liệu, expected/actual, số tác động, artifact đã lọc; phân biệt test đề xuất với test đã chạy |
| Giới hạn và phục hồi | Phần chưa kiểm, migration/compatibility, cách rollout hoặc compensation có điều kiện; không hứa undo mọi tác động |

Truy vết theo chuỗi **yêu cầu → contract/quyết định → hành vi → phép kiểm → bằng chứng thực tế**. Ví dụ cho một yêu cầu đã có: “AI tự làm trong quyền được giao” → proposal delegation ở chương 13 → kiểm tại ranh giới đọc/gửi model/ghi/giao file → AI-02/AI-08/AI-14 → kết quả còn **chưa chạy**. Cùng mã phép kiểm không được dùng để ngụ ý đã có file test.

Đối với AI, lưu model/prompt/tool/config version thực dùng, tập nhiệm vụ và số lần thử; lưu plan công khai/tool result đã lọc để giải thích tác động. Không lưu suy luận nội bộ của model làm bằng chứng, không đưa secrets hoặc raw dữ liệu sức khỏe vào log chung. Phiên bản có nguồn chưa khóa chỉ ghi là phiên bản khảo sát.

### Đối chiếu review và quyết định

Mỗi finding ghi tình huống, hệ quả, vị trí nguồn, thay đổi đáp ứng và cách kiểm. Tách ba trạng thái: **đã bổ sung đặc tả**, **đã triển khai**, **đã kiểm với bằng chứng**. Review tài liệu không tự chuyển hai trạng thái sau; fix đã có test cục bộ cũng chưa đồng nghĩa deploy/nghiệm thu. [Review nền tảng AI](reviews/02-nen-tang-ai-va-cau-hinh-dong.md) áp dụng cách ghi này.

Quyết định kỹ thuật chỉ chuyển sang accepted khi có căn cứ và chấp thuận trong phạm vi cần chốt; giữ nguyên các phương án còn mở. Với thay đổi quy tắc dùng chung, rà cả các ví dụ/baseline để tránh mâu thuẫn: chẳng hạn version conflict theo body và thất bại `If-Match` cần phân biệt trong mọi tài liệu HTTP liên quan.

### Báo cáo kết quả

Kết quả phải ghi đúng: đã thay gì, vì sao, phạm vi/API/data bị ảnh hưởng, kiểm nào đã chạy với kết quả thật, phần chưa kiểm và giới hạn. Tài liệu liên quan phải cập nhật, HTML phải khớp nguồn, phần cần preview phải có bản review được. Chỉ nói một module/khả năng hoạt động khi có bằng chứng thực thi, không dựa vào việc đã viết thiết kế. Khi test/build/E2E còn fail, báo đúng lỗi và phạm vi ảnh hưởng thay vì ghi “đã chạy ổn”.

Hướng dẫn bằng văn bản giúp các agent làm nhất quán; nó không bảo đảm AI không bao giờ sai. Cần kiểm chứng thực tế và cơ chế backend/CI ở những ranh giới đã xác định.
