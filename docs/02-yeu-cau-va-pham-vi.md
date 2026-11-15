# Yêu cầu và phạm vi

> **Baseline v0.1:** phạm vi gốc dưới đây được soạn trước yêu cầu nền tảng AI tự thực thi và cấu hình động. Đọc [yêu cầu bổ sung ở chương 11](11-nen-tang-ai-va-cau-hinh-dong.md) trước khi triển khai; bảng FR/NFR vẫn là nguồn yêu cầu, còn cột trạng thái v2 phản ánh phần **đã có bằng chứng trong code/test**, không phải nghiệm thu sản phẩm.

**Trạng thái 15/11/2026:** đã triển khai lát cắt phần mềm v1/v2 trên dữ liệu tổng hợp. Cột “Trạng thái v2” dùng các mức chính: **Đã có** (có endpoint/UI + test ở lớp sở hữu hành vi), **Đã có phần lớn**, **Một phần** (có một phần, phần còn lại ghi rõ), **Chưa làm**; phần “giới hạn” nghĩa là chỉ đáp ứng một phần tiêu chí. P0/P1 là thứ tự kỹ thuật đề xuất cho bản demo, chưa phải cam kết tiến độ hay xác nhận của giảng viên. Các yêu cầu truy vết lại đề cương trong [nguồn](10-nguon-va-cau-hoi-mo.md).

## Vai trò và quyền

| Vai trò | Được làm | Điều kiện/giới hạn |
| --- | --- | --- |
| Người được theo dõi/chủ hồ sơ | Xem dữ liệu của mình; quản lý chia sẻ; lưu trữ hồ sơ; ghi nhận yêu cầu xóa; tạo việc bảo trì; quản lý liên hệ khẩn cấp; thao tác hủy/SOS trên thiết bị | Cần cơ chế hỗ trợ thiết lập phù hợp khả năng sử dụng; firmware chưa có |
| Người thân | Xem hồ sơ được chia sẻ; nhận cảnh báo; xác nhận/đóng cảnh báo nếu được cấp quyền; xem liên hệ khẩn cấp khi có quyền nhận cảnh báo | Quyền theo từng hồ sơ và khoảng lịch sử; `canViewMeasurements` quyết định quyền xem số đo/lịch sử/CSV; có thể thu hồi |
| Quản trị viên | Quản lý tài khoản, thiết bị, cấu hình vận hành và audit | Không mặc định được đọc dữ liệu sức khỏe hoặc chat AI; muốn đọc phải là chủ hồ sơ hoặc có care link hợp lệ |
| Thiết bị | Gửi dữ liệu/sự kiện của chính nó; nhận ACK/cấu hình cho chính nó | Định danh riêng; không gửi `subject_id` để tự chọn bệnh nhân; HTTP là đường đang hỗ trợ |

Một tài khoản có thể vừa có hồ sơ riêng, vừa là người thân của hồ sơ khác. Quan hệ cấp quyền quyết định quyền truy cập; không chỉ dựa trên tên role toàn hệ thống. Mô hình người đại diện khi người cao tuổi không có tài khoản là vấn đề cần xác nhận, không tự cho người thân quyền sở hữu.

**Quyền v2 đã triển khai:** `care_links.permissions`/`invitations.permissions` có `historyDays`, `canReceiveAlerts`, `canAcknowledge`, `canResolve`, `canViewAi` và `canViewMeasurements`. `canViewMeasurements=false` chặn `/measurements`, `/daily-summary`, `/insights`, `/export.csv`, dữ liệu số đo trong `/status`/`/devices` và cả trợ lý AI (AI đọc số đo). Người thân vẫn nhận cảnh báo nếu `canReceiveAlerts=true`. Link cũ thiếu trường này được đọc là `true` để không thu hẹp quyền đã cấp.

## Yêu cầu chức năng

| ID | Năng lực | Phạm vi đề xuất | Tiêu chí chấp nhận ở bản demo | Trạng thái v2 (15/11/2026) |
| --- | --- | --- | --- | --- |
| FR-01 | Trang giới thiệu, đăng ký/đăng nhập/đăng xuất | P0 | Có luồng vào hệ thống và thông báo lỗi; API xác minh phiên phía server | **Đã có**: thêm cài đặt tài khoản (tên, mật khẩu, danh sách/thu hồi phiên); test `account.spec.ts`, `auth.spec.ts`, UI `LoginPage`/`SettingsPage` |
| FR-02 | Hồ sơ và chia sẻ người thân | P0 | Mời, chấp nhận, giới hạn quyền, thu hồi; yêu cầu tiếp theo và luồng realtime mất quyền ngay khi bị thu hồi | **Đã có phần lớn**: `canViewMeasurements`, cửa sổ `historyDays`/`sharedFrom` áp cho lịch sử/cảnh báo/AI/Studio/notification; SSE `revoked`. **Chưa có** flow người thân xin thêm quyền |
| FR-03 | Gắn, thu hồi và chuyển thiết bị | P0 | Chứng minh quyền ghép thiết bị; không chuyển dữ liệu cũ sang hồ sơ mới khi đổi chủ | **Một phần**: claim/release UI; admin có tab thiết bị, cấp mã, xoay khóa; tạo thiết bị mới vẫn qua API admin. Dữ liệu/sự kiện gán theo assignment tại `measured_at`, mẫu không xác định bị cách ly |
| FR-04 | Nhịp tim, bước chân, chất lượng tín hiệu | P0 | Xem giá trị, đơn vị, thời điểm; thiếu/sai tín hiệu không thành số 0; reset thiết bị không làm bước chân âm | **Đã có**: test measurements/ingest; UI ẩn số đo khi `healthDataVisible=false` hoặc thiếu quyền |
| FR-05 | Biểu đồ và thống kê | P0 | Lọc ngày/khoảng thời gian; hiển thị đoạn thiếu dữ liệu, không tính trung bình từ mẫu không hợp lệ | **Đã có**: lịch sử có coverage/gap/CSV; thêm xu hướng 7/14/30 ngày (`/insights`), ngày thiếu hiển thị “—” |
| FR-06 | Nghi té ngã và hủy báo nhầm | P0 | Có cửa sổ hủy tại thiết bị và trạng thái cuối theo từng incident; gửi trùng không tạo cảnh báo mới | **Một phần**: backend có state machine, dedupe, `suspected → unconfirmed` khi quá hạn; UI hiện “Chưa xác định”. **Chưa có firmware** nên cửa sổ hủy/chống bấm nhầm trên thiết bị chưa kiểm |
| FR-07 | Hộp cảnh báo và xác nhận hỗ trợ | P0 | Người có quyền nhận sự kiện, xác nhận và đóng có lý do; hai người xác nhận đồng thời không gây mất lịch sử | **Đã có**: ack/resolve CAS, outbox in-app, SSE, badge/banner toàn tài khoản; chưa có Web Push |
| FR-08 | Thiết bị offline, dữ liệu cũ, pin | P0 | Phân biệt không có dữ liệu với giá trị bình thường; pin chưa đo phải hiển thị chưa biết | **Đã có**: freshness/policy, `healthDataVisible`, pin null hiển thị chưa biết; mẫu cách ly không lọt dashboard/lịch sử |
| FR-09 | SOS chủ động và liên hệ hỗ trợ | P0 đề xuất thêm | SOS bỏ qua cửa sổ nghi ngã; có xác nhận chống bấm nhầm; liên hệ thủ công từ giao diện | **Một phần**: ingest SOS mở incident trực tiếp; sổ liên hệ khẩn cấp (tối đa 5) + `tel:` trong chi tiết cảnh báo. **Chưa có** nút SOS/anti-mistap trên firmware |
| FR-10 | AI tóm tắt ngày/giải thích dữ liệu | P0 giới hạn | Dựa trên dữ liệu được phép, dẫn khoảng dữ liệu; thiếu dữ liệu thì nói rõ; tắt AI không ảnh hưởng cảnh báo | **Một phần/giới hạn**: summary/ask + `dataQuality` (coverage/gaps/limitations/synthetic), fallback template; không có RAG/planner/tool runtime. Tắt AI bằng cấu hình triển khai, chưa có toggle UI |
| FR-11 | Admin tối thiểu | P0 | Xem tình trạng tài khoản/thiết bị và audit đã lọc; không xem sức khỏe qua role admin đơn thuần | **Đã có phần lớn**: user/device/policy/audit/overview; admin không có care link bị 404 với dữ liệu hồ sơ. **Chưa có** UI tạo thiết bị, backup/restore, retention |
| FR-12 | Thông báo khi đóng trình duyệt | P1 | Chỉ đánh dấu hỗ trợ sau khi kiểm Web Push trên nền tảng mục tiêu; có trạng thái gửi thất bại/không rõ đã đọc | **Chưa làm**: không có service worker/Web Push; outbox chỉ `in_app` |
| FR-13 | Ngưỡng chỉ số cấu hình được | P1 | Có nguồn/phiên bản cấu hình và cơ chế chống lặp; không cài ngưỡng y khoa tùy ý | **Một phần**: policy `device_runtime` có preview/publish CAS (heartbeat/offline/freshness/late/rate). **Chưa có** ngưỡng sức khỏe hay ngưỡng phát hiện ngã |
| FR-14 | Xuất, lưu trữ, xóa dữ liệu | P0 thiết kế, triển khai trước dữ liệu thật | Quyền người yêu cầu được kiểm tra; phạm vi xóa gồm bản sao, AI, cache và chính sách backup | **Một phần**: CSV; lưu trữ hồ sơ (không xóa) + thu hồi chia sẻ; yêu cầu xóa chỉ ghi audit `recorded`. **Chưa có** xóa cứng, retention tự động, xử lý backup/AI cache |

P0 ban đầu dùng dữ liệu tổng hợp và người nhận demo. Giao diện phải nói rõ cảnh báo trong ứng dụng chỉ được quan sát khi đang kết nối; không hứa báo thức nền hoặc cuộc gọi tự động.

## Tính năng v2 và trạng thái triển khai

Bảng dưới ghi phần **đã bổ sung sau baseline v0.1**, kèm yêu cầu liên quan và giới hạn còn lại. Đây là trạng thái kỹ thuật tự kiểm, không phải danh sách nghiệm thu.

| Năng lực v2 | Yêu cầu liên quan | Trạng thái | Bằng chứng/ghi chú |
| --- | --- | --- | --- |
| Cài đặt tài khoản: đổi tên, đổi mật khẩu, xem/thu hồi phiên | FR-01, NFR-05 | Đã có | `PATCH /me`, `POST /me/password`, `GET/DELETE /me/sessions`, `POST /me/sessions/revoke-others`; UI `/app/settings`; test `account.spec.ts`, `SettingsPage.test.tsx` |
| Xu hướng 7/14/30 ngày | FR-05 | Đã có | `GET /subjects/:id/insights?days=`; card “Xu hướng gần đây”; test `insights.spec.ts`, `RecentInsightsCard.test.tsx` |
| Sổ liên hệ khẩn cấp | FR-09 | Đã có | CRUD `/subjects/:id/emergency-contacts`, tối đa 5, một liên hệ chính; owner ghi, caregiver có `canReceiveAlerts` đọc; test `emergency-contacts.spec.ts` |
| Tạo việc bảo trì | FR-11 (vận hành) | Đã có | `POST /maintenance-tasks`; chủ hồ sơ tạo cho thiết bị đang gắn; caregiver chỉ xem; test `task-create.spec.ts`, `TasksPage.test.tsx` |
| Lưu trữ hồ sơ và ghi nhận yêu cầu xóa | FR-14 | Một phần | `POST /subjects/:id/archive` (204, thu hồi care link, không xóa dữ liệu) và `POST /subjects/:id/deletion-requests` (202 `recorded`); chưa có xóa cứng/retention |
| Quyền xem số đo tách khỏi nhận cảnh báo | FR-02, NFR-01 | Đã có | `canViewMeasurements` trong contract/DB jsonb; API trả 403 nghiệp vụ; `/status` có `healthDataVisible`; test `care.spec.ts`, `devices.spec.ts`, `assistant.spec.ts` |
| Badge/banner thông báo và cảnh báo mới | FR-07 | Đã có | Badge chưa đọc, banner thông báo mới, banner mất SSE; `AppShell` + hook thông báo; test `AppShell.test.tsx` |
| Quản trị thiết bị | FR-03, FR-11 | Đã có phần lớn | Tab thiết bị: danh sách, cấp mã, xoay khóa (mã/khóa chỉ hiện một lần); tạo thiết bị mới vẫn qua API admin |
| Studio publish/rollback và ranh giới dữ liệu | docs/11 (preview) | Đã có | Draft → preview → publish CAS → rollback; dữ liệu theo `sharedFrom`/`historyDays`; caregiver thiếu quyền cảnh báo không thấy alert trong Studio; test `studio.spec.ts` T12/T13 |
| Cách ly ingest | FR-03, FR-04, NFR-02 | Đã có | Telemetry/sự kiện gán theo assignment tại `measured_at`; mẫu lệch giờ/ngoài assignment bị cách ly; HTTP ack `QUARANTINED`; test `ingest.spec.ts`, `incidents.spec.ts` T19–T24 |
| SSE thu hồi tức thời | FR-02, NFR-01 | Đã có | Mỗi vòng poll kiểm phiên/trạng thái người dùng và care link; gửi `event: revoked` rồi đóng stream; test `sse.spec.ts` S1–S6 |

## Quyền, đồng thuận và giới hạn dữ liệu

- **Đồng thuận theo phạm vi:** lời mời ghi rõ quyền nhận cảnh báo, xác nhận/đóng, xem AI, xem số đo và số ngày lịch sử. Người thân không mặc định thấy dữ liệu trước mốc chấp nhận (`sharedFrom`) hoặc ngoài `historyDays`.
- **Tách quyền:** quyền xem số đo không đồng nghĩa quyền nhận cảnh báo và ngược lại. AI chỉ đọc số đo khi người xem có cả `canViewMeasurements` và `canViewAi`; admin không có care link không đọc được hồ sơ.
- **Lưu trữ không phải xóa:** lưu trữ hồ sơ ẩn hồ sơ khỏi danh sách và thu hồi liên kết, nhưng telemetry/cảnh báo/bản xuất vẫn còn. Yêu cầu xóa hiện chỉ ghi audit, chưa có thời hạn xử lý, chưa xóa backup/AI cache.
- **Dữ liệu trẻ em/người cao tuổi:** sản phẩm chưa có quy trình đồng ý cho người giám hộ, chưa đánh giá pháp lý và chưa thử với người thật; mọi dữ liệu demo là tổng hợp. Không dùng tài liệu này để tuyên bố tuân thủ một luật/quy định cụ thể.
- **Cảnh báo không phụ thuộc AI:** AI lỗi hoặc chưa cấu hình không chặn ingest, incident, outbox hay SSE.

## Yêu cầu chất lượng

| ID | Yêu cầu | Cách kiểm dự kiến |
| --- | --- | --- |
| NFR-01 | Kiểm quyền theo hồ sơ cho REST, realtime, export và AI | Tài khoản không được chia sẻ phải bị từ chối ở cả bốn đường dữ liệu |
| NFR-02 | Xử lý trùng và lỗi mạng | Gửi lặp, đảo thứ tự, khởi động lại, mất mạng; đối chiếu số bản ghi/cảnh báo |
| NFR-03 | Thời gian có thể giải thích | Giữ thời gian thiết bị, server, trạng thái đồng hồ và độ mới; phân biệt thời gian phát hiện với thời gian gửi |
| NFR-04 | Dễ thao tác | Cỡ chữ rõ, nút chính ít, không chỉ dùng màu; thử các tác vụ cốt lõi với người phù hợp sau khi có đồng ý |
| NFR-05 | Bảo vệ dữ liệu | TLS, secret ngoài Git, log tối thiểu, giới hạn truy cập và kiểm thu hồi quyền |
| NFR-06 | Khôi phục và theo dõi lỗi | Có quy trình backup/restore, retry hữu hạn, trạng thái hàng gửi, bộ đếm mất mẫu; kiểm ở giai đoạn triển khai |
| NFR-07 | Độ trễ hiển thị | Đích demo đề xuất: p95 ≤ 5 giây từ server nhận sự kiện confirmed đến cập nhật dashboard đang online; đo riêng cửa sổ hủy và truyền từ thiết bị |

## Ngoài MVP

Ứng dụng native, gọi cấp cứu tự động, tự chẩn đoán/kê thuốc, theo dõi ngoài nhà bằng SIM/GPS, nhiều loại bệnh, huấn luyện mô hình ngã lớn, quản lý bệnh viện và tích hợp hồ sơ y tế. Đây là các hướng nghiên cứu mở rộng, không phải phần đã loại khỏi tên đề tài hay đã cam kết xây sau.

## Truy vết

Mỗi tính năng triển khai cần ghi ID yêu cầu vào PR/tài liệu thay đổi và liên kết bằng chứng. Bản [kiểm thử](08-kiem-thu-va-danh-gia.md) chứa ánh xạ yêu cầu → kịch bản và kết quả chạy thật ngày 15/11/2026; không đánh dấu đạt khi mới viết đặc tả. Các finding QA chưa được reviewer độc lập tái kiểm vẫn giữ trạng thái mở trong [docs/14](14-ke-hoach-trien-khai-phan-mem.md).
