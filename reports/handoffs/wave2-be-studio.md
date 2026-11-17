# Handoff — wave2-be-studio

- **Thời điểm:** 2026-11-14 (Asia/Ho_Chi_Minh), sau wave 1
- **Worker:** be-studio
- **Vùng ghi:** `packages/contracts/src/studio.ts`, `apps/api/src/studio/**`, `apps/api/test/studio.spec.ts`, file này. Không sửa gì ngoài vùng.

## Đã làm

### Hợp đồng (`packages/contracts/src/studio.ts`)

- Đầy đủ schema theo prompt: `studioWidgetSchema` (id 1–40 `[a-z0-9-]`, type 5 loại, title 1–80, span 1|2|3, options optional), `viewConfigSchema` (version 1, layout, 1–12 widget, superRefine trùng id), `createViewSchema` (scope subject bắt buộc subjectId; user/global cấm subjectId), `updateDraftSchema`, `previewRequestSchema`, `publishViewSchema`, `rollbackViewSchema`, `viewSummarySchema`, `publicationSummarySchema`, `previewResultSchema`, `studioDataSchema` (subject/devices/metrics/series/alerts/summary/tasks/sample), `viewListSchema`, `publicationListSchema`.
- Bổ sung ngoài danh sách prompt (lead có thể đổi tên): `publishResultSchema`/`rollbackResultSchema` (`{ publication, view }` — response của publish/rollback), `viewDataQuerySchema`, `viewDataSchema` (response `GET :id/data`).
- `canonicalize()` + `canonicalConfigJson()`: sort key đệ quy, **giữ thứ tự mảng** (thứ tự widget là thứ tự layout). Digest tính ở API (`sha256` từ `auth/password`) vì contracts không phụ thuộc node:crypto (web dùng chung package).

### `apps/api/src/studio/` (StudioModule)

- `studio.service.ts`: digest một hàm duy nhất (canonicalize + sha256) cho create/draft/preview/publish. `StudioModule` imports `AuthModule` (guard phiên) + `PolicyModule` (PolicyService cho online/freshness).
- **Quyền theo hồ sơ, không dùng role toàn cục**: view user chỉ owner; view subject chỉ chủ hồ sơ tạo/sửa/publish, caregiver active xem published (draft che thành `baseRevision`/`draftDigest:null`), người lạ và admin không có link → 404; view global chỉ admin tạo/sửa/publish, user thường xem published.
- Routes `/workspace-views` đầy đủ theo prompt (list/create/get/draft/previews/publications/rollback/data). Mọi response parse qua zod trong controller.
- **Preview an toàn**: không có `previewSubjectId` → dữ liệu mẫu tổng hợp có nhãn (`sample:true`, subject null, id uuid cố định, warning "dữ liệu mẫu"); có `previewSubjectId` → `requireSubject` (404 nếu không có quyền) rồi query DB trực tiếp (không gọi HTTP nội bộ): device status qua `computeDeviceStatus` + policy, 30 điểm 24h gần nhất, alerts open/closed gần nhất (10), daily summary (avg/min/max HR qua aggregate SQL, đếm alerts), tasks (10). **Không ghi** bảng nghiệp vụ nào; chỉ audit `workspace_view.preview`.
- Option widget: khóa lạ → warning không chặn; khóa đúng mà giá trị sai → **422** kèm `details.warnings`.
- **Publish CAS**: kiểm draftRevision + digest + baseRevision trước; transaction `FOR UPDATE` trên view, kiểm lại, revision = max+1, active cũ → superseded, `baseRevision = revision`, giữ draft; lệch → 409 `APPROVAL_STALE` kèm `currentDraftRevision/currentDraftDigest/currentBaseRevision`. Phòng thủ thêm bằng unique `(view_id, revision)`.
- **Rollback**: publication phải thuộc view (404), không cho rollback tới bản đang active (409), tạo publication mới revision max+1 từ config cũ, không xóa lịch sử.
- Audit: create/draft/preview/publish/rollback, metadata chỉ `{ scope?, revision, digest, dataMode?, sourcePublicationId? }` — không dữ liệu sức khỏe.

## Kiểm đã chạy (kết quả thật)

| Lệnh (thư mục) | Kết quả |
| --- | --- |
| `cd packages/contracts && pnpm typecheck` | exit 0 |
| `cd packages/contracts && pnpm build` | exit 0, sinh `dist/studio.js` |
| `cd apps/api && pnpm typecheck` | **exit 0 — sạch toàn repo** (khác wave 1: be-data đã xong) |
| `cd apps/api && node --experimental-vm-modules node_modules/jest/bin/jest.js --runInBand test/studio.spec.ts` | **1 suite, 9/9 tests pass** (~2.6s) |
| Hồi quy `test/{auth,subjects,care,measurements,studio}.spec.ts` | **5 suites, 34/34 pass** (~9.4s) |
| Full suite `node --experimental-vm-modules node_modules/jest/bin/jest.js --runInBand` | **11 suites, 73/73 pass** (~21.2s) |

Test bao phủ đúng 9 mục prompt: T1 tạo/key trùng 409/config sai 422 (+ option sai → 422 warnings, option lạ → warning); T2 draft baseRevision lệch 409 `{currentRevision}`, digest đổi khi sửa config và ổn định khi đổi thứ tự key; T3 preview sample/subject + **đếm incidents/notification_outbox/maintenance_tasks/telemetry/workspace_views/view_publications trước–sau không đổi**; T4 publish sai digest/baseRevision → `APPROVAL_STALE`, thành công superseded + audit không chứa dữ liệu sức khỏe; T5 hai publish đồng thời → một 201 một 409, đúng một active; T6 caregiver đọc published, draft/preview/publish 403, view draft 404, list che draft; T7 global user 403/admin publish/user đọc published; T8 rollback tạo revision 3, history đủ, rollback active → 409, publication view khác → 404; T9 data endpoint kiểm quyền subject (không link → 404), user view thiếu subjectId → 422, không ghi.

## Chưa làm / giới hạn

- **Dependency graph preview** (kiểm component/data source/tool version trong config trước khi preview) — schema v1 chỉ có widget type cố định; chưa có registry dependency để kiểm.
- **Emergency rollback policy** (rollback khẩn khi lỗi bảo mật, không dùng version cũ đã pin) — hiện rollback thủ công không phân biệt emergency.
- **Đa instance CAS**: PGlite đơn kết nối nên test race đúng bằng `FOR UPDATE`; chưa kiểm trên PostgreSQL thật nhiều kết nối (chỉ phòng thủ bằng unique `(view_id, revision)`).
- Không nối `StudioModule` vào `AppModule` (thuộc lead); test dùng `createModuleTestApp(StudioModule)` + `TestFiltersModule` cục bộ (module test không tự đăng ký APP_FILTER; guard do `@UseGuards(SessionGuard)` trên controller).
- `GET /workspace-views/:id/data` của owner luôn render draft config (kể cả khi draft lệch publication); caregiver render config của publication active.
- Preview scope subject không có `previewSubjectId` → chế độ sample (theo prompt); chưa có đường "dùng subjectId của view làm mặc định".
- Enum `publication_status = 'rolled_back'` trong schema không được dùng (rollback giữ status nguồn, tạo publication mới) — đề nghị lead chốt nghĩa hoặc bỏ.

## Rủi ro tích hợp

1. **Schema response bổ sung**: publish/rollback trả `{ publication, view }`, data endpoint trả `{ view, config, digest, data, checkedAt }` — fe-studio cần khớp; lead có thể đổi tên trong `packages/contracts/src/studio.ts` (một nguồn duy nhất).
2. **Digest nằm ở API, canonicalize ở contracts**: client muốn tự tính digest phải replicate `sha256(canonicalize)`; chỉ server mới là nguồn đúng — hợp đồng hiện không bắt client gửi digest trước publish? `publishViewSchema` **bắt buộc** digest (lấy từ preview/draft summary), đề nghị fe-studio dùng `draftDigest` từ response.
3. **`Admin có thể publish global view của người khác** (đúng "admin cho global"); admin không phải owner không sửa được draft (đúng "PUT draft: owner") — nếu lead muốn admin sửa draft global thì cần đổi `updateDraft`.
4. Preview dữ liệu subject dùng window 24h cố định (không theo timezone); summary `windowStart/windowEnd` là 24h cuối chứ không phải "ngày" theo timezone hồ sơ — nếu cần khớp `daily-summary` (theo timezone) thì phải tái dùng `zonedDayToUtcRange`.
5. Test race publish chạy trên PGlite in-memory đơn kết nối: đúng hành vi CAS nhờ `FOR UPDATE` nhưng không phải bằng chứng đa kết nối thật.
6. `workspace_views.updatedAt` không có `onUpdateNow` — service tự set `updatedAt` ở draft/publish/rollback (không đổi schema).
