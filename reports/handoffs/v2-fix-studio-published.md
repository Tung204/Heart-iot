# Handoff — v2 fix Studio data dùng publication active

- **Thời điểm:** 2026-11-15 07:51 (Asia/Ho_Chi_Minh)
- **Worker:** fix-studio-published (worktree riêng `fix-studio-published`, base `240f754`)
- **Nhánh:** `fix-studio-published`
- **Vùng ghi:** `apps/api/src/studio/studio.service.ts` (chỉ nhánh `data` + helper
  `buildViewSummary`), `apps/api/test/studio.spec.ts`,
  `apps/web/src/features/studio/StudioViewDataPage.tsx`,
  `apps/web/src/features/studio/StudioViewDataPage.test.tsx`, file này.
  **Không** sửa app.module/router/layout/contracts/studio.css (không cần CSS).
- **Nguồn yêu cầu:** `reports/qa/v2-owner-journey.md` P2-2;
  `docs/04-du-lieu-va-giao-tiep.md:101` (danh sách API Studio);
  `README.md:81` và `apps/api/README.md:45` (publish CAS + rollback tạo bản mới).
  Ghi chú: `docs/03-kien-truc-he-thong.md` hiện **không có** mục Studio/publish/rollback
  để đối chiếu (xem "Chưa làm").

## Đã làm

### API — `StudioService.data()` (`studio.service.ts`)

- Bỏ hoàn toàn nhánh owner/admin dùng `view.draftConfig`. Owner, admin và viewer
  dùng **cùng một nhánh**: đọc `publication` active rồi lấy `config` và `digest`
  trực tiếp từ bản đó. `digest` là digest đã lưu của publication (không tính lại),
  nên response luôn khớp đúng bản đang hoạt động kể cả sau rollback.
- Chưa có publication active → **404 `NOT_FOUND`** "View chưa có bản công bố.",
  không trả draft. Viewer vẫn giữ semantics cũ: view chưa `published` → 404
  "Không tìm thấy view hoặc bạn không có quyền truy cập." (không lộ tồn tại).
- `view` trong response dựng theo góc nhìn người xem (`editor = false`):
  `draftRevision = baseRevision`, `draftDigest = null`, `currentPublication` là
  bản active. Nhờ vậy payload của endpoint "dữ liệu đã công bố" chỉ mô tả một bản;
  draft không bị trộn vào. Draft vẫn lấy được qua `POST /previews` hoặc
  `GET /workspace-views/:id` (owner/admin).
- Thêm tham số optional `activeOverride` cho `buildViewSummary` để `data()` truyền
  đúng publication vừa đọc — tránh hai truy vấn active lệch nhau nếu có publish
  xen giữa, và bớt một query.
- Giữ nguyên `resolveAccess`, kiểm quyền đọc hồ sơ qua `renderSubjectData`
  (`AccessService.requireSubject`) và toàn bộ scoping `subjectId` của view.
  Không ghi bảng nghiệp vụ nào (test đếm trước/sau).

### Web — `StudioViewDataPage.tsx`

- Header "Bản công bố rN (digest …)" ưu tiên publication trong **chính response
  `/data`** (fallback `GET view`), digest hiển thị lấy từ `data.digest` — tức đúng
  config đang render. Trang chỉ hiện **một** digest, không còn cảnh hai digest
  mâu thuẫn như ảnh `59-studio-data-selected.png`.
- Card dữ liệu không in lặp digest nữa; mô tả "render theo bản công bố rN" khớp
  header và payload.
- Owner/admin có `draftDigest` khác digest active → `Alert` info
  "Bản nháp hiện tại chưa được công bố", nói rõ trang chỉ hiển thị bản active và
  dẫn link "Xem trước bản nháp" sang trang quản lý. Không gọi dữ liệu draft là
  "đã công bố"; preview draft vẫn ở đường/nhãn riêng ("Xem trước", "Draft rN ·
  digest …") đã có ở `StudioViewDetailPage`.
- View chưa có publication vẫn là empty state "View chưa được công bố" và không
  gọi `GET /data` (giữ test cũ).

## Quyết định cần lead biết

1. **`GET /workspace-views/:id/data` của owner trên view draft-only giờ trả 404**
   (trước đây 200 kèm draft). Web đã gate bằng `currentPublication` nên không có
   màn hình nào gọi nhầm; client API khác phải xử lý 404. Chọn 404 thay vì 200 rỗng
   vì `ViewData` schema bắt buộc `config`/`data`, và đây là semantics sẵn có cho viewer.
2. **`view` trong response `/data` không còn lộ `draftDigest`/`draftRevision` thật**
   kể cả với owner. Endpoint này chỉ mô tả bản công bố; draft có `GET view` và
   `POST /previews`. Nếu lead muốn giữ draft trong payload để debug thì chỉ cần đổi
   `buildViewSummary(view, false, active)` → `(view, editor, active)`, nhưng UI sẽ
   phải tiếp tục tách nhãn để không tái diễn P2-2.
3. **Digest lấy từ bản ghi publication, không `computeDigest(config)` lại.** Đây là
   giá trị đã được duyệt/công bố và khớp `view.currentPublication.digest`; nếu thuật
   toán canonical JSON đổi sau này, dữ liệu cũ vẫn trung thực với lúc công bố.
4. **Cảnh báo "draft khác bản công bố" so sánh digest**, không so `draftRevision` với
   `publication.revision` — hai bộ đếm độc lập (publish/rollback tăng revision
   publication, lưu draft tăng draftRevision; rollback không sửa draft).

## Kiểm đã chạy (kết quả thật)

| Lệnh (thư mục) | Kết quả |
| --- | --- |
| `pnpm install --prefer-offline --frozen-lockfile` (root) | exit 0 |
| `pnpm build:contracts` (root) | exit 0 |
| `pnpm --filter @annhien/api typecheck` | exit 0 |
| `pnpm --filter @annhien/web typecheck` | exit 0 |
| `pnpm test -- studio.spec.ts` (`apps/api`) | **1 suite, 10/10 pass** (~5,5 s) |
| `pnpm test` (`apps/api`, toàn bộ) | **18 suite, 161/162 pass**; 1 fail **có sẵn từ base** (xem dưới) |
| `pnpm test` (`apps/web`, toàn bộ) | **24 file, 124/124 pass** (~13,5 s) |
| `npx vitest run src/features/studio` (`apps/web`) | **3 file, 16/16 pass** |

Test mới/đổi:

- API **T9 (viết lại)**: owner và caregiver gọi `/data` khi chưa có publication →
  404, body không có `config`; publish rồi → `config`/`digest` là của bản r1,
  `view.currentPublication` r1, `view.draftDigest = null`, dữ liệu thật của hồ sơ;
  caregiver có link thấy cùng config/digest; caregiver không link → 404; view
  scope user đã publish thiếu `subjectId` → 422; số bản ghi nghiệp vụ không đổi.
- API **T10 (mới)**: publish A (r1) → publish B (r2) → lưu draft C (mới hơn active);
  owner `/data` trả config/digest B trong khi `GET view` vẫn trả `draftDigest` C;
  caregiver `/data` cũng trả B; rollback về A tạo publication r3 với config/digest A
  và cả owner lẫn caregiver nhận A, không nhận draft C.
- Web: test published khẳng định widget/digest/revision của bản active; test mới
  "owner có draft mới hơn active" khẳng định chỉ render config bản công bố, không
  hiện digest draft, có alert + link Xem trước; test no-publication cũ vẫn đảm bảo
  không gọi `GET /data`.

**Fail có sẵn, ngoài phạm vi:** `apps/api/test/incidents.spec.ts` T16
(`caregiverList.items` mong 1, nhận 0). Đã kiểm bằng cách `git stash` toàn bộ thay
đổi của worker này rồi chạy lại trên đúng base `240f754`: vẫn fail y hệt. Nguyên
nhân: `care_links.shared_from` default `now()`, test backdate incident 30 phút rồi
mong caregiver thấy incident `unconfirmed` trong tab closed, trong khi fix cửa sổ
chia sẻ (`32826cf`) ẩn incident đóng trước `shared_from`. T16 được thêm ở `1d311dc`
trước fix đó. Không sửa vì ngoài vùng được phép ghi.

## Chưa làm / phần lead cần nối

- **Sửa test incidents T16** (hoặc chốt semantics `unconfirmed` trước mốc chia sẻ).
  Đây là blocker duy nhất của `pnpm test` toàn bộ API trên base hiện tại; không do
  thay đổi Studio này.
- **`docs/03-kien-truc-he-thong.md` không có mục Studio publish/rollback** (task yêu
  cầu đọc); thông tin đang nằm ở `docs/04:101`, `README.md:81`,
  `apps/api/README.md:45`. Nếu muốn docs/03 làm nguồn kiến trúc đầy đủ, docs owner
  cần bổ sung mục này; worker không sửa docs theo giới hạn vùng ghi.
- Không chạy lại Playwright/HTTP trên app thật và không chụp ảnh after-fix; bằng
  chứng là PGlite in-memory + Vitest. Không đụng API :3000 / web :5173 / DB demo.
- `pnpm test:e2e` không chạy (ngoài yêu cầu, tránh chiếm cổng của lead).
