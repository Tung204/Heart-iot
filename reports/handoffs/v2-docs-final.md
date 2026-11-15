# Handoff — cập nhật tài liệu cuối v2

- **Task:** `task_0b4b6ce79da3`, dispatch `ctx_272051ecd848`; worker `docs-v2-final`.
- **Nhánh/worktree:** `docs-v2-final` tại `C:\Users\nguye\orca\workspaces\DATN\docs-v2-final`.
- **Nền:** `a91b6cd docs(orchestration): spec tài liệu cuối v2`.
- **Ngày:** 15/11/2026.
- **Commit nội dung:** `b4a2442 docs: cap nhat trang thai v2 va bang chung kiem thu` (22 file).
- **Trạng thái:** đã cập nhật tài liệu theo HEAD v2, sinh lại HTML và kiểm link/JSON. Không sửa code, test ứng dụng hay `reports/**` cũ.

## Phạm vi đã sửa

| File | Thay đổi chính |
| --- | --- |
| `README.md` | Viết lại theo trạng thái v2: tính năng, lệnh chạy/seed/test, bảng kết quả ngày 15/11, module, ADR và giới hạn rõ ràng (không firmware/accuracy, MQTT thử nghiệm, không Web Push, deletion-request chỉ ghi nhận, AI template fallback) |
| `docs/02-yeu-cau-va-pham-vi.md` | Thêm cột trạng thái v2 cho FR-01…FR-14; bảng tính năng v2; quyền `canViewMeasurements`; tách quyền, lưu trữ ≠ xóa, dữ liệu trẻ em/người cao tuổi, không tuyên bố tuân thủ luật |
| `docs/03-kien-truc-he-thong.md` | Gán assignment theo `measured_at`, quarantine, `unconfirmed`, SSE `revoked`; MQTT chỉ telemetry và P0-2 mở; HTTP là đường chính thức |
| `docs/04-du-lieu-va-giao-tiep.md` | Inventory endpoint v2; mã trạng thái theo endpoint; payload ACK cách ly; mô hình `sessions`/`emergency_contacts`; 5 payload mẫu; retention/deletion-request |
| `docs/06-trai-nghiem-va-man-hinh.md` | Hiện trạng giao diện v2: settings, insights 7/14/30, contacts, archive/deletion, admin devices, Studio, badge/banner, a11y/motion; mục “chỉ mô phỏng hoặc chưa có” |
| `docs/07-tro-ly-ai.md` | Trạng thái summary/ask, `dataQuality`, fallback, quyền `canViewMeasurements` + `canViewAi`; chưa RAG/planner/provider thật |
| `docs/08-kiem-thu-va-danh-gia.md` | Bảng bằng chứng chạy 15/11/2026 (API/web/simulator/typecheck/randomized/E2E/build); đối chiếu T-01…T-14; phần chưa chạy |
| `docs/09-lo-trinh-va-ho-so.md` | G2 có mã nhưng chưa đạt cổng chuyển tiếp; G1/G3/G4 dài hạn chưa làm; cấu hình local hiện có |
| `docs/11`, `docs/13` | Ghi rõ đã có ứng dụng/trợ lý giới hạn, nhưng AI runtime dài hạn vẫn là thiết kế; không đọc nhầm là đã triển khai |
| `docs/12-nguyen-tac-phat-trien-va-bang-chung.md` | Bảng bảo mật/quyền riêng tư v2: tách quyền số đo, AI không vượt quyền, admin không đọc sức khỏe, thu hồi, retention, dữ liệu trẻ em/người cao tuổi |
| `docs/14-ke-hoach-trien-khai-phan-mem.md` | §11 trạng thái v2 + nhật ký thay đổi + lệnh/kết quả kiểm + việc chưa làm; §12 kết quả review và trạng thái xử lý, không đóng finding |
| `docs/README.md` | Trạng thái thiết kế + triển khai; chỉ rõ phần đã có/chưa có; dẫn chương 14/8 |
| `apps/api/README.md` | Chạy/seed/test; module; assignment/quarantine; quyền; SSE; deletion-request; giới hạn MQTT/PGlite/AI |
| `apps/web/README.md` | Route, cấu trúc, quy ước SSE/quyền/a11y; kết quả test; **web build đang fail**; phần chưa có |
| `packages/contracts/README.md` | Schema v2 đã được dùng thật; 5 payload; ACK/quarantine; quy tắc timestamp/quyền; chưa OpenAPI |
| `tools/docs/build.py` | Thêm 2 payload vào mục “Payload mẫu” của HTML |
| `tools/docs/check-examples.mjs` | Ánh xạ `event-ack-quarantined.v1.json` → `ingestAckSchema`, `insights.v1.json` → `insightsResponseSchema` |
| `tools/docs/README.md` | Cập nhật “năm payload” và schema kiểm |
| `packages/contracts/examples/event-ack-quarantined.v1.json` | Mẫu mới: `status=rejected`, `code=QUARANTINED`, `incidentId=null` |
| `packages/contracts/examples/insights.v1.json` | Mẫu mới: ngày có/không dữ liệu, `hasData=false`, không nội suy |
| `docs/html/index.html` | Sinh lại bằng `tools/docs/build.py`; **không sửa tay** |

## Lệnh kiểm và output thật

Môi trường: Windows, Node v24.22.2, pnpm 12.5.1, Python 3.12.10 + Markdown 3.7 trong `tools/docs/.venv` (không commit venv).

| Lệnh | Kết quả |
| --- | --- |
| `pnpm build:contracts` | pass (`tsc -p tsconfig.json`) |
| `node tools/docs/check-examples.mjs` | `Đã parse 5/5 payload mẫu bằng schema tương ứng.`; gồm ACK thường, ACK cách ly, confirmed, telemetry, insights |
| `python tools/docs/build.py` | `Validated 326 links and 240 unique IDs; 20 sections.` / `Wrote docs\html\index.html (437,528 bytes).` |
| `python tools/docs/build.py --check` | `Validated 326 links and 240 unique IDs; 20 sections.` / `Generated HTML matches current sources.` exit 0 |
| `rg` kiểm HTML | Có “Hiện trạng giao diện v2”, “Bằng chứng chạy ngày 15/11/2026”, “ACK sự kiện bị cách ly”, “Kết quả review và trạng thái xử lý”, “Năm payload tổng hợp”; không còn “Nền hợp đồng v2” |
| `git diff --check` | không có lỗi whitespace (chỉ cảnh báo LF→CRLF của Git trên Windows) |

**Số link/ID thay đổi:** trước khi sửa `--check` là 305 link / 227 ID / 20 section; sau khi thêm endpoint, mục và 2 payload là **326 link / 240 ID / 20 section**. Không có link nội bộ hoặc JSON mẫu nào fail.

## Kết quả test sản phẩm ghi trong tài liệu (không chạy lại trong bước commit tài liệu)

Các số dưới đây lấy từ lần chạy thật ngày 15/11/2026 trên worktree này và đã ghi ở `README.md`, `docs/08`, `docs/14`:

| Hạng mục | Kết quả |
| --- | --- |
| API | 20/20 suite, 205/205 test pass (115,3 s) |
| Web unit | 32/32 file, 176/176 test pass (12,6 s) |
| Simulator | 23/23 test pass |
| Typecheck toàn repo | pass |
| API randomized (`seed=1288443891`) | 204/205; `studio.spec.ts` T8 phụ thuộc audit của test khác |
| E2E | 6/7; `history.spec.ts:117` đếm 3 request `/measurements` thay vì 2 |
| Web production build | **fail**: `layout.css` có `}` thừa (~dòng 2127), lightningcss `Invalid empty selector` |
| Docs + payload | pass như bảng trên |

## Lỗi còn lại và việc chưa làm

- **Không có lỗi link/JSON tài liệu** sau `build.py --check` và `check-examples.mjs`.
- **Lỗi sản phẩm (không sửa trong task tài liệu):** web production build fail CSS; E2E 6/7; API randomized 204/205; MQTT P0-2 vẫn mở (chưa ingest event/ACK qua broker). Đã ghi rõ, không báo “tất cả xanh”.
- **Chưa có bằng chứng:** firmware ESP32, BOM, độ chính xác té ngã, thời lượng pin, PostgreSQL/MQTT broker thật, Web Push/email/SMS, xóa cứng/retention/backup, AI provider thật/RAG/planner, OpenAPI máy sinh, p95/NFR-07, khả dụng người cao tuổi, CI.
- **`tests/README.md`** vẫn còn số cũ (14 suite/100 test API; 20 file/73 test web) vì file này **không nằm trong danh sách được phép sửa** của task. HTML vẫn chứa các số cũ từ nguồn đó; cần một task tài liệu/test riêng cập nhật nếu muốn loại bỏ hoàn toàn.
- **`docs/reviews/01-thiet-ke-v0.1.md`** giữ câu “dự án chưa có ứng dụng…” như phạm vi lịch sử ngày 10/11; không sửa để tránh viết lại review cũ.
- **Chưa chạy lại** seed, MQTT exposure, PostgreSQL thật, AI provider thật, p95 hay kiểm khả dụng trong lượt này.
- **Chưa có review độc lập cuối cho toàn bộ v2**; các fix chỉ có test cục bộ, không đóng finding QA.

## Ghi chú cho reviewer

- File HTML được sinh từ Markdown/JSON, không sửa tay; nếu sửa nguồn phải chạy lại `build.py` và `--check`.
- Hai payload mới chỉ dùng dữ liệu tổng hợp, đã parse bằng schema; `check-examples.mjs` sẽ fail nếu thêm file mà quên khai báo.
- Bảng trạng thái dùng “Đã có / Đã có phần lớn / Một phần / Chưa làm”, không đồng nhất “có code” với “đã nghiệm thu”.
- Không có thay đổi code/test ứng dụng, schema hay migration trong commit tài liệu.
