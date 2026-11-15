# Kiểm thử và đánh giá

**Trạng thái 15/11/2026:** đã có test tự động và kết quả chạy thật cho lát cắt phần mềm v1/v2 trên dữ liệu tổng hợp; **chưa** có kết quả cho firmware, độ chính xác té ngã, Web Push, PostgreSQL/MQTT thật, khả dụng người cao tuổi hoặc p95. Ma trận T-01…T-14 dưới đây là thiết kế phép kiểm; chỉ dòng có bằng chứng trong bảng “Bằng chứng chạy” mới được coi là đã chạy một phần.

## Chiến lược chạy

1. Chạy lint và type-check liên quan khi đã có toolchain. Với thay đổi chỉ có tài liệu, kiểm Markdown/liên kết/JSON và sự nhất quán.
2. Chạy test nhỏ nhất bao phủ hành vi thay đổi: quyền truy cập, state transition, tổng hợp, chống trùng hoặc parser hợp đồng do ứng dụng sở hữu.
3. Mở integration test khi chạm transaction DB, broker, thời gian, quyền realtime hoặc tác vụ gửi.
4. Dùng E2E cho đường demo quan trọng; race test cho xác nhận đồng thời; load/stress chỉ khi đánh giá giới hạn cụ thể. Full suite dành cho gate phát hành hoặc bằng chứng hồi quy rộng cần thiết.

Mặc định chạy tuần tự. Khi fail phải đọc bằng chứng và tìm nguyên nhân trước khi chạy lại. Không bỏ/skip/nới test hợp lệ để làm xanh.

## Bằng chứng chạy ngày 15/11/2026

Môi trường: Windows, Node v24.22.2, pnpm 12.5.1, PGlite in-memory cho API, Vitest cho web, Playwright Chromium cho E2E. Đây là số đo trên nhánh master sau khi hợp nhất các fix cuối; không dùng số này thay cho lần chạy ở máy khác.

| Hạng mục | Lệnh | Kết quả thật |
| --- | --- | --- |
| API | `cd apps/api && pnpm test` | **20/20 suite, 214/214 test pass**, 109,2 s |
| Web unit | `cd apps/web && pnpm test` | **32/32 file, 178/178 test pass**, 11,2 s |
| Simulator | `cd tools/simulator && npm test` | **23/23 test pass** |
| Typecheck | `pnpm -r typecheck` | contracts/api/web/simulator **pass** |
| Contracts build | `pnpm build:contracts` | pass |
| API randomized | `cd apps/api && pnpm test:random --seed=1288443891` | **20/20 suite, 214/214 test pass**; đã scope audit rollback/export theo đối tượng để không phụ thuộc thứ tự |
| E2E | `cd apps/web && pnpm test:e2e` | **7/7 pass**; test 60 giây xác nhận không refetch sau khi tải thêm |
| Web production build | `cd apps/web && pnpm build` | **pass**; tách chunk theo route, chunk lớn nhất ~269 kB |
| Docs HTML | `python tools/docs/build.py --check` | pass sau khi sinh lại; xem log số link/ID/section ở handoff |
| Payload mẫu | `node tools/docs/check-examples.mjs` | parse đủ 5/5 payload bằng schema tương ứng |
| Seed demo | `cd apps/api && pnpm seed` | pass trên DB trống: 3 user, 2 hồ sơ, 1 thiết bị, 1.681 telemetry, 3 incident, 2 task, 2 outbox, 1 liên hệ khẩn cấp demo; `seed.spec.ts` xác nhận idempotent |
| MQTT exposure | `node infra/check-mqtt-exposure.mjs` | **không chạy lại** trong lượt này; cấu hình đã có kiểm regex trước đó, chưa chứng minh broker chạy |

**Kết luận có giới hạn:** bộ unit/integration API (214), web (178), randomized (214/214), E2E (7/7) và production build đã chạy xanh trên máy dev. Đây chưa phải bằng chứng cho PostgreSQL/MQTT thật, firmware, độ chính xác té ngã, p95 trên mạng thật hay khả dụng người cao tuổi; không dùng các con số này để tuyên bố “release-ready”.

### Đối chiếu T-01…T-14

| Phép kiểm | Bằng chứng hiện có | Phần chưa có/không đạt |
| --- | --- | --- |
| T-01 phiên | `auth.spec.ts`, `account.spec.ts`, `sse.spec.ts` S2/S3/S6; UI Settings | Chưa test logout/disable cắt SSE trong một kịch bản xuyên UI |
| T-02 quyền hồ sơ | `care.spec.ts`, `sse.spec.ts`, `assistant.spec.ts`, `studio.spec.ts` T12/T13, `notifications.spec.ts` N4–N10 | Chưa có E2E thật mời→accept→revoke xuyên API/web |
| T-03 chuyển thiết bị/dữ liệu cũ | `ingest.spec.ts` (assignment theo `measured_at`), `incidents.spec.ts` T19–T24 | Chưa chạy với thiết bị thật; chưa có UI xem vùng cách ly |
| T-04 chỉ số/coverage | `measurements.spec.ts`, `insights.spec.ts`; UI History/Insights | Chưa đo với dữ liệu cảm biến thật |
| T-05 vòng đời incident | `incidents.spec.ts` T1–T18; UI `AlertsPage` | Firmware/cửa sổ hủy thật chưa có |
| T-06 trùng/xung đột | `ingest.spec.ts`, `incidents.spec.ts` T5/T6/T19; simulator queue test | Chưa kill worker giữa transaction; chưa broker thật |
| T-07 outbox/restart | `notifications.spec.ts` N1–N3, `sse.spec.ts` | Chưa test crash/restart tiến trình gửi |
| T-08 hai người ack | `incidents.spec.ts` T7–T9; UI 409 | Chưa race test đa tiến trình |
| T-09 offline/clock/reboot | `devices.spec.ts`, `ingest.spec.ts`; UI offline/pin null | Chưa có thiết bị thật, buffer đầy hay mất nguồn |
| T-10 SOS/hủy | `incidents.spec.ts` T11; simulator `sos` | Không có nút SOS/anti-mistap trên firmware |
| T-11 AI thiếu dữ liệu/quyền | `assistant.spec.ts` (fallback, quyền, HR null, câu hỏi ngoài phạm vi), `dataQuality` test | Chưa test prompt injection; chưa provider thật; chưa RAG |
| T-12 admin/export/xóa | `admin.spec.ts`, `subjects.spec.ts`, `measurements.spec.ts`; UI archive/deletion-request | Chưa có xóa cứng/retention/backup; chưa kiểm admin với dữ liệu thật |
| T-13 Web Push | Không có service worker/Web Push | **Chưa làm**, ngoài phạm vi v2 |
| T-14 độ trễ p95 | Không có instrumentation p50/p95 | **Chưa đo**; NFR-07 vẫn là mục tiêu |

## Ma trận yêu cầu và bằng chứng

| ID phép kiểm | Yêu cầu | Kịch bản | Bằng chứng mong đợi |
| --- | --- | --- | --- |
| T-01 | FR-01, NFR-01 | Không có phiên, phiên hết hạn, đăng xuất | API từ chối đúng; không đọc dữ liệu còn lại qua stream |
| T-02 | FR-02, NFR-01 | Hồ sơ A/B; mời chưa chấp nhận; thu hồi lúc stream/AI đang chạy | Không có dữ liệu của hồ sơ không được phép; stream và kết quả đang sinh bị chặn |
| T-03 | FR-03 | Chuyển thiết bị từ A sang B rồi nhận dữ liệu cũ | Dữ liệu không rơi vào hồ sơ B; timestamp không tin cậy bị cách ly |
| T-04 | FR-04, FR-05 | BPM null, tín hiệu kém, counter bước reset, qua nửa đêm | Không coi null là 0; không bước âm; thời gian thiếu không bị che |
| T-05 | FR-06, NFR-02 | Candidate → cancel; candidate → confirmed; confirmed đến trước candidate | Đúng một incident; đúng trạng thái cuối; không gửi khẩn sau cancel |
| T-06 | FR-06, NFR-02 | Gửi cùng message 10 lần; cùng key khác payload; đảo revision | Không tạo cảnh báo trùng; payload xung đột bị phát hiện; không lùi trạng thái |
| T-07 | FR-07, NFR-06 | Commit incident rồi worker tắt; gửi lại sau khởi động | Outbox khôi phục được; trạng thái gửi phản ánh số lần thử, không báo đã đọc |
| T-08 | FR-07 | Hai người nhận xác nhận gần đồng thời | Trạng thái nhất quán, audit giữ tác nhân; không mất kết quả thao tác |
| T-09 | FR-08 | Mất mạng, clock unsynced, buffer đầy, reboot | Offline đúng chính sách; dữ liệu trễ rõ ràng; thống kê mất mẫu, không hứa khôi phục phần chưa ghi bền |
| T-10 | FR-09 | Bấm SOS, chống bấm nhầm, hủy sau confirmed | SOS không đợi cửa sổ nghi ngã; hủy sau gửi có thông báo cập nhật |
| T-11 | FR-10 | Thiếu dữ liệu, bịa số, prompt injection, yêu cầu hồ sơ khác | AI không trả dữ liệu ngoài quyền; không bịa số; có fallback |
| T-12 | FR-11, FR-14 | Admin đọc sức khỏe, export sau thu hồi, yêu cầu xóa | Quyền chặn đúng; xóa có phạm vi và trạng thái, không chỉ ẩn UI |
| T-13 | FR-12 | Trình duyệt đóng/tắt quyền push/kênh lỗi | Chỉ công bố hỗ trợ ở nền tảng đã kiểm; trạng thái thất bại không bị coi đã nhận |
| T-14 | NFR-07 | Đo chuỗi timestamp khi dashboard online | Báo p50/p95 và số mẫu; tách cửa sổ hủy, truyền mạng, xử lý, hiển thị |

T-13 chỉ chạy khi triển khai Web Push/P1. Các phép kiểm ở bảng vẫn là **mục tiêu**: một phần đã có test tự động ở lớp sở hữu hành vi (ví dụ `apps/api/test/incidents.spec.ts` cho state machine/dedupe/ack-resolve, `apps/api/test/measurements.spec.ts` cho coverage và quyền lịch sử, `apps/api/test/care.spec.ts` cho mời/thu hồi; số suite/test hiện tại ở `README.md` mục Kiểm thử), phần còn lại chưa có test hoặc chưa có kết quả đạt. Test của một module không chứng minh phép kiểm liên thành phần (phần cứng, Web Push, độ trễ mạng thật) đã đạt.

**Phần chưa chạy trong lượt này:** PostgreSQL thật/nhiều instance, MQTT broker + ACL + ACK, AI provider thật, Web Push, backup/restore, retention/xóa thật, p50/p95, load/stress, kiểm khả dụng với người cao tuổi/người chăm sóc, kiểm TLS/secret rotation, CI. Không được dùng kết quả unit/integration thay cho các phép đo này.

## Bổ sung cho AI thực thi và cấu hình động

[Chương 13, mục 12](13-dac-ta-thuc-thi-ai-va-cau-hinh.md) là nguồn của **AI-01…AI-17**: dùng chung service UI/AI, kiểm quyền xuyên các đường dữ liệu, approval, dedup từ request tạo run đến từng tác động, restart/cancel, preview/publication, cutover lịch, vòng phản hồi trigger, prompt injection và khả năng mở rộng module. AI-17 chỉ áp dụng nếu chọn Coding Agent trong sản phẩm. Không sao chép bảng sang đây để tránh hai nguồn khác nhau.

Bộ này là thiết kế phép kiểm, chưa chạy. [Review nền tảng AI](reviews/02-nen-tang-ai-va-cau-hinh-dong.md) liên kết finding với phép kiểm cần thực hiện. Khi có implementation, bắt đầu ở lớp sở hữu invariant; chỉ dùng integration/race/E2E cho ranh giới thực sự liên quan.

Đánh giá chất lượng tác vụ theo kết quả nghiệp vụ, thời gian/thao tác, can thiệp, chi phí và lỗi quyền/tác động trùng theo định nghĩa trong chương 13. Bộ nhiệm vụ giữ lại để đánh giá tách khỏi bộ dùng chỉnh prompt; báo điều kiện, version, mẫu số và dữ liệu thiếu. Kịch bản bảo vệ trong chương 13 nối thiết bị → tự động hóa → cấu hình → gây lỗi; không thay phép đo phần cứng bên dưới.

## Đánh giá phát hiện té ngã

Xác định đơn vị đánh giá là **sự kiện**, không đếm mỗi cửa sổ IMU như một người ngã độc lập. Lưu nhãn và ranh giới thời gian, vị trí đeo, người/phiên thử, cấu hình cảm biến và version thuật toán.

| Chỉ số | Cách tính/ghi nhận |
| --- | --- |
| Precision | `TP / (TP + FP)`; không xác định khi mẫu số bằng 0 |
| Recall | `TP / (TP + FN)`; không xác định khi mẫu số bằng 0 |
| F1 | `2 * precision * recall / (precision + recall)` khi xác định |
| Báo nhầm theo thời gian | Số cảnh báo giả / giờ theo dõi hợp lệ trong các hoạt động thường ngày |
| Độ trễ | Từ mốc sự kiện đã gán nhãn đến candidate và confirmed; báo riêng cửa sổ hủy |
| Mất dữ liệu | Thời gian hoặc mẫu thiếu / lượng kỳ vọng theo cấu hình |

Không chỉ dùng accuracy khi dữ liệu không ngã chiếm phần lớn. Nếu dùng dataset công khai, ghi giấy phép, thiết bị/vị trí thu và khác biệt với prototype. Chia train/tune/test theo người hoặc phiên, không để các cửa sổ gần nhau rơi vào cả train và test. Giữ tập test không dùng để chọn ngưỡng.

Tập hoạt động âm tính nên có ngồi xuống nhanh, nằm xuống, đi bộ, vung tay, tháo thiết bị và thiết bị rơi khỏi bàn. Mô phỏng bằng vật thay thế cần báo riêng; không gộp với thử trên người để tăng số liệu. Chưa có quy mô mẫu/đích accuracy được chốt.

## Đánh giá nhịp tim và bước chân

Nhịp tim: căn chỉnh thời gian với thiết bị tham chiếu, ghi nguồn/giới hạn tham chiếu, MAE trên cặp mẫu hợp lệ, phân bố sai số và tỷ lệ không có phép đo. Không loại im lặng các đoạn nhiễu để tạo kết quả đẹp; báo riêng nghỉ/vận động và điều kiện tiếp xúc.

Bước chân: dùng số bước đếm thủ công/nguồn tham chiếu của từng phiên, so chênh lệch tuyệt đối/tương đối theo hoạt động và vị trí đeo. Phiên có bước tham chiếu bằng 0 không dùng phần trăm chia cho 0; báo số đếm nhầm.

Pin: ghi cấu hình đo, chu kỳ gửi, RSSI/điều kiện mạng, dung lượng sử dụng và hoạt động cảnh báo. Thời lượng ước tính không thay phép đo chạy thực tế.

## Biểu mẫu bằng chứng tối thiểu

Mỗi lần thử ghi: mã lần thử, mục đích, phiên bản code/config, phần cứng/vị trí đeo, dữ liệu đầu vào và quyền dùng, bước thực hiện, kết quả kỳ vọng/thực tế, số mẫu/thời lượng, lỗi/giới hạn và đường dẫn artifact. Dùng ID ẩn danh; raw data ở vùng local đã loại khỏi Git.

Kết luận báo cáo phải kèm điều kiện thử. Không suy rộng từ một demo vài phút sang độ tin cậy trong gia đình hoặc khả năng chẩn đoán.
