# Dry run CI cục bộ — bằng chứng

**Ngày:** 22/11/2026; cập nhật 23/11/2026  
**Nhánh:** `v10-backend` (lúc dry run chưa push)  
**Phạm vi:** chạy lại các lệnh trong `.github/workflows/ci.yml` trên Windows; đây là dry run cục bộ, không phải lần chạy GitHub Actions.

> **Cập nhật 23/11/2026:** nhánh đã push và CI GitHub đã chạy thật, pass run [45207319254](https://github.com/Tung204/Heart-iot/actions/runs/45207319254) với ba job `check`, `PostgreSQL smoke` và `Browser E2E`. E2E **78/78** (26 test × Chromium/Firefox/WebKit) cũng đã chạy cục bộ. Các giới hạn dưới đây là của lần dry run cục bộ, không phải trạng thái hiện tại.

## Kết quả

| Lệnh | Kết quả |
| --- | --- |
| `pnpm test` | pass; contracts **10**, API **35 suite/325 test**, web **44 file/390 test**, simulator **23** |
| `pnpm build` | pass contracts, API `nest build`, web Vite, simulator |
| `pnpm typecheck` | pass toàn monorepo |
| `pnpm openapi:check` | pass; 79 path/99 operation/105 schema |
| `tools/docs/.venv/Scripts/python.exe tools/docs/build.py --check` | pass; 374 liên kết/296 ID/22 mục |
| `node tools/docs/check-examples.mjs` | 5/5 payload |
| `node infra/check-mqtt-exposure.mjs` | 16/16 (kiểm tĩnh) |
| Parse YAML workflow | pass (PyYAML 6.0.3) |

## Phát hiện và sửa

- Lần chạy đầu `pnpm test` làm web fail **3 test** do timeout khi Vitest chạy nhiều file song song:
  - `router.test.tsx` — không thấy heading “Sức khỏe”;
  - `SharePage.test.tsx` — không thấy nút “Mời người thân”;
  - `SubjectSwitcher.test.tsx` — không thấy heading “Hôm nay”.
- Chạy lại web tuần tự `vitest run --no-file-parallelism --maxWorkers=1` → **390/390 pass**.
- Đã đổi script `test` của `frontend/package.json` sang chế độ tuần tự để `pnpm test` và CI ổn định, không tăng timeout hoặc bỏ test.
- Đây là flakiness do tải song song, không phải lỗi nghiệp vụ; các assertion vẫn giữ nguyên.

## Giới hạn

- Đây là **dry run cục bộ trên Windows**; bằng chứng GitHub Actions thật nằm ở run 45204842736.
- Lần dry run này không chạy `pnpm install --frozen-lockfile`; lockfile không đổi.
- Lần dry run này không chạy Playwright E2E. Sau đó đã chạy E2E **78/78** ngày 23/11/2026 (Chromium/Firefox/WebKit) và thêm job CI `Browser E2E` (pass run 45207319254).
- Lần dry run này không chạy PostgreSQL/MQTT thật, Web Push thật hay AI provider thật. CI sau đó đã thêm job PostgreSQL smoke; MQTT/Web Push/AI thật vẫn chưa kiểm.

## Nguồn

- `.github/workflows/ci.yml`
- `frontend/package.json`
- Log cục bộ: `pnpm test`, `pnpm build`, `pnpm typecheck`, `openapi:check`, docs `--check`

## Browser E2E đa trình duyệt (23/11/2026)

Cùng 26 test, chạy trên ba project Playwright:

| Trình duyệt | Kết quả cục bộ | Kết quả CI |
| --- | --- | --- |
| Chromium | 26/26 | 26/26 |
| Firefox | 26/26 | 26/26 |
| WebKit | 26/26 | 26/26 |
| **Tổng** | **78/78**, 35,6 s | **78/78**, 52,9 s |

- CI run `45207319254`: job `Browser E2E` pass; `check` 4m54s, `PostgreSQL smoke` 41s.
- Cấu hình: `frontend/playwright.config.ts` có ba project; CI cài cả ba browser.
- **Cảnh báo chưa sửa:** Firefox/dev server ghi `Cannot update a component (AppShell) while rendering a different component (NavIcon)` — lỗi React trong mã UI hiện có, không làm fail test; cần sửa khi mở lại lane UI và thêm kiểm console sạch.
- Không chạy mobile Safari/Android thật, không kiểm accessibility tree hay axe.

