# Handoff — v7-fix2 (3 P3 quyền từ QA chốt v7)

- **Thời điểm:** 2026-11-18 03:35 (Asia/Ho_Chi_Minh)
- **Worker:** FIX (Orca dispatch `task_e9e55c7cbf5b`)
- **Provider/model thực tế:** `moxuna / deepseek-v4.1-flash` (`PI_PROVIDER`/`PI_MODEL`, không phải
  model ghi trong prompt).
- **Branch:** `Tung204/v7-fix2` (không merge/push). Worktree
  `C:/Users/nguye/orca/workspaces/DATN/v7-fix2`.
- **Nguồn yêu cầu:** `reports/qa/v7-final-qa.md` §7 — P3-03, P3-04, P3-05.

## File đã sửa

| File | Thay đổi |
| --- | --- |
| `apps/web/src/app/AppShell.tsx` | Tính `canReceiveAlerts` (owner hoặc `permissions.canReceiveAlerts`) **trước** `useSubjectEvents`; chỉ truyền `activeSubject.id` khi có quyền, ngược lại `null`. Dùng chung cờ này cho badge cảnh báo (bỏ biến trùng `canSeeAlerts`). Cập nhật comment đầu `AppShell`. |
| `apps/web/src/app/AppShell.test.tsx` | +2 test: caregiver thiếu `canReceiveAlerts` → 0 stream `/events`, không banner; caregiver có quyền → vẫn mở đúng stream của hồ sơ. |
| `apps/web/src/features/dashboard/DashboardPage.tsx` | P3-04: thêm `canReceiveAlerts`, `enabled: Boolean(subjectId) && canReceiveAlerts` cho `openAlerts`; khi thiếu quyền chỉ render câu nghiệp vụ, không loading/error/Thử lại/link “Xem tất cả cảnh báo”. P3-05: `lastSeenAt=null` + `healthDataVisible=false` → “mốc kết nối ẩn theo quyền chia sẻ”; còn lại giữ “chưa từng kết nối”. |
| `apps/web/src/features/dashboard/DashboardPage.test.tsx` | +4 test: measurement-only 0 request `/alerts` + câu quyền; owner query chạy bình thường; device ẩn mốc kết nối theo quyền; device bình thường giữ copy cũ. |
| `reports/qa/scripts/v7-fix2-evidence.mjs` | Script tạo 2 tài khoản caregiver bằng API thật + đo request/ảnh trên Chromium (chạy lại được). |
| `reports/qa/evidence/v7-fix2/*.png`, `summary.json` | 8 ảnh + số đo request/nội dung. |
| `reports/handoffs/v7-fix2.md` | File này. |

Không đổi API, contract, quyền, route, `components/*`, `styles/tokens|base|shell`. Không sửa
`docs`: `docs/06` §“Quyền là trạng thái” đã nêu đúng nguyên tắc chung; dòng banner SSE vẫn đúng
(banner chỉ xuất hiện khi stream được mở và rớt). Vì vậy không sinh lại `docs/html`.

## P3-03 — không mở SSE khi hồ sơ không có quyền nhận cảnh báo

- `AppShell` tính một lần:
  `canReceiveAlerts = activeSubject && !adminOnly && (role === 'owner' || permissions.canReceiveAlerts)`.
- Chỉ khi `true` mới truyền id vào `useSubjectEvents`; ngược lại truyền `null` → hook không tạo
  `EventSource`, `retryAttempt` luôn 0 nên **không có banner “Mất cập nhật trực tiếp”**.
- Badge cảnh báo trên nav dùng cùng cờ (trước đây đã có điều kiện tương đương; nay một nguồn).
- Hệ quả cần biết: hồ sơ không có `canReceiveAlerts` không mở SSE nên banner thu hồi quyền tức
  thời qua SSE không xuất hiện; quyền vẫn fail-closed theo API (luồng thu hồi giữa phiên không
  kiểm trong lượt này — xem “Chưa kiểm”).

## P3-04 — `/app/overview` không gọi `/alerts` khi thiếu quyền

- Vùng “Cảnh báo đang mở”: thiếu `canReceiveAlerts` → hiện đúng câu
  **“Chủ hồ sơ không chia sẻ cảnh báo với bạn.”**; **không** gọi API, **không** nút Thử lại,
  **không** link “Xem tất cả cảnh báo”, **không** loading/error giả.
- Các vùng số đo/thiết bị giữ nguyên hành vi (`canViewMeasurements` độc lập).

## P3-05 — copy kết nối khi mốc bị ẩn theo quyền

- `device.lastSeenAt === null`:
  - `device.healthDataVisible === false` → **“mốc kết nối ẩn theo quyền chia sẻ”**;
  - còn lại → giữ **“chưa từng kết nối”**.
- Không đổi API/contract, không đổi pill freshness (`FRESHNESS_LABELS`/tones giữ nguyên).

## Test diff

Thêm mới 6 test (351 → **357**):

- `AppShell.test.tsx` → `describe('AppShell — SSE theo quyền nhận cảnh báo')`:
  1. caregiver `canReceiveAlerts=false`: chờ hồ sơ được chọn → `FakeEventSource.instances` rỗng,
     không request `/events`, không banner “Mất cập nhật trực tiếp”;
  2. caregiver `canReceiveAlerts=true`: stream mở đúng 1 lần với URL
     `/subjects/<id>/events`.
- `DashboardPage.test.tsx` → `describe('DashboardPage — thiếu quyền nhận cảnh báo')`:
  1. measurement-only: 0 request chứa `/alerts` (cả shell lẫn trang), có câu quyền, trong vùng
     cảnh báo không có nút “Thử lại”/link “Xem tất cả cảnh báo”/lỗi “Không tải được cảnh báo…”,
     số đo vẫn hiện (`73 bpm`);
  2. owner: danh sách cảnh báo và link “Xem tất cả cảnh báo” vẫn chạy như cũ.
- `DashboardPage.test.tsx` → `describe('DashboardPage — mốc kết nối ẩn theo quyền chia sẻ')`:
  1. `healthDataVisible=false`, `lastSeenAt=null`, `freshness='live'` → copy ẩn theo quyền,
     pill “Trực tuyến”, **không** có “chưa từng kết nối”;
  2. `healthDataVisible=true`, `lastSeenAt=null` → giữ “chưa từng kết nối”.

## Cổng đã chạy — số thật

| Lệnh | Exit | Kết quả thật |
| --- | --- | --- |
| `pnpm --filter @heart-iot/contracts build` | 0 | Cần chạy trước vì worktree mới chưa có `packages/contracts/dist` (nếu thiếu, typecheck báo `TS2307` cho `@heart-iot/contracts/*` — không phải lỗi của thay đổi). |
| `pnpm --filter @heart-iot/web typecheck` | **0** | `tsc -p tsconfig.json --noEmit` sạch. |
| `pnpm --filter @heart-iot/web exec vitest run --no-file-parallelism --maxWorkers=1` | **0** | **38 file / 357 test pass**, 107,21 s. |
| `pnpm --filter @heart-iot/web build` | **0** | Vite 8.3.8; entry `index-BCZdTA95.js` 272,32 kB (gzip 83,65 kB), built 187 ms. |
| `pnpm --filter @heart-iot/web test:e2e` | **0** | **26/26 pass**, 6,0 s, Chromium. |

## Bằng chứng Chromium 4362 (API 3014 + PGlite riêng)

| Thành phần | Giá trị thực |
| --- | --- |
| Web | `http://127.0.0.1:4362` — Vite, `VITE_API_BASE_URL=http://127.0.0.1:3014/api/v1` |
| API | `http://127.0.0.1:3014/api/v1` — Nest, `WEB_ORIGIN=http://127.0.0.1:4362` |
| DB | PGlite `apps/api/.data/fix2` (seed demo, **không commit**; đã bị `.gitignore`) |
| Browser | Playwright 1.65.1 / Chromium headless, DPR 1, `vi-VN`, `Asia/Ho_Chi_Minh`, 1280×900 và 390×844 |
| Tài khoản | `fix2-measurement-only@demo.heart-iot.local` (`canReceiveAlerts=false`, `canViewMeasurements=true`), `fix2-receive-only@demo.heart-iot.local` (`canReceiveAlerts=true`, `canViewMeasurements=false`), tạo qua API thật (register + lời mời + accept), mật khẩu `qa-fix2-2026` |

`node reports/qa/scripts/v7-fix2-evidence.mjs` — kết quả đo (request API thật):

| Route | Viewport | Tài khoản | `/events` | `/alerts` | Banner SSE | Câu quyền cảnh báo | Thử lại trong vùng cảnh báo | Link cảnh báo |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `/app` | 1280×900 | measurement-only | **0** | **0** | không | (trang Hôm nay có câu quyền riêng) | 0 | 0 |
| `/app` | 390×844 | measurement-only | **0** | **0** | không | như trên | 0 | 0 |
| `/app/overview` | 1280×900 | measurement-only | **0** | **0** | không | **có** | **0** | **0** |
| `/app/overview` | 390×844 | measurement-only | **0** | **0** | không | **có** | **0** | **0** |
| `/app` | 1280×900 | receive-only | 1 | 2 | không | — | 0 | 0 |
| `/app` | 390×844 | receive-only | 1 | 2 | không | — | 0 | 0 |
| `/app/overview` | 1280×900 | receive-only | 1 | 2 | không | — | 0 | 2 (item + “Xem tất cả”) |
| `/app/overview` | 390×844 | receive-only | 1 | 2 | không | — | 0 | 2 |

- Receive-only `/app/overview`: pill **“Trực tuyến”**, dòng Kết nối
  **“mốc kết nối ẩn theo quyền chia sẻ”**, không còn “chưa từng kết nối”.
- `consoleErrors` = 0 ở cả 8 lần đo. Các `net::ERR_ABORTED` trong `summary.json` là request bị
  huỷ khi React StrictMode huỷ effect lần mount đầu / khi đóng page, không phải lỗi API
  (không có response 4xx/5xx cho `/alerts`, `/events` ở measurement-only vì không hề gọi).

Ảnh trong `reports/qa/evidence/v7-fix2/`:

- `today-1280x900-measurement-only.png`, `today-390x844-measurement-only.png`
- `overview-1280x900-measurement-only.png`, `overview-390x844-measurement-only.png`
- `overview-1280x900-receive-only.png`, `overview-390x844-receive-only.png`
- (thêm) `today-1280x900-receive-only.png`, `today-390x844-receive-only.png`
- `summary.json` — request từng route, text vùng cảnh báo/thiết bị, cờ banner.

## Chưa kiểm / miễn trừ

- Firefox/WebKit/Safari; screen reader thật (NVDA/VoiceOver); axe; CI (repo chưa có).
- Thu hồi quyền giữa phiên khi SSE **không** mở (hệ quả P3-03): chưa kiểm banner/purge tức thời;
  luồng quyền vẫn fail-closed theo API.
- 409/403/offline inject của ma trận quyền v7 không chạy lại; lượt này chỉ đo baseline thật cho
  3 P3.
- AI provider thật (không liên quan 3 P3); dữ liệu đo thật/MQTT/Web Push.
- Không sửa docs/HTML nên không chạy `tools/docs/build.py --check`.

## Lệnh chạy lại

```bash
pnpm --filter @heart-iot/contracts build
pnpm --filter @heart-iot/web typecheck
pnpm --filter @heart-iot/web exec vitest run --no-file-parallelism --maxWorkers=1
pnpm --filter @heart-iot/web build
pnpm --filter @heart-iot/web test:e2e

# Bằng chứng (2 terminal):
cd apps/api
PGLITE_DATA_DIR=.data/fix2 PORT=3014 WEB_ORIGIN=http://127.0.0.1:4362 pnpm seed   # lần đầu
PGLITE_DATA_DIR=.data/fix2 PORT=3014 WEB_ORIGIN=http://127.0.0.1:4362 pnpm exec nest start
cd apps/web
VITE_API_BASE_URL=http://127.0.0.1:3014/api/v1 pnpm exec vite --port 4362 --host 127.0.0.1
node reports/qa/scripts/v7-fix2-evidence.mjs
```
