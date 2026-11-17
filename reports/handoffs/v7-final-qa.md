# Handoff — QA chốt v7 (W4 còn lại)

**Người bàn giao:** Pi (worker QA độc lập).
**Provider/model thực tế:** `moxuna / deepseek-v4.1-flash` (`PI_PROVIDER`/`PI_MODEL`).
**Ngày:** 18/11/2026 (Asia/Ho_Chi_Minh).
**Branch:** `Tung204/v7-final-qa` · **HEAD khi bắt đầu:** `db2d47c`
(đã gồm merge `57ac34e` fix 2 P3; không merge/push).
**Commit QA:** `docs(qa): chốt v7 — 3 phép kiểm W4, 2 P3 và ma trận quyền`
(xem `git log -1` trên branch).
**Worktree:** `C:/Users/nguye/orca/workspaces/DATN/v7-final-qa`.

## Đã làm

- Chạy thật 3 phép còn thiếu:
  - Đổi hồ sơ A→B ở `/app/assistant`: thread/câu hỏi/câu trả lời/số liệu A biến mất;
    context + quyền B đúng; 0 POST ask sau khi đổi.
  - Studio publish với digest cũ: **409 `APPROVAL_STALE`** thật, 0 publication mới,
    UI báo “Bản đã thay đổi ở máy chủ” + Tải lại; 1280/390.
  - Ma trận quyền receive-only/measurement-only: 4 route × 2 viewport × baseline/403/empty/
    error/offline/stale (N/A nếu route không gọi API dữ liệu) = **70/70 ô an toàn**,
    không màn trắng, không lộ số đo/cảnh báo ngoài quyền.
- Xác nhận 2 P3 W4 đã đóng trên browser:
  - `/app/alerts/:id`: 0 POST trước xác nhận, 1 POST `expectedVersion=2` sau xác nhận (200);
    409 `CONFLICT` khi version lệch, UI tải lại đúng; 1280/390.
  - `/app/studio/:id` subject-scope: đúng 1 dòng “Theo dõi: Bà Trần Thị An”, 0 select; 1280/390.
- Cổng thật: typecheck **0**; vitest **38 file / 351 test pass** (109,34 s);
  build **0** (entry 272,31 kB, gzip 83,65 kB); E2E **26/26** (5,3 s). Không sửa `apps/`,
  `packages/`, `tools/`, test sản phẩm.
- Báo cáo: `reports/qa/v7-final-qa.md`; ảnh + JSON: `reports/qa/evidence/v7-final/`;
  script: `reports/qa/scripts/v7-final-*.mjs`.

## Cổng/môi trường thật

| Thành phần | Giá trị |
| --- | --- |
| Web | `http://127.0.0.1:4361` (Vite 8.3.8) |
| API | `http://127.0.0.1:3013` (Nest, `WEB_ORIGIN=http://127.0.0.1:4361`) |
| DB | PGlite `apps/api/.data/final`, seed demo (3 user, 2 hồ sơ, 1 thiết bị, 1.681 telemetry, 3 incident, 2 việc, 2 outbox) |
| Web env | `VITE_API_BASE_URL=http://127.0.0.1:3013/api/v1` |
| Browser | Playwright 1.65.1 / Chromium headless, DPR 1, `vi-VN`, `Asia/Ho_Chi_Minh`, 1280×900 và 390×844 |
| Node/pnpm | Node 24.22.2 · pnpm 12.5.1 |

Cổng 3013/4361 được chọn vì 3010/3011/4360 đang bận bởi phiên/worktree khác; không dùng,
không dừng, không sửa API/DB của phiên khác. Không sửa source API/contract.

**Dữ liệu thêm trong `.data/final`:** 2 tài khoản QA (`qa-receive-only@…`,
`qa-measurement-only@…`), 2 care link với quyền receive-only/measurement-only, 1 Studio view
`68c03421-e519-43e6-8b97-74a86bcd6963` (scope subject Bà An), incident mới qua
`POST /ingest/events` và ack. `sharedFrom` của 2 link mới là lúc setup (~02:52 18/11), nên
daily-summary/measurements của measurement-only rỗng trong cửa sổ 24h — đúng cửa sổ chia sẻ,
không phải lỗi. DB chỉ trong worktree, không commit.

## Kết quả và finding

- **Không P1/P2.**
- 2 P3 W4: **đóng**.
- 3 P3 mới tái hiện được, ghi trong báo cáo §7:
  - **P3-03:** caregiver không `canReceiveAlerts` vẫn mở SSE → `GET /subjects/:id/events` 403
    và banner “Mất cập nhật trực tiếp — đang thử lại” trên cả 4 route (36/36 ô measurement-only).
    Nguồn: `AppShell.tsx:499` gọi `useSubjectEvents` không kiểm quyền; server yêu cầu
    `receive_alerts` (`realtime.service.ts:80`).
  - **P3-04:** `/app/overview` gọi `/alerts` dù thiếu `canReceiveAlerts` → 403 và hiện
    “Không tải được cảnh báo đang mở… Kiểm tra kết nối” thay vì trạng thái quyền.
    Nguồn: `DashboardPage.tsx:124-131` thiếu điều kiện `canReceiveAlerts`.
  - **P3-05:** receive-only thấy thiết bị “Trực tuyến” nhưng “chưa từng kết nối”/pin “chưa có
    thông tin” do server ẩn `lastSeenAt` trước `sharedFrom` nhưng UI dùng copy “chưa từng kết nối”.
- **Kết luận:** v7 **đóng được** theo tiêu chí W2/W3 (không P1/P2, cổng xanh, 5/5 điều kiện
  W4 có bằng chứng); **không** tuyên bố “không còn lỗi”. Nếu yêu cầu 0 P3 trước nghiệm thu thì
  chưa đóng — cần sửa ít nhất P3-04, nên sửa P3-03 trước demo.

## Chưa kiểm / miễn trừ

- Firefox/WebKit/Safari; screen reader thật (NVDA/VoiceOver); axe toàn trang; CI (repo chưa có).
- 200% zoom thật (chỉ emulate CSS px; kế thừa review W4).
- AI provider thật (chưa cấu hình `AI_*`; câu trả lời là fallback template).
- Revoke quyền giữa phiên/SSE `revoked`; hai tab browser thật (409 publish dùng API “tab khác”,
  409 ack chặn SSE để giữ version cũ); race hai tab có SSE.
- Permission matrix chỉ hồ sơ Bà An; không kiểm hồ sơ Bình/không hồ sơ/archived/revoked,
  429/5xx thật (403/500/offline là inject bằng `page.route`).
- Studio publish thành công/rollback trên bản này (chỉ kiểm nhánh 409 theo yêu cầu).
- Dữ liệu đo thật/production, MQTT event, Web Push, đa trình duyệt.

## Lệnh chạy lại

```bash
pnpm build:contracts
cd apps/api
PGLITE_DATA_DIR=.data/final PORT=3013 WEB_ORIGIN=http://127.0.0.1:4361 pnpm seed
PGLITE_DATA_DIR=.data/final PORT=3013 WEB_ORIGIN=http://127.0.0.1:4361 pnpm exec nest start
cd apps/web
VITE_API_BASE_URL=http://127.0.0.1:3013/api/v1 pnpm exec vite --port 4361 --host 127.0.0.1
node reports/qa/scripts/v7-final-setup.mjs
node reports/qa/scripts/v7-final-assistant-switch.mjs
node reports/qa/scripts/v7-final-studio-409.mjs
node reports/qa/scripts/v7-final-permission-matrix.mjs
node reports/qa/scripts/v7-final-p3.mjs
node reports/qa/scripts/v7-final-sse-permission.mjs
```

Cổng: `pnpm --filter @heart-iot/web typecheck`;
`pnpm --filter @heart-iot/web exec vitest run --no-file-parallelism --maxWorkers=1`;
`pnpm --filter @heart-iot/web build`; `pnpm --filter @heart-iot/web test:e2e`.

**Bàn giao:** commit trên `Tung204/v7-final-qa` (không merge/push). Không commit `.data/`,
cookie/session hay dữ liệu người thật.
