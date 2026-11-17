# Handoff — v7 W2 lane A: quản trị và Studio

- **Task**: `task_0b295999172e` · **Dispatch**: `ctx_be680e261a0c` · **Worker terminal**: `term_fd45f2b8-4a8f-4de7-8615-de0299978c70`
- **Nhánh/worktree**: `Tung204/v7-a` tại `C:/Users/nguye/orca/workspaces/DATN/v7-a`
- **Base commit**: `cf11c29` — `feat(web): nền tảng giao diện v7 — token, primitive, shell, CSS graph`
  (`cf11c29` **không** phải tổ tiên của `d4af4da` bên lane foundation; cây `apps/web` tại base giống nhau, lane này làm trên `cf11c29`.)
- **Phạm vi thay đổi**: chỉ file của lane A (bên dưới), không sửa contract/API/quyền, không thêm dependency, giữ mọi mutation hiện có.
- **Commit trên nhánh**: `8986d1f` (quản trị) · `b0177e5` (Studio) · commit kế tiếp (bằng chứng + handoff này) là HEAD của nhánh
- **Môi trường đo**: API cục bộ cổng **3400** (3000 đang bận), web cổng gate **4355**.

## 1. Việc đã làm

### 1.1. Quản trị (`apps/web/src/features/admin/*`, `apps/web/src/styles/admin.css`)

- **Năm mục, không còn tab "Nâng cao"**: `Tổng quan · Người dùng · Thiết bị · Chính sách · Nhật ký`.
  - `readTab()`/`paramsForTab()` suy tab từ URL: canonical `?tab=overview|users|devices`, `?tab=advanced&view=policy|audit`.
  - Tương thích: `?tab=advanced` (không `view`) → Chính sách; URL chỉ có `?view=policy|audit` vẫn mở đúng; tab Tổng quan xóa query (URL sạch).
  - Reload, back/forward và dán link giữ đúng tab — đo bằng trình duyệt (mục 4).
  - Điều hướng bàn phím `ArrowLeft/Right/Home/End`, roving `tabIndex`, `aria-controls`/`id` cặp `admin-tab-*`/`admin-panel-*`.
- **Tổng quan**: khối "Cần chú ý" (tối đa 3 dòng, ưu tiên `outbox.failed`), dl "Số vận hành" 6 nhóm (Tài khoản/Hồ sơ/Thiết bị/Cảnh báo/Công việc/Thông báo), hàng nút "Đi thẳng tới việc cần làm".
- **Chính sách**: form chia 3 fieldset có mô tả đơn vị (`Nhịp gửi và độ mới của dữ liệu`, `Kết nối và sự kiện trễ`, `Giới hạn tải`); nút `Xem trước` trả digest + dòng bằng chứng "Bản xem trước cho vN · digest … · không ghi dữ liệu"; `Phát hành` chỉ bật khi preview đúng giá trị hiện tại (CAS `baseRevision` giữ nguyên), sửa bất kỳ ô nào thì preview bị vô hiệu; khối diff "Thay đổi so với bản đang hoạt động"; 409 hiện revision hiện hành + hành động tải lại.
- **Người dùng**: bảng có caption ẩn, khóa/mở khóa kèm ô lý do bắt buộc, focus vào ô lý do khi mở form.
- **Thiết bị**: chỉ metadata; bỏ dòng "Pin" (API quản trị không trả pin, không bịa giá trị); "Lần nhận dữ liệu gần nhất"; khóa mới hiển thị **một lần** trong khối cảnh báo, nút "Tôi đã lưu, ẩn đi" xóa khóa khỏi DOM (đo: `secretInDomAfterDismiss=false`), không chép vào clipboard tự động.
- **Nhật ký**: giữ bộ lọc; nút "Xem chi tiết" mở panel **ngoài** khung cuộn bảng (trước đây panel nằm trong bảng gây cuộn ngang), focus chuyển vào panel.
- **Đổi tiền tố lớp `adm-*` → `admin-*`** để toàn bộ style của màn này thuộc `styles/admin.css` (lane A), tránh đụng CSS F-owned.
- `features/admin/admin-devices.css` đã xóa; nội dung chuyển vào `styles/admin.css`.

### 1.2. Studio (`apps/web/src/features/studio/*`, `apps/web/src/styles/studio.css`)

- **Danh sách**: breadcrumb `Về Hôm nay → Studio` (đặt ngoài `PageHeader`), H1, nút `Tạo view`, form tạo (key/name/scope/subject, validate bằng zod, reset subject khi đổi scope), mỗi dòng có scope + trạng thái, bản công bố `rN · digest … · thời gian`, hành động `Quản lý` / `Xem bản công bố` theo quyền (owner; admin cho view global — không đổi logic quyền).
- **Chi tiết**: thanh bước `Soạn nháp → Xem trước → Công bố`, workbench 2 cột (≥1024px 45/55), editor widget, preview chọn hồ sơ tùy chọn (mặc định mẫu), `Phát hành` chỉ bật khi preview đúng `draftRevision` + digest hiện tại, chỉnh/lưu nháp làm preview cũ bị vô hiệu, lịch sử công bố + rollback xác nhận tại chỗ (nói rõ "tạo bản công bố mới", không "xóa bản hiện tại"), xử lý stale/409.
- **Dữ liệu**: dải bản công bố (revision, digest rút gọn, thời điểm công bố/kiểm), thông báo khi có nháp chưa công bố ("bản công bố vẫn đang chạy"), chọn hồ sơ cho scope không phải subject, chặn 360px bằng `.studio-datamode` co giãn.
- **Nhãn D9**: `Dữ liệu mẫu` / `Dữ liệu hồ sơ · <tên>` + pill phụ `Dữ liệu mô phỏng` khi telemetry tổng hợp; **không còn chuỗi "Dữ liệu thật"** trong mã nguồn (chỉ còn trong test âm bản và comment giải thích).
- `features/studio/studio.css` đã xóa; style mới ở `styles/studio.css`.

## 2. Test diff (có chủ đích, D9 + cấu trúc tab)

| File | Trước | Sau | Lý do |
| --- | --- | --- | --- |
| `StudioViewDataPage.test.tsx` | `getByText('Dữ liệu thật')` | `getByText('Dữ liệu hồ sơ')` **và** thêm `expect(queryByText(/Dữ liệu thật/)).not.toBeInTheDocument()` | D9 đổi nhãn; thêm khẳng định âm để khóa hồi quy |
| `StudioViewDataPage.test.tsx` | "Chưa có dữ liệu thật" | "Chưa có dữ liệu của hồ sơ" | nhãn mới, không đổi hành vi |
| `StudioViewDataPage.test.tsx` | label `/Hồ sơ dữ liệu/` | label `/Dữ liệu của/` | id/nhãn chọn hồ sơ mới |
| `StudioViewDetailPage.test.tsx` | select `/Hồ sơ dữ liệu thật/` | `/Xem trước với hồ sơ/` + assert `Dữ liệu hồ sơ · Bà Năm`, `Dữ liệu mô phỏng`, không có "Dữ liệu thật" | preview phải phân biệt mẫu/mô phỏng (D9) |
| `StudioViewsPage.test.tsx` | link `Quản lý & công bố`, `Xem` | `Quản lý`, `Xem bản công bố` | tên hành động rõ đích |
| `AdminPage.test.tsx` | test "bốn tab + Nâng cao" | "đúng năm mục nghiệp vụ, không có mục Nâng cao"; kiểm `aria-controls`/panel id | bỏ tab Nâng cao |
| `AdminPage.test.tsx` | click tab Nâng cao trong ~16 test | click thẳng tab nghiệp vụ (`findByRole` vì chờ `useMe`) | luồng mới |
| `AdminPage.test.tsx` | URL test chỉ `tab=users` | thêm `?tab=advanced&view=policy`, compat `?tab=advanced`, `?tab=users` | URL canonical |
| `AdminPage.test.tsx` | Tổng quan kiểm 4 KPI | kiểm 6 nhóm "Số vận hành" + "Cần chú ý" | màn mới |
| `AdminPage.test.tsx` | `Người dùng hoạt động` | `Tài khoản` | nhãn mới |
| `AdminPage.test.tsx` | devices kiểm "Chưa có thông tin pin" | kiểm có 5 tab (gồm Nhật ký) và **không** có dòng Pin, có "Lần nhận dữ liệu gần nhất" | bỏ dòng Pin |
| (toàn bộ) | selector `.adm-*` | `.admin-*` | tiền tố CSS mới |

Không nới lỏng hay bỏ test nào; các assert cũ giữ nguyên ngữ nghĩa, chỉ đổi tên/khẳng định thêm.

## 3. Cổng kiểm (chạy trong `apps/web`, log thật)

```
pnpm build:contracts                                   # cần trước typecheck trong worktree mới
pnpm --filter @heart-iot/web typecheck        → exit 0 (tsc --noEmit, không lỗi)
pnpm --filter @heart-iot/web exec vitest run \
  --no-file-parallelism --maxWorkers=1        → exit 0 · Test Files 37 passed (37) · Tests 291 passed (291)
pnpm --filter @heart-iot/web build            → exit 0 · ✓ built in 368ms
                                                 dist/assets/index-*.js 269.71 kB │ gzip 83.16 kB
```

## 4. Bằng chứng runtime (`reports/qa/evidence/v7-a/`)

Kịch bản: `measure.mjs` (32 ảnh + `metrics.json`), `states.mjs` (8 ảnh trạng thái + `states.json`), `seed-studio.mjs` (tạo view qua API cục bộ). Dữ liệu: `PGLITE_DATA_DIR=.data/qa-v7-a pnpm seed`.

8 route × 4 viewport (1280×900, 390×844, 360×740, 390×844 chữ lớn):

| Chỉ số | Kết quả |
| --- | --- |
| Tràn ngang (`scrollWidth > clientWidth`) | **0/32** (cả `body`) |
| Target < 44px | **0** — mỗi màn 11–39 target, thấp nhất 11 (Dữ liệu) |
| Số H1 | đúng 1 ở mọi màn |
| Bảng tràn khung cuộn | không: users 360px `wrap 328 / scroll 328`; mọi bảng dùng caption ẩn + nhãn ô |
| Chữ "Dữ liệu thật" | **0** lần ở mọi route/viewport |
| Reload giữ URL + tab | **32/32** (`urlKept`, `tabKept`) |
| Request lỗi thật (không tính `ERR_ABORTED` khi điều hướng) | **0**; 588 abort do chuyển trang, tách riêng |
| Non-admin vào `/app/admin` | **0** request `/api/v1/admin/`, hiện "Không có quyền truy cập" (`guard.adminApiCalls=0`, `noticeVisible=true`) |
| Nav chính | 4 mục (Hôm nay/Cảnh báo/Sức khỏe/Người thân), **0** link Studio (D7) |

Trạng thái tương tác (`states.json`):

- Bàn phím: `ArrowRight` → "Người dùng" vừa chọn vừa focus; `End` → "Nhật ký", URL `?tab=advanced&view=audit`.
- Back sau khi bấm "Nhật ký" → `/app/admin?tab=overview`, tab "Tổng quan", đúng nội dung.
- Chính sách: sau preview `Phát hành` bật; dòng bằng chứng `Bản xem trước cho v1 · digest ba1a4981d61f · không ghi dữ liệu`; sửa ô nhịp tim → `Phát hành` khóa lại và dòng preview biến mất.
- Nhật ký: panel chi tiết nhận focus và **không** nằm trong `.admin-table-wrap`.
- Người dùng: mở khóa → focus vào `TEXTAREA` lý do.
- Thiết bị: khóa mới dài 43 ký tự, focus sang heading (H2); sau "Tôi đã lưu, ẩn đi" chuỗi khóa **không còn** trong DOM.
- Studio: preview với hồ sơ hiện `Dữ liệu hồ sơ · Bà Trần Thị An` + `Dữ liệu mô phỏng`; đổi nguồn về mẫu → nhãn `Dữ liệu mẫu`; `Dữ liệu thật` = 0.

Ảnh: 32 ảnh `{route}-{viewport}.png` (+ `*-360x740-full.png`), 8 ảnh trạng thái: `admin-policy-1280x900-preview.png`, `admin-audit-1280x900-detail.png`, `admin-users-1280x900-lock-form.png`, `admin-devices-1280x900-secret.png`, `studio-detail-1280x900-subject-preview.png`, `studio-detail-1280x900-preview-reset.png`. Đã xem trực tiếp các ảnh 360/390 (quản trị tổng quan/người dùng/thiết bị/chính sách/nhật ký; studio danh sách/chi tiết/dữ liệu) và 1280 tương ứng.

## 5. CSS ledger (cần lane F/W3 dọn)

- Mới (lane A): `apps/web/src/styles/admin.css`, `apps/web/src/styles/studio.css` — chỉ dùng token/primitive của foundation, không hard-code màu/kích thước ngoài token (đã kiểm không có `var(--…)` thiếu định nghĩa).
- Đã xóa: `apps/web/src/features/admin/admin-devices.css`, `apps/web/src/features/studio/studio.css`.
- **Còn rác chết thuộc F**: khối `.adm-*` trong `apps/web/src/styles/layout.css` và toàn bộ `apps/web/src/styles/admin-simple.css` (vẫn được import ở `main.tsx`) sau khi đổi tiền tố sang `admin-*` không còn selector nào dùng. Lane A không xóa vì thuộc file F-owned — đề nghị W3 xóa cả file + import. Ba quy tắc `.admin-page .field/.button/[tabindex='-1']:focus` trong `admin-simple.css` vẫn áp dụng vô hại (trùng giá trị với `styles/admin.css`).

## 6. Khác biệt / giới hạn

- API dev chạy cổng **3400** (3000 bị tiến trình khác chiếm); web đúng cổng gate **4355**. Lệnh chạy lại ở mục 7.
- Seed demo không có dữ liệu pin cho thiết bị → bỏ dòng "Pin" thay vì hiện giá trị giả; nếu W3 bổ sung pin vào API quản trị thì thêm lại một dòng fact.
- Chưa kiểm: tranh chấp CAS thật trên UI (đường 409 mới kiểm bằng unit/API), ghép thiết bị vật lý, zoom 200% (để W4).
- Runtime của worker này: provider `moxuna`, model `deepseek-v4.1-flash` (preamble dispatch ghi `dola/gpt-6.1-sol`; ghi lại để đối chiếu).

## 7. Chạy lại bằng chứng

```bash
# 1) API + dữ liệu
cd apps/api && PGLITE_DATA_DIR=.data/qa-v7-a pnpm seed
PGLITE_DATA_DIR=.data/qa-v7-a WEB_ORIGIN=http://127.0.0.1:4355 PORT=3400 pnpm dev
# 2) Web
cd apps/web && VITE_API_BASE_URL=http://127.0.0.1:3400/api/v1 \
  pnpm exec vite --host 127.0.0.1 --port 4355
# 3) Dữ liệu Studio + đo
node reports/qa/evidence/v7-a/seed-studio.mjs
node reports/qa/evidence/v7-a/measure.mjs
node reports/qa/evidence/v7-a/states.mjs
```
