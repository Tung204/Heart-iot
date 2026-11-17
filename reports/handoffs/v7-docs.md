# Handoff — v7 W3: cập nhật tài liệu theo giao diện và repo mới

- **Task**: `task_958dd914614d` · **Dispatch**: `ctx_8fdcc8c355f3`
- **Worker terminal**: `term_bac75913-fe90-4f3a-8395-229e9d5c961e`
- **Worktree**: `C:/Users/nguye/orca/workspaces/DATN/v7-docs` — nhánh `Tung204/v7-docs`
- **Base**: `dcd11af` (`docs(orchestration): spec cập nhật tài liệu v7`)
- **Provider / model thực tế**: `moxuna` / `deepseek-v4.1-flash` (`PI_REASONING_LEVEL=max`)
- **Ngày làm và đo**: 18/11/2026, Asia/Ho_Chi_Minh
- **Phạm vi**: chỉ tài liệu + `docs/html/index.html` sinh lại bằng script. Không sửa `apps/`, `packages/`, `tools/`, `reports/` (ngoài file handoff này), không merge, không push.

## 1. File đã đổi

| File | Thay đổi |
| --- | --- |
| `docs/06-trai-nghiem-va-man-hinh.md` | Viết lại theo giao diện v7: nguyên tắc trình bày, khung ứng dụng (rail/topbar/thanh dưới, dòng ngữ cảnh, menu tài khoản, banner, badge), bảng route đầy đủ, mỗi màn một mục đích (công khai/auth/invite/404, Hôm nay, Cảnh báo + hộp thông báo, chi tiết cảnh báo, Sức khỏe, Lịch sử đo, Người thân, Chia sẻ và liên hệ, Thiết bị, Công việc, Tài khoản, Quản trị 5 mục, Studio, 404 trong khung), nơi hiển thị dữ liệu mô phỏng, trạng thái phải thiết kế, bằng chứng ảnh trong repo, lịch sử v2–v4 rút gọn |
| `docs/14-ke-hoach-trien-khai-phan-mem.md` | Thêm lát cắt v7 (phạm vi theo lane, 9 hành vi chính + bằng chứng, số tự chạy, việc còn mở); sửa câu mô tả Web ở §11 (`/app` là Hôm nay, trợ lý nằm trong trang); ghi rõ mục “Thêm” của v4 **đã bị bỏ ở v7**; cập nhật dòng “tái kiểm độc lập” |
| `docs/08-kiem-thu-va-danh-gia.md` | Thêm mục “Bằng chứng chạy ngày 18/11/2026 (giao diện v7)” với số tự chạy; hạ bảng 15/11/2026 xuống mục lịch sử, không xoá |
| `README.md` | Trạng thái v7 (bỏ “v4”), nav 4 mục Hôm nay/Cảnh báo/Sức khỏe/Người thân, hộp thông báo + badge cảnh báo đang mở, bảng kiểm thử 18/11/2026, giới hạn kiểm thử/giao diện cập nhật |
| `docs/README.md` | Trạng thái v7 và số test 18/11/2026 |
| `docs/02-yeu-cau-va-pham-vi.md` | Dòng FR-07: badge là **cảnh báo đang mở** + hộp thông báo toàn tài khoản (trước đó ghi “badge chưa đọc”) |
| `docs/04-du-lieu-va-giao-tiep.md` | Dòng Thông báo: nêu `/app/alerts?view=notifications` và nói rõ badge nav đếm cảnh báo đang mở, không phải số chưa đọc |
| `docs/html/index.html` | Sinh lại bằng `tools/docs/build.py`, không sửa tay |
| `reports/handoffs/v7-docs.md` | File này |

Không còn chuỗi “An Nhiên”/`annhien` trong `docs/`, `README.md` hay `tools/docs` (đã grep lại sau khi sửa).

## 2. Đối chiếu source trước khi viết

Đọc và dùng làm nguồn sự thật: `apps/web/src/app/router.tsx` (toàn bộ route, kể cả `notifications` redirect và `*` trong `/app`), `routeScope.ts` (`NAV_SECTIONS` 4 mục, `resolveRouteScope`, `ContextScope`), `AppShell.tsx` (rail 216px, topbar + thanh dưới, `NavBadge` với `capped → 20+`, `AccountMenu` không có Studio, banner thông báo/SSE/thu hồi), `SubjectSwitcher.tsx` (dòng “Theo dõi: …” một dòng), `AssistantPage.tsx` (H1 “Hôm nay”, dải trạng thái, “Hỏi trợ lý AI”, 3 gợi ý, `TODAY_LIMIT_NOTE`), `AlertsPage.tsx` + `NotificationsPage.tsx` (tab “Thông báo đã nhận”, mark-read, không ack), `AlertDetailPage.tsx` (liên hệ trước thao tác, “Tôi đang hỗ trợ”/“Đóng cảnh báo”), `DashboardPage.tsx`/`HistoryPage.tsx`, `SubjectsPage.tsx`/`SharePage.tsx`/`DevicesPage.tsx`/`TasksPage.tsx`/`SettingsPage.tsx`, `AdminPage.tsx` (5 tab: Tổng quan/Người dùng/Thiết bị/Chính sách/Nhật ký, `POLICY_KEY='device_runtime'`, audit panel), `AdminDevicesTab.tsx` (Tạo mã gắn thiết bị/Đổi khóa thiết bị, không có form tạo), `StudioViewsPage.tsx`/`StudioViewDetailPage.tsx`/`StudioViewDataPage.tsx`, `LandingPage.tsx`, `NotFoundPage.tsx`, `AppNotFoundPage.tsx`, `InvitePage.tsx`.

Đối chiếu thêm bằng chứng trong repo: `reports/qa/evidence/v7-foundation/shell-behavior.json` (nav active, context trên H1, `inbox.hasContext=false`, `accountMenu.hasStudio=false`, item 44px) và `reports/qa/evidence/v7-c/behaviour.json` (URL/tab inbox sau reload, mark-read lưu bền). Không dùng ảnh ngoài repo (`C:/tmp/...`) làm bằng chứng cho v7.

## 3. Số liệu kiểm thử — tự chạy ngày 18/11/2026

Môi trường: Windows, Node `v24.22.2`, pnpm `12.5.1`, PGlite in-memory cho API, Vitest (jsdom) cho web, Playwright Chromium cho E2E. API dev đang chạy sẵn ở cổng 3000 cho E2E.

| Lệnh | Kết quả thật |
| --- | --- |
| `pnpm --filter @heart-iot/web exec vitest run --no-file-parallelism --maxWorkers=1` | **38/38 file, 346/346 test pass**, 111,99 s (Start 01:33:35) |
| `pnpm --filter @heart-iot/web test:e2e` | **26/26 pass**, 7,0 s (Playwright tự bật Vite 5173) |
| `pnpm --filter @heart-iot/api test` | **20/20 suite, 219/219 test pass**, 59,448 s |
| `cd tools/simulator && npm test` | **23/23 pass**, 4,73 s — phải chạy `pnpm build:contracts` trước vì worktree chưa có `packages/contracts/dist` |
| `pnpm build:contracts` | pass (chỉ sinh `dist`, đã gitignore) |
| `tools/docs/.venv/Scripts/python.exe tools/docs/build.py` | 354 liên kết/275 ID, 22 mục; ghi `docs/html/index.html` 483.535 byte |
| `tools/docs/.venv/Scripts/python.exe tools/docs/build.py --check` | `Generated HTML matches current sources.` |
| `node tools/docs/check-examples.mjs` | `Đã parse 5/5 payload mẫu bằng schema tương ứng.` |

**Không chạy lại trong lượt này:** `pnpm -r typecheck`, `cd apps/web && pnpm build`, `pnpm test:random`, `pnpm seed`, `node infra/check-mqtt-exposure.mjs`. Vì vậy tài liệu **không** ghi các mục đó là đạt ở lần chạy 18/11/2026; bảng 15/11/2026 được giữ nguyên trong `docs/08` và `docs/14` dưới nhãn lịch sử.

Ghi chú môi trường: `tools/docs/.venv` không tồn tại trong worktree này, đã tạo bằng `python -m venv tools/docs/.venv` + `pip install -r tools/docs/requirements.txt` (Markdown 3.7) đúng như `tools/docs/README.md`. `.venv/` đã nằm trong `.gitignore`.

## 4. Kiểm tài liệu sau khi sửa

- `build.py` chạy thành công và `--check` khớp nguồn; không sửa tay `docs/html/index.html`.
- `check-examples.mjs` parse đủ 5/5 payload.
- Grep lại: không còn “An Nhiên”/`annhien`; `docs/06` chỉ còn nhắc menu “Thêm” trong câu nói **đã bị bỏ** ở v7 và trong phần lịch sử.
- Liên kết nội bộ trong `docs/06` trỏ tới `11-nen-tang-ai-va-cau-hinh-dong.md` và `14-ke-hoach-trien-khai-phan-mem.md` đều tồn tại (build kiểm 354 liên kết, 0 lỗi).

## 5. Phần chưa cập nhật / còn mở

- **Chưa sửa `reports/handoffs/v2-*.md`** dù các file này còn chuỗi `@annhien` trong bảng lệnh: đây là nhật ký lịch sử của vòng trước và nằm ngoài phạm vi được giao (chỉ tài liệu trong `docs/`, `README.md`).
- **Chưa sửa `docs/decisions/0003-tro-ly-la-trung-tam.md`**: ADR ghi bối cảnh v2 (“trợ lý ở menu Thêm”), là bản ghi quyết định tại thời điểm đó, không phải mô tả nav hiện tại.
- **Chưa đo lại** typecheck, production build, bundle size, p95 hay kiểm Firefox/WebKit; `docs/06` và `README.md` đã ghi rõ là chưa có.
- **Chưa có reviewer độc lập cho toàn bộ giao diện v7** — chỉ có `reports/qa/v7-foundation-review.md` cho W1 foundation; tài liệu ghi đúng mức này, không tuyên bố v7 đã được duyệt.
- Các khoảng hở nghiệp vụ/backend giữ nguyên như tài liệu cũ: MQTT P0-2, retention/xóa cứng, ngưỡng y khoa, form tạo thiết bị trong quản trị, OpenAPI máy sinh, CI.
