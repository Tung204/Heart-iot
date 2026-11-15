# Handoff — sửa tài liệu khớp HEAD (v2)

- **Task:** `task_03446931f03b`, dispatch `ctx_4b64e2112d82`; worker `fix-docs-truth`.
- **Nhánh/worktree:** `fix-docs-truth` tại `C:\Users\nguye\orca\workspaces\DATN\fix-docs-truth`.
- **Nền:** HEAD `c796f2e` (chứa `8434d66` — code-split/error boundary/alert 403-404 — và `0d669a1` — nền schema v2).
- **Ngày:** 15/11/2026.
- **Trạng thái:** sửa xong P1-1…P1-5 và 7/8 P2 trong phạm vi tài liệu; P2-4 phần comment trong code/test chưa làm (ngoài phạm vi được phép).
- **Commit:** `aafebd3` chứa toàn bộ thay đổi nội dung; commit ngay sau đó chỉ sửa dòng hash này (xem `git log --oneline -3`).

## Phạm vi và file đã sửa

| File | Thay đổi |
| --- | --- |
| `docs/html/index.html` | Sinh lại bằng `tools/docs/build.py`; không sửa tay (P1-1) |
| `README.md` | Bỏ "chưa code-split/bundle >500 kB"; thêm lệnh `docs --check` + `check-examples`; module list có `policy`, `health`; E2E chỉ cần web server (P1-2, P2-4) |
| `docs/14-ke-hoach-trien-khai-phan-mem.md` | Trạng thái v1.1 (code-split, `AppErrorBoundary`, alert 403/404); nền schema v2 chưa giao; cây module thêm `care`/`maintenance`/`policy`, bỏ `health/ready`; §6 thêm `health`, `claim-code`, `workspace-views/:id/data`; outbox unique có `kind`/`dedupe_key`; đánh số lại §10→11, §11→12; bỏ "code-split" khỏi việc chưa làm (P1-2, P2-1, P2-2, P2-7) |
| `docs/04-du-lieu-va-giao-tiep.md` | API v1 đã chạy + inventory theo controller; `exports`/`deletion-requests` ghi rõ chưa triển khai; ACK camelCase đúng `ingestAckSchema`; lỗi `requestId`; outbox có `kind`; quy ước 403/404 cảnh báo (P1-3, P1-4, P2-3, P2-7) |
| `docs/12-nguyen-tac-phat-trien-va-bang-chung.md` | Thay câu "chỉ có công cụ sinh tài liệu" bằng hiện trạng contracts/API/web/test; nêu rõ chưa có CI/OpenAPI/tool registry (P1-5) |
| `docs/08-kiem-thu-va-danh-gia.md` | Ma trận T-01…T-14 là mục tiêu, một phần đã có test ở lớp sở hữu hành vi; không còn câu "chưa có test executable" (P1-5) |
| `tests/README.md` | Nêu test hiện có ở api/web/e2e/simulator; thư mục này trống cho integration/E2E; thêm cách kiểm docs/payload (P1-5) |
| `packages/contracts/README.md` | Đã có schema 15 miền + lõi; nền v2 (`insights`/`contacts`/auth/tasks) chưa giao; ACK HTTP camelCase, MQTT chưa publish ACK; lệnh kiểm mẫu (P1-5, P1-3) |
| `packages/contracts/examples/fall-confirmed.v1.json` | Theo `incidentEnvelopeSchema`: thêm `incident_type`, `evidence.wear_location/motion_quality/heart_rate_quality/heart_rate_bpm`, bỏ khóa chỉ-design (P1-3) |
| `packages/contracts/examples/event-ack.v1.json` | CamelCase đúng `ingestAckSchema`, `incidentId` là UUID server (P1-3) |
| `tools/docs/check-examples.mjs` | Script mới: parse **mọi** `packages/contracts/examples/*.json` bằng schema tương ứng; file chưa khai báo schema → fail (P1-3) |
| `tools/docs/README.md` | Ghi rõ `--check` không kiểm schema; thêm lệnh `check-examples` (P1-3) |
| `apps/web/README.md` | 20 file/73 test; E2E 4/4 chỉ cần web server (2 test mock `/api/v1`); số chunk lần build 15/11 (P2-4) |
| `apps/api/package.json` | Bỏ `"@nestjs/testing": null` khỏi `dependencies`, giữ devDependency `11.2.10` (P2-5) |
| `apps/api/README.md` | `device-auth` nằm trong `devices`, thêm `health` vào danh sách module |
| `docs/06-trai-nghiem-va-man-hinh.md` | Ghi rõ ảnh kiểm UI nằm ngoài repo (`C:\tmp\ui-final`), repo chưa có artifact (P2-8) |
| `reports/orchestration/lessons.md` | File mới, sửa link hỏng; tổng hợp bài học từ journal/worklog, không phải checklist tiến độ (P2-6) |

Không sửa code ứng dụng, schema, test ứng dụng, lịch sử commit. Không nhận tính năng v2 nào là đã giao.

## Kết quả kiểm — output thật

Môi trường: Windows + Git Bash; Node v24.22.2; pnpm 12.5.1; Python 3.12.10 với `Markdown==3.7`
trong venv tạm `/tmp/docsvenv` (ngoài repo, không tạo `.venv` trong repo).

| Lệnh | Kết quả |
| --- | --- |
| `pnpm install --prefer-offline --frozen-lockfile` | `Lockfile is up to date, resolution step is skipped` / `Done in 49ms`; `pnpm-lock.yaml` không đổi |
| `pnpm build:contracts` | pass (`tsc -p tsconfig.json`) |
| `node tools/docs/check-examples.mjs` | `✓ event-ack…`, `✓ fall-confirmed…`, `✓ telemetry…`; `Đã parse 3/3 payload mẫu bằng schema tương ứng.` exit 0 |
| Kiểm âm cho script | thêm tạm `zz-temp.json` → `✗ zz-temp.json: chưa khai báo schema…`, exit 1; đã xoá file tạm |
| `python tools/docs/build.py` | `Validated 299 links and 219 unique IDs; 20 sections.` / `Wrote docs\html\index.html (350,801 bytes).` |
| `python tools/docs/build.py --check` | `Validated 299 links and 219 unique IDs; 20 sections.` / `Generated HTML matches current sources.` exit **0** |
| `cd apps/api && pnpm test` | `Test Suites: 14 passed, 14 total` / `Tests: 100 passed, 100 total` (94,1 s) |
| `cd apps/web && pnpm test --run` | `Test Files 20 passed (20)` / `Tests 73 passed (73)` |
| `cd apps/web && pnpm build` | `✓ built in 307ms`; `index-DHpWuntm.js 264.75 kB`, `ErrorState-… 230.68 kB`; **không** có cảnh báo chunk >500 kB |

Trước khi sửa, `--check` trả `HTML is missing or stale. Run tools/docs/build.py.` + `Validated 299 links and
219 unique IDs; 20 sections.` exit 1 (khớp P1-1), và HTML còn câu "Hiện chưa có ứng dụng, migration hay
endpoint đang chạy"; sau khi sinh lại, chuỗi này không còn (`grep -c` → 0).

**Chưa chạy:** `tools/simulator` (23 test) và Playwright E2E (4/4) trong lượt này — spec không yêu cầu chạy app;
số của chúng lấy từ review v2 `reports/qa/v2-docs-consistency.md` tại `8434d66`. API/web đã chạy lại tại HEAD
hiện tại và khớp số cũ.

## P2 chưa làm

- **P2-4 (phần code):** comment trong `apps/web/playwright.config.ts:4`, `apps/web/e2e/smoke.spec.ts:3` vẫn ghi
  "wave 1 chưa chạy"; `e2e/alerts.spec.ts:3` đã đúng phạm vi mock. Đây là file code/test, ngoài phạm vi được
  phép sửa của task này — cần một fix worker code hoặc lead sửa trực tiếp. README/phạm vi E2E đã đúng.
- **P2-8 (phần artifact):** chỉ ghi rõ bằng chứng ảnh nằm ngoài repo; **chưa** copy 4–6 ảnh vào
  `reports/qa/artifacts/` vì task giới hạn file được sửa và artifact ảnh cần kiểm nguồn/quyền.

## Ghi chú cho reviewer

- Bảng số mục docs/14: §1…§10 giữ nguyên, §11 = trạng thái triển khai, §12 = kết quả review. Mọi tham chiếu
  "xem mục 10" đã đổi thành "mục 11"; không còn `## 10.` trùng.
- `docs/reviews/01-thiet-ke-v0.1.md` vẫn mở đầu bằng "Dự án chưa có ứng dụng…" như **phạm vi review tại thời
  điểm 10/11**; không sửa để giữ lịch sử. Nếu muốn tránh hiểu nhầm khi đọc HTML, nên thêm nhãn "bản lịch sử"
  ở chương review (chưa làm).
- Các báo cáo cũ (`reports/qa/review-*`, handoff wave, journal) giữ nguyên số liệu lúc viết; không viết lại
  lịch sử.
- Đề xuất bổ sung cổng (chưa làm vì ngoài phạm vi file): thêm `docs:check` chạy cả `build.py --check` và
  `check-examples.mjs` vào script root/CI khi có CI.
