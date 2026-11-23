# Tổng hợp outbox admin — bằng chứng

**Ngày:** 21/11/2026  
**Nhánh:** `v10-backend` (chưa merge/push)  
**Phạm vi:** backend only; không sửa UI.

## Đã làm

- Thêm `GET /admin/outbox/summary` (admin-only, chỉ đọc):
  - đếm theo trạng thái `pending|sending|sent|failed|superseded`;
  - đếm theo kênh `in_app|web_push` và kind `alert|update|escalation|care_digest|care_rule`;
  - `inFlight = pending + sending`;
  - `dueNow` = pending có `nextAttemptAt <= now`;
  - `oldestOpenAt` / `oldestOpenAgeSeconds` của bản ghi pending/sending cũ nhất.
- Không trả `title`, `body`, người nhận, endpoint, `lastError` hay nội dung sức khỏe.
- Không chạy worker, không sửa outbox, không ghi audit.
- Không cần migration.

## Hợp đồng

`packages/contracts/src/admin.ts`:

- `outboxStatusSchema`
- `adminOutboxCountsSchema`
- `adminOutboxChannelCountsSchema`
- `adminOutboxKindCountsSchema`
- `adminOutboxSummarySchema`

Mảng `byChannel` luôn đủ 2 kênh, `byKind` đủ 5 kind để dashboard không phải suy luận khoảng trống.

## Test

| Kiểm | Kết quả |
| --- | --- |
| `backend/test/admin.spec.ts` | **12/12 test pass** (thêm 1 test outbox) |
| Full API (22/11/2026) | **35 suite / 325 test pass** |
| Randomized `--seed=20261121` | **325/325 pass** |
| Typecheck toàn monorepo | pass |
| OpenAPI `pnpm openapi:check` | pass; 77 path/97 operation/104 schema |
| Docs `--check` | 373 liên kết / 296 ID / 22 mục (trước khi thêm link report) |

Test mới kiểm:

1. User thường gọi endpoint → 403.
2. Tổng/count theo trạng thái, kênh, kind đúng fixture.
3. `dueNow` chỉ đếm pending đã tới hạn; `inFlight` gồm pending + sending.
4. `oldestOpenAt` lấy bản ghi pending/sending cũ nhất.
5. Response không chứa title/body/người nhận/lỗi gửi.
6. Key top-level đúng tập đã công bố.

## Giới hạn

- Chỉ là ảnh chụp tại thời điểm gọi; không phải dashboard realtime, không tự cảnh báo khi outbox kẹt.
- Không thay worker/backoff hay kiểm gửi thật; chưa có UI admin.
- Chưa kiểm PostgreSQL thật, tải lớn hay nhiều tiến trình.
- Chưa có phân trang/chi tiết từng bản ghi; cố ý không trả nội dung thông báo.

## Nguồn

- `backend/src/admin/{admin.controller,admin.service}.ts`
- `backend/test/admin.spec.ts`
- `packages/contracts/src/admin.ts`
- `docs/04-du-lieu-va-giao-tiep.md`
