# Handoff — v7-fix (đóng 2 P3 sau review W4)

- **Thời điểm:** 2026-11-18 02:35 (Asia/Ho_Chi_Minh)
- **Worker:** FIX (Orca dispatch `task_d17d63c3b12c`)
- **Provider/model thực tế:** `moxuna / deepseek-v4.1-flash`
- **Branch:** `Tung204/v7-fix` (không merge/push). Worktree `C:/Users/nguye/orca/workspaces/DATN/v7-fix`.
- **Nguồn yêu cầu:** `reports/qa/v7-w4-review.md` §5 P3-01, P3-02; spec
  `reports/orchestration/v7-specs/w4b-fix.md`.

## File đã sửa

| File | Thay đổi |
| --- | --- |
| `apps/web/src/features/alerts/AlertDetailPage.tsx` | Ack 2 bước: bấm “Tôi đang hỗ trợ” chỉ mở nhóm xác nhận; POST chỉ khi bấm “Có, tôi đang hỗ trợ”. Giữ `expectedVersion`/CAS, 409 + thông báo lỗi hiện có. Escape/Hủy đóng nhóm và trả focus về nút đầu. |
| `apps/web/src/features/alerts/AlertDetailPage.test.tsx` | 3 test mới cho luồng 2 bước; cập nhật 4 test cũ phải qua bước xác nhận (chi tiết dưới). |
| `apps/web/src/features/studio/StudioViewDetailPage.tsx` | View scope `subject`: render `SubjectContextLine scope="pinned"` trên H1 qua `PageHeader context`; scope global/account không render. |
| `apps/web/src/features/studio/StudioViewDetailPage.test.tsx` | 2 test mới: 1 dòng khi scope subject, 0 dòng khi global; tên lấy từ API. |
| `apps/web/src/features/studio/testFixtures.ts` | Mock handler nhận tùy chọn `subjects?: SubjectSummary[]` (mặc định `[SUBJECT]`) để test chứng minh tên không hard-code. |
| `apps/web/src/styles/alerts.css` | Thêm `.alert-detail__confirm*` cùng kiểu nhóm xác nhận của danh sách; không sửa token/shell/components. |
| `reports/qa/evidence/v7-fix/*.png` | 5 ảnh bằng chứng (liệt kê dưới). |
| `reports/handoffs/v7-fix.md` | File này. |

Không đổi API, contract, quyền, route, `components/*`, `styles/tokens|base|shell`.

## P3-01 — ack ở `/app/alerts/:id` hỏi lại trước POST

- Bấm **Tôi đang hỗ trợ** → nhóm `role="group" aria-label="Xác nhận hỗ trợ cảnh báo"` gồm câu
  **“Bạn đã liên hệ và đang hỗ trợ?”**, nút **“Có, tôi đang hỗ trợ”** và **Hủy**.
- Chỉ nút xác nhận gọi `POST /alerts/:id/acknowledge` với `{expectedVersion: detail.version}`.
- Mở nhóm thì focus vào nút xác nhận (để Escape dùng được ngay); **Hủy** hoặc **Escape** đóng nhóm,
  không gọi API, trả focus về nút **Tôi đang hỗ trợ**.
- 409 giữ nguyên `ConflictNotice` (“Cảnh báo đã thay đổi ở nơi khác” + **Tải lại cảnh báo**, không
  optimistic, giữ pill trạng thái cũ). Lỗi khác 409 giữ alert “Chưa gửi được xác nhận” + **Thử lại**.
- Nút **Thử lại** sau lỗi vẫn gọi lại mutation trực tiếp như hành vi cũ (đây là retry của một hành
  động đã được xác nhận, không phải ack một chạm).

## P3-02 — dòng nhận diện hồ sơ ở Studio subject-scope

- `/app/studio/:id` với `view.scope === 'subject'`: dòng **“Theo dõi: {tên}”** (+ chip “Người thân”
  nếu là caregiver) đặt trong `PageHeader context`, tức **trên H1**, dùng lại primitive
  `SubjectContextLine` với `scope="pinned"`; không có select đổi hồ sơ tại đây.
- Nguồn tên: `GET /workspace-views/:id` trả `scope` + `subjectId` (hợp đồng `ViewSummary` không có
  displayName), tên resolve từ `GET /subjects` đã dùng sẵn cho select preview. Không hard-code,
  không đổi contract; nếu chưa tải được danh sách hồ sơ thì chưa render dòng, không bịa tên.
- Scope `global`/`user`: không render dòng (đúng §3.3). Nhánh người chỉ xem bản công bố cũng dùng
  cùng logic nếu view là scope subject.
- Nhãn preview/data hiện có **“Dữ liệu mẫu”/“Dữ liệu hồ sơ · {tên}”** giữ nguyên.

## Test diff

Thêm mới (5 test):

- `AlertDetailPage.test.tsx` → `describe('AlertDetailPage — xác nhận hỗ trợ 2 bước')`:
  1. mở bước hỏi lại không gửi POST; xác nhận mới POST đúng body `{expectedVersion: 3}` (version của
     fixture `INCIDENT`) và hiện H2 “Đang có người hỗ trợ”;
  2. Hủy đóng nhóm, không POST, focus về nút đầu;
  3. Escape đóng nhóm, không POST, focus về nút đầu.
- `StudioViewDetailPage.test.tsx` → `describe('StudioViewDetailPage — dòng nhận diện hồ sơ')`:
  1. scope subject → đúng 1 `role=group` “Người được theo dõi”, text `Theo dõi: Bà Trần Thị An`
     (tên khác fixture mặc định, trả qua API mock), không combobox trong dòng, dòng đứng trước H1;
  2. scope global → 0 dòng, đã chờ danh sách hồ sơ tải xong trước khi kết luận.

Cập nhật test cũ (không nới assertion, chỉ thêm bước xác nhận đúng hành vi mới):

- 409: bấm “Tôi đang hỗ trợ” → `ackCalls` vẫn 0 → bấm “Có, tôi đang hỗ trợ” → 409. Giữ nguyên kiểm
  tiêu đề ConflictNotice, nút tải lại, `ackCalls === 1`, pill “Đang mở”.
- Lỗi 500, quyền caregiver đủ, và “liên hệ khẩn cấp lỗi không chặn ack”: thêm một click xác nhận sau
  click mở nhóm; các assertion cũ giữ nguyên.
- Thêm import `waitFor`; không đổi fixture cảnh báo/hành vi khác.

## Cổng đã chạy (kết quả thật)

| Lệnh | Exit | Kết quả |
| --- | --- | --- |
| `pnpm build:contracts` | 0 | contracts build xong (cần trước typecheck trong worktree mới) |
| `pnpm --filter @heart-iot/web typecheck` | **0** | `tsc -p tsconfig.json --noEmit` sạch |
| `pnpm --filter @heart-iot/web exec vitest run --no-file-parallelism --maxWorkers=1` | **0** | **38 file / 351 test pass** (trước thay đổi: 38/346; +5 test mới) |
| `pnpm --filter @heart-iot/web build` | **0** | Vite build xong, entry 272,31 kB (gzip 83,65 kB) |
| `pnpm --filter @heart-iot/web test:e2e` | **0** | **26/26 pass**, 5,1 s (chạy thêm ngoài cổng bắt buộc; spec không đổi) |

## Ảnh Chromium (Playwright 1.65.1, headless, DPR 1, locale `vi-VN`, TZ `Asia/Ho_Chi_Minh`)

Thư mục `reports/qa/evidence/v7-fix/`:

| Ảnh | Nội dung |
| --- | --- |
| `alerts-confirm-1280x900.png` | `/app/alerts/ffffffff-ffff-4fff-8fff-ffffffffffff` — nhóm xác nhận mở, chưa POST. |
| `alerts-confirm-390x844.png` | Cùng cảnh báo ở 390×844 — nhóm xác nhận trong viewport, chưa POST. |
| `alerts-acked-1280x900.png` | Sau xác nhận: pill “Đã xác nhận”, H2 “Đang có người hỗ trợ”, timeline ghi người xác nhận. |
| `studio-subject-1280x900.png` | `/app/studio/79e193a3-5eb5-4bdd-8014-c5b5d9fbbc2b` — “Theo dõi: Bà Trần Thị An” trên H1, không select. |
| `studio-subject-390x844.png` | Cùng view ở 390×844 — dòng “Theo dõi” vẫn hiện, H1 wrap, không tràn ngang. |

Số đo từ script trình duyệt (in ra stdout, không commit script):

- Trước khi bấm xác nhận: **0 POST** `/acknowledge` ở cả 1280 và 390.
- Sau xác nhận: **1 POST**, HTTP **200**, body `{"expectedVersion":2}` (version thật của cảnh báo seed).
- Text dòng Studio đọc từ DOM ở cả hai viewport: `Theo dõi: Bà Trần Thị An` (khớp `displayName` API).

## Môi trường chạy ảnh và sai lệch cổng

- Web: `http://127.0.0.1:4356` — Vite 8.3.8, `VITE_API_BASE_URL=http://127.0.0.1:3013/api/v1`.
- API: **cổng 3013**, không phải 3012 như task ghi: `netstat`/`Win32_Process` cho thấy **3012 đang bị
  API worktree `v7-c` chiếm** (PID 43492, `v7-c/apps/api/dist/src/main`). Không dừng/không sửa phiên
  khác; dùng 3013 với DB riêng trong worktree (`apps/api/.data/v7fix`, seed demo: 3 user, 2 hồ sơ,
  1 thiết bị, 1.681 telemetry, 3 incident, 2 việc, 2 outbox).
- Đăng nhập UI thật qua origin 4356 (owner `ba-an@demo.heart-iot.local`), cookie `an_session`;
  không dùng cookie/secret của worktree khác.
- Studio view dùng cho ảnh được tạo qua API trong DB riêng: `79e193a3-5eb5-4bdd-8014-c5b5d9fbbc2b`
  (key `theo-doi-ba-an-2`, scope `subject`, `subjectId=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa`).
  Alert seed: `ffffffff-ffff-4fff-8fff-ffffffffffff` (version 2, mở).
- Không commit DB PGlite, log, script chụp ảnh (`apps/web/.data/` đã nằm trong `.gitignore`),
  cookie/session hay secret.

## Phần chưa kiểm

- Firefox/WebKit và screen reader thật (NVDA/VoiceOver), axe toàn trang: chưa chạy; chỉ Chromium
  headless + đo DOM/ảnh.
- Chưa chụp ảnh view scope `global` (unit test đã kiểm 0 dòng; không thêm dữ liệu vào DB chỉ để chụp).
- Chưa kiểm 409 ack ở chi tiết bằng trình duyệt thật sau thay đổi (đã kiểm bằng unit test 409; ảnh
  trình duyệt chỉ cho luồng thành công). Review W4 đã kiểm 409 ở danh sách.
- Chưa kiểm trạng thái focus sau khi mutation lỗi (500/409) trong trình duyệt thật; unit test kiểm
  focus của Hủy/Escape trước POST.
- Không chạy test API (không sửa API); các phép kiểm còn lại của review W4 §8 (đổi hồ sơ A→B,
  publish 409 thật, permission matrix caregiver, CI) nằm ngoài scope việc này.
