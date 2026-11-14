# Handoff — wave3-fe-studio

- **Thời điểm:** 2026-11-14 (Asia/Ho_Chi_Minh), sau wave 2
- **Worker:** fe-studio
- **Vùng ghi:** `apps/web/src/features/studio/**`, `apps/web/src/app/router.tsx` (chỉ thêm 3 route studio),
  `apps/web/src/app/AppShell.tsx` (chỉ thêm nav studio cho owner/admin), `apps/web/README.md`, file này.
  Không sửa API, contracts, package.json, tsconfig, vite/playwright config, lib/api.ts, lib/query.ts, docs, .env.
  Không chạy git/pnpm add.

## Đã làm

### File mới (`apps/web/src/features/studio/`)

- `api.ts` — client cho toàn bộ route `/workspace-views` (list/create/get/draft/previews/publications/
  rollback/data), mọi response parse qua schema `@annhien/contracts/studio` bằng `parseResponse`.
  Query keys studio đặt ở đây (lib/query.ts thuộc vùng worker khác).
- `labels.ts` — nhãn tiếng Việt cho scope/status/publication/widget-type/freshness/quality/task-status + `shortDigest`.
- `configForm.ts` — phần thuần của form config: parse options JSON từng widget (JSON sai → lỗi field, không gửi),
  validate bằng `viewConfigSchema`, gắn lỗi theo `widgets.<i>.<field>`, `nextWidgetId`, `defaultViewConfig`.
- `widgets.tsx` — `WidgetPreview` render chung cho preview/data: metric (chỉ hiện chỉ số có trong data;
  hỗ trợ option `field=batteryPercent` đúng spec API), chart (SVG series + nhãn trục min/max + thời gian
  đầu/cuối + bảng thay thế có caption), alerts (tối đa 10, `includeResolved` theo option), summary,
  tasks (tối đa 10). `DataModeBadge`: `sample=true` → "Dữ liệu mẫu", ngược lại "Dữ liệu thật [+ tên hồ sơ]".
  Không render HTML từ model/JSON; chỉ text node.
- `studio.css` — CSS riêng feature dùng token sẵn có, import một lần ở `widgets.tsx`. Mobile ≤640px:
  grid preview về 1 cột; bảng chart có wrapper overflow-x + caption.
- `StudioViewsPage.tsx` — `/app/studio`: danh sách (tên, key, scope, trạng thái, draftRevision,
  publication active revision/digest rút gọn, updatedAt); empty/loading/error; form tạo view (key a-z0-9-,
  tên, scope; scope subject bắt buộc chọn hồ sơ mình làm chủ — danh sách hồ sơ `role=owner`; scope global
  chỉ hiện với admin); hành động "Quản lý & công bố" chỉ cho owner (admin với global), "Xem" khi đã publish.
- `StudioViewDetailPage.tsx` — `/app/studio/:id`: soạn config (layout stack|grid, thêm/xóa ≤12 widget,
  lên/xuống đổi thứ tự, id/type/title/span/options JSON, lỗi JSON tại field chặn gửi); lưu draft
  `PUT :id/draft` CAS theo baseRevision, 409 → "Bản đã thay đổi ở máy chủ" + nút tải lại, không ghi đè;
  preview `POST :id/previews` (chọn `previewSubjectId` từ danh sách hồ sơ có quyền; chặn preview khi
  draft chưa lưu để preview khớp bản đã lưu); publish `POST :id/publications` với draftRevision + digest
  (từ preview) + baseRevision + note — nút chỉ bật khi preview thành công và draft không đổi;
  409 APPROVAL_STALE → hiện currentDraftRevision/currentDraftDigest/currentBaseRevision + nút tải lại,
  không tự publish lại; lịch sử `GET :id/publications` + rollback có xác nhận 2 bước, gửi `POST :id/rollback`
  `{publicationId}`, thông báo rollback tạo bản mới không xóa lịch sử. Người không có quyền quản lý
  (caregiver/user với global) chỉ thấy thông tin + link xem bản công bố.
- `StudioViewDataPage.tsx` — `/app/studio/:id/data`: view chưa publish → thông báo rõ, không gọi data,
  không giả lập; scope subject tự dùng subjectId của view, scope user/global bắt buộc chọn hồ sơ trước
  khi gọi `GET :id/data`; render bằng `WidgetPreview` với badge "Dữ liệu thật".
- Test: `StudioViewsPage.test.tsx` (4), `StudioViewDetailPage.test.tsx` (8), `StudioViewDataPage.test.tsx` (3),
  fixture `testFixtures.ts` (handler có trạng thái mô phỏng API, ghi lại body để kiểm chứng).

### Điểm thiết kế cần biết

- **GET view không trả config** (hợp đồng wave 2 chỉ có ViewSummary) — config draft chỉ lấy được qua
  `POST :id/previews`, nên trang chi tiết tự preview chế độ mẫu để nạp config vào form (mỗi lần mở/sửa
  draft ghi một audit `workspace_view.preview` phía server — do thiết kế API, không phải lỗi client).
- `AppShell`: nav "Studio" chỉ hiện khi user là admin hoặc chủ ít nhất một hồ sơ (`role=owner`);
  route không chặn — backend là nơi kiểm quyền thật.
- Publish/rollback xử lý response `{publication, view}` đúng handoff wave 2; dùng `draftDigest`/digest
  từ preview, client không tự tính digest.

## Kiểm đã chạy (kết quả thật)

| Lệnh (thư mục `apps/web`) | Kết quả |
| --- | --- |
| `pnpm typecheck` | exit 0 |
| `pnpm test src/features/studio` | 3 files, **15/15 pass** |
| `pnpm test` (toàn bộ, gồm hồi quy) | 15 files, **55/55 pass** |
| `pnpm build` | exit 0, bundle thành công (cảnh báo chunk >500 kB có sẵn từ trước, không do wave này) |
| `pnpm test:e2e` (API 3000 + web 5173 đang chạy thật) | **4/4 pass** (smoke + alerts, không có spec studio) |

Smoke API thật (seed demo `ba-an@demo.annhien.local`, PGlite dev): login → list views → tạo view
`smoke-fe-studio` → PUT draft (draftRevision 2) → preview sample (`sample:true`) → publish 201 r1 →
`GET :id/data` (sample false, subject "Bà Trần Thị An", 30 điểm) → preview subject (`dataMode:subject`) →
publish lại baseRevision cũ → **409 APPROVAL_STALE** đúng envelope `details.{currentDraftRevision,
currentDraftDigest,currentBaseRevision}` → PUT draft baseRevision cũ → **409 CONFLICT** `details.{currentRevision:1}`
— khớp đúng parser stale của UI. (View smoke để lại trong DB dev vì API không có route xóa view.)

## Chưa làm / giới hạn

- Không có E2E Playwright riêng cho studio (prompt không yêu cầu thêm spec; E2E hiện có đã chạy xanh).
- Không test UI với tài khoản admin (chỉ kiểm `scope=global` ẩn/hiện theo role qua code; backend đã test quyền ở wave 2).
- View scope `archived` không có đường tạo/đổi trạng thái ở API — UI chỉ hiển thị nhãn.
- Option widget: client không kiểm trước giá trị option theo từng loại (khóa lạ → server warning;
  giá trị sai → server 422 hiển thị lỗi); không tự chặn ở form.

## Rủi ro tích hợp

1. **Nạp config qua preview**: nếu lead đổi `POST :id/previews` để không trả `config` cho chế độ mẫu,
   editor không nạp được config ban đầu — cần thêm route GET config hoặc giữ hành vi hiện tại.
2. `baseRevision` publish lấy từ ViewSummary tại thời điểm bấm — nếu view đổi giữa chừng, server trả
   409 APPROVAL_STALE và UI đề nghị tải lại (đúng thiết kế, không retry tự động).
3. Digest hiển thị rút gọn 8 ký tự (`shortDigest`) — chỉ để đọc, không dùng để so sánh.
4. Nav "Studio" ẩn với user không có hồ sơ chủ — người này vẫn vào được route trực tiếp (backend vẫn cho
   tạo view scope user); nếu lead muốn nav cho mọi user thì bỏ điều kiện `role=owner` trong `AppShell`.
5. `apps/web/README.md` đã cập nhật cấu trúc/route/trạng thái wave 3.

## Bước tiếp theo gợi ý (chưa cam kết)

- Lead xem lại luồng "preview tự động khi mở trang" (audit mỗi lần mở) và quyết định có thêm
  `GET /workspace-views/:id/config` hay không.
- E2E studio qua Playwright khi muốn kiểm bằng trình duyệt thật.
