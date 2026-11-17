# Prompt wave 2 — be-studio (workspace views: draft → preview → publish)

Repo: `C:/MyFolder/Hoc_Tap/project/DATN`. Bạn là **worker backend be-studio**, không phải lead.

## Đọc trước khi code (bắt buộc)

1. `AGENTS.md`, `docs/12-nguyen-tac-phat-trien-va-bang-chung.md`.
2. `docs/14-ke-hoach-trien-khai-phan-mem.md` mục 4–8.
3. `docs/11-nen-tang-ai-va-cau-hinh-dong.md` mục “Preview frontend phải kiểm được gì”, `docs/13-dac-ta-thuc-thi-ai-va-cau-hinh.md` mục 6 (cấu hình, preview, phát hành, rollback), `docs/06-trai-nghiem-va-man-hinh.md`.
4. `reports/worklog/2026-11-14.md` mục 21:26, handoff wave 1 nếu đã có.
5. Code nền: `apps/api/src/{access,common,database,auth}`, `apps/api/test/test-app.ts`, `packages/contracts/src/core.ts`; schema `workspace_views`, `view_publications`, `policy_configs`.

## Vùng ghi được phép

- `apps/api/src/studio/**`
- `packages/contracts/src/studio.ts`
- `apps/api/test/studio.spec.ts`
- `reports/handoffs/wave2-be-studio.md`

Không sửa `app.module.ts`, schema, access/auth, package.json, docs. Không `git`, không `pnpm add`, không đổi `.env`.

## Hợp đồng `studio.ts`

- `studioWidgetSchema`: `{ id: string 1..40 regex [a-z0-9-], type: 'metric'|'chart'|'alerts'|'summary'|'tasks', title: string 1..80, span: 1|2|3, options: record<string, unknown> optional }` strict.
- `viewConfigSchema`: `{ version: 1, layout: 'stack'|'grid', widgets: array 1..12, unique widget id, unique type? không bắt buộc }` strict, superRefine trùng id.
- `createViewSchema`: `{ key: regex [a-z0-9-]{2,40}, name 1..120, scope: 'user'|'subject'|'global', subjectId?: uuid, config }` strict; scope subject bắt buộc subjectId; scope user/global không nhận subjectId (refine).
- `updateDraftSchema`: `{ config, baseRevision: int >=0 }` strict.
- `previewRequestSchema`: `{ draftRevision: int >=1, previewSubjectId?: uuid }` strict.
- `publishViewSchema`: `{ draftRevision: int >=1, digest: string 16..128, baseRevision: int >=0, note?: 0..300 }` strict.
- `rollbackViewSchema`: `{ publicationId: uuid, note?: 0..300 }` strict.
- `viewSummarySchema`: `{ id, key, name, scope, ownerUserId, subjectId nullable, status, draftRevision, draftDigest nullable, baseRevision, currentPublication nullable, updatedAt, createdAt }`.
- `publicationSummarySchema`: `{ id, viewId, revision, digest, status, publishedAt, note nullable, approvedBy: {id,displayName}, publishedBy: {id,displayName} }`.
- `previewResultSchema`: `{ digest, view: viewSummarySchema, config, draftRevision, dataMode: 'sample'|'subject', subjectId nullable, data: studioDataSchema, warnings: string[], checkedAt }`.
- `studioDataSchema`: `{ subject: {id,displayName,timezone}|null, devices: [...], metrics: {heartRateBpm,quality,measuredAt,online,freshness}|null, series: {measuredAt,heartRateBpm,quality}[], alerts: [...], summary: {...}|null, tasks: [...] , sample: boolean }`.
  Chỉ gồm trường cần render; số liệu lấy từ DB thật khi có quyền, không bịa.
- `viewListSchema = { items: viewSummarySchema[] }`, `publicationListSchema = { items: publicationSummarySchema[] }`.

## Nghiệp vụ

### Quyền và scope

- `user`: chỉ owner xem/sửa/publish.
- `subject`: owner tạo/sửa/publish; caregiver active xem bản đã publish (không thấy draft, không sửa); admin không mặc định xem (404).
- `global`: chỉ admin tạo/sửa/publish; user thường chỉ xem publication active.
- Không dùng tên role toàn cục thay kiểm quyền hồ sơ.

### Route (`/workspace-views`)

- `GET /workspace-views`: view user sở hữu + view subject được chia sẻ (chỉ published) + global published; kèm draft nếu owner.
- `POST /workspace-views`: validate scope/key/name/config; unique (owner,key) → 409; tạo status draft, draftRevision 1, digest; audit `workspace_view.create`. Trả 201.
- `GET /workspace-views/:id`: owner thấy draft+publication; caregiver chỉ thấy publication active; global published cho mọi user.
- `PUT /workspace-views/:id/draft`: owner; body baseRevision phải bằng `view.baseRevision` hiện tại (nếu lệch → 409 `CONFLICT` details currentRevision); tăng draftRevision, tính digest canonical JSON, lưu; audit `workspace_view.draft`. Không publish.
- `POST /workspace-views/:id/previews`: owner (hoặc admin cho global); body draftRevision phải khớp hiện tại; `previewSubjectId` (nếu có) kiểm quyền đọc hồ sơ; sinh `digest` **của cấu hình hiện tại**, render data từ DB (chế độ subject) hoặc dữ liệu mẫu có nhãn (chế độ sample, `sample:true`); **tuyệt đối không ghi** incident/notification/task/telemetry/view; chỉ được ghi audit `workspace_view.preview`; trả `previewResultSchema`. Nếu config không render được (widget options sai) → 422 với warnings.
- `POST /workspace-views/:id/publications`: owner (subject) / admin (global); kiểm `draftRevision` + `digest` khớp draft hiện tại và `baseRevision` khớp publication active hiện tại; transaction: publication revision = max+1, status active, publication active cũ → superseded, view status published, baseRevision = revision, giữ draft; audit `workspace_view.publish`. Digest/revision lệch → 409 `APPROVAL_STALE` details. Hai publish đồng thời: một thành công, một 409.
- `POST /workspace-views/:id/rollback`: owner/admin; publicationId thuộc view; tạo publication **mới** revision max+1 từ config cũ, status active; active cũ → superseded; audit `workspace_view.rollback`; không xóa lịch sử, không đổi dữ liệu nghiệp vụ.
- `GET /workspace-views/:id/publications`: owner/admin (caregiver chỉ active? trả active + lịch sử cho owner).
- `GET /workspace-views/:id/data?subjectId=`: render data cho publication active hoặc draft của owner; kiểm quyền subject; `sample=false`; không ghi.

### Digest và preview an toàn

- `canonicalize(config)`: sort key đệ quy, JSON.stringify; `sha256` hex. Dùng cùng hàm cho draft/publish/preview. Không phụ thuộc thứ tự key do client gửi.
- Dữ liệu preview:
  - `dataMode='sample'` khi không truyền previewSubjectId: dùng hằng số tổng hợp rõ nhãn, **không** đọc DB sức khỏe người khác.
  - `dataMode='subject'`: chỉ đọc dữ liệu subject mà caller có quyền; giới hạn 24h gần nhất; lấy device status + 30 điểm + alerts open/closed gần nhất + daily summary + tasks. Không gọi endpoint nội bộ qua HTTP; query DB trực tiếp.
- Preview phải chịu được widget type lạ/thiếu: trả warnings nhưng schema đã chặn type lạ. Với options không hỗ trợ, warning không chặn.
- Không tự publish khi preview; không có endpoint “apply” ngầm.

### Audit

Mỗi thao tác ghi audit: create/draft/preview/publish/rollback. Metadata chỉ id/revision/digest, **không** chứa dữ liệu sức khỏe.

## Test bắt buộc

Dùng `createModuleTestApp(StudioModule)` + `registerUser`/`createAdmin`/`loginUser`; tạo subject/device/telemetry/incident/task trực tiếp DB khi cần. Tối thiểu:

1. Owner tạo view user; key trùng → 409; config sai (widget trùng id, >12, type lạ) → 422.
2. Draft: baseRevision đúng tăng revision; baseRevision cũ → 409; digest đổi khi sửa config, ổn định khi đổi thứ tự key.
3. Preview: draftRevision cũ → 409; trả `sample:true` khi không có subject; với subject có quyền → dữ liệu thật; **đếm bảng incidents/notification_outbox/maintenance_tasks/telemetry/workspace_views trước/sau preview không đổi** (audit được phép tăng).
4. Publish: sai digest → 409 `APPROVAL_STALE`; revision lệch → 409; thành công tạo publication active, active cũ superseded; view status published; audit có bản ghi.
5. Publish đồng thời hai request cùng digest/revision → một 200/201, một 409; chỉ một publication active.
6. Caregiver: đọc published subject view được; sửa/draft/preview/publish bị 403/404; không thấy draft.
7. Global: user thường không tạo được; admin tạo/publish; user đọc published.
8. Rollback: tạo revision mới từ publication cũ, history còn đủ, active cũ superseded, không xóa publication.
9. Data endpoint: kiểm quyền subject (caregiver không có link → 404), không ghi dữ liệu.

Chạy:

```bash
cd apps/api
pnpm typecheck
node --experimental-vm-modules node_modules/jest/bin/jest.js --runInBand test/studio.spec.ts
```

Không mở server dài hạn.

## Kết thúc

Handoff `reports/handoffs/wave2-be-studio.md`: file, lệnh + kết quả thật, phần chưa làm (dependency graph preview, emergency rollback policy, đa instance CAS), rủi ro tích hợp. Kẹt >15 phút ở một lỗi thì dừng và ghi handoff.
