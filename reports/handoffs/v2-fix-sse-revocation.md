# Handoff — v2-fix-sse-revocation

- **Thời điểm:** 2026-11-15 (Asia/Ho_Chi_Minh), worktree `fix-sse-revocation`
- **Worker:** fix-sse-revocation (dispatch `task_9e9d9ec0a871`)
- **Nhánh:** `fix-sse-revocation` — commit code `1c46bb6b2df070c3c611a2bbbbbd6c8219d01bb4`,
  commit handoff riêng bên dưới (file này không nằm trong commit code).
- **Vùng ghi:** `apps/api/src/realtime/**`, `apps/api/src/auth/auth.service.ts` (chỉ thêm
  `isSessionActive`, không đổi phương thức/hành vi HTTP hiện có), `apps/api/test/sse.spec.ts`, file này.
  Không sửa `app.module.ts`, `apps/web/**`, `packages/contracts/**`, schema, docs.

## Finding gốc

QA v2 admin ops **P1-1** (spec `reports/orchestration/v2-specs/fix-sse-revocation.md`, đối chiếu
`docs/02` NFR-01 và `docs/03` dòng 88 “Thu hồi quyền phải ngắt stream”): stream SSE đang mở chỉ
kiểm lại care link mỗi vòng poll. Admin khóa tài khoản (revoke session trong cùng transaction) hoặc
phiên hết hạn **không** ngắt stream đang mở — người bị khóa vẫn nhận `alert.updated` tới hết
`SSE_MAX_DURATION_MS` (5 phút) hoặc tới khi care link bị thu hồi.

Tái hiện trước khi sửa: thêm test S2 (admin disable) và S3 (session hết hạn) → cả hai fail vì stream
chỉ nhận `alert.updated` rồi treo tới timeout 8s, không có `event: revoked` và không đóng.

## Đã làm

### `apps/api/src/auth/auth.service.ts`

- Thêm `isSessionActive(sessionId): Promise<boolean>`: join `sessions` với `users`, chỉ đúng
  `sessions.id`, yêu cầu `revoked_at IS NULL`, `expires_at > now()` **và** `users.status = 'active'`.
  Truy vấn theo primary key `sessions.id`; chỉ trả boolean, không log token/sessionId, không ném lỗi
  nghiệp vụ. Không đổi `resolveSession`/`logout`/`revokeSession` hay HTTP hiện có.

### `apps/api/src/realtime/`

- `realtime.controller.ts`: route đã qua `SessionGuard`, lấy `sessionId` từ
  `AuthenticatedRequest` do guard gắn; thiếu (bất thường) → 401 trước khi flush header. Truyền
  `sessionId` vào `RealtimeService.stream`.
- `realtime.service.ts`: mỗi vòng poll (theo `pollMs` hiện có, không theo từng event):
  1. `auth.isSessionActive(sessionId)` — session revoked/hết hạn hoặc user không `active` →
     `event: revoked` (`data: {}`) rồi đóng stream (finally `res.end()`);
  2. `access.requireAction(userId, subjectId, 'receive_alerts')` — giữ nguyên hành vi thu hồi care
     link cũ, dùng chung frame revoked;
  3. chỉ sau đó mới query `realtime_events` và ghi event.
- `realtime.module.ts`: `imports: [AuthModule]` để DI `AuthService` (không tạo vòng import;
  `AppModule` đã import cả hai nên dùng chung instance).
- Frame revoked thống nhất `event: revoked\ndata: {}\n\n` — không lý do, không sessionId, không dữ
  liệu sức khỏe. Không thêm log nào trong vòng stream.

### Tải và phạm vi kiểm

- Thêm đúng **1 truy vấn/stream/vòng poll** (join theo PK session) so với trước; không query thêm
  cho từng event, không đổi `pollMs`, `heartbeatMs`, `maxDurationMs`.
- Vẫn kiểm care link mỗi vòng như cũ; thứ tự kiểm session/status trước để khóa tài khoản có hiệu lực
  ngay cả khi care link còn `active`.

### Test (`apps/api/test/sse.spec.ts`, 6 test)

Viết lại harness: server `listen(0)` một lần trong `beforeAll`, `pollMs = 40`, helper `openSse` đọc
khung SSE bằng `fetch` thật (timeout mỗi lần đọc 8s), `postAlert` gửi candidate+confirmed.

- **S1** — caregiver nhận `alert.updated` (có `id:` cho Last-Event-ID); thu hồi care link →
  `event: revoked`, stream đóng; alert gửi sau đó không xuất hiện.
- **S2** — caregiver đang mở stream → admin `PATCH /admin/users/:id/status {status:'disabled'}` →
  session của user bị revoke trong DB, stream nhận `event: revoked` payload đúng `{}`, đóng; text
  không chứa id session nào; alert sau khi khóa không tới.
- **S3** — phiên hết hạn giữa stream (`expires_at` về quá khứ) → revoked + đóng.
- **S4** — chỉ đổi `users.status='disabled'` trực tiếp (không revoke session) → vẫn revoked + đóng
  (chứng minh nhánh kiểm status, không chỉ session).
- **S5** — owner bình thường nhận 2 alert liên tiếp, qua vài vòng poll không có revoked.
- **S6** — không cookie → 401; không có link → 404; có link nhưng `canReceiveAlerts=false` → 403
  trước khi mở stream (giữ hành vi cũ).

## Bằng chứng chạy

Đã cài dependency (`pnpm install --frozen-lockfile`) và build contracts (`pnpm build:contracts`)
trong worktree trước khi chạy.

| Lệnh (trong `apps/api`) | Kết quả |
| --- | --- |
| `pnpm test -- sse.spec.ts` **trước khi sửa** | 2 fail (S2, S3 timeout chờ revoked), 3 pass |
| `pnpm test -- sse.spec.ts` sau khi sửa | **6/6 pass**, ~6s |
| `pnpm test -- auth.spec.ts admin.spec.ts` | **13/13 pass**, 2 suite |
| `pnpm typecheck` | pass (tsc `--noEmit`) |
| `pnpm test` (toàn bộ API) | **104/104 pass**, 14 suite, ~82s |

Không chạy web/E2E (ngoài phạm vi, không đổi hành vi web).

## Rủi ro / lưu ý cho lead

1. **Chi phí query:** thêm 1 query poll/stream (mặc định 1s) trên bảng `sessions` theo PK + join
   `users`. Với số stream đồng thời lớn cần đo tải thật; nếu cần có thể gộp kiểm session vào truy vấn
   access, nhưng sẽ làm service phụ thuộc schema auth — chưa làm trong fix này.
2. **Phạm vi session:** chỉ kiểm đúng `sessionId` đã mở stream; các session khác của cùng user còn
   hiệu lực vẫn dùng được (đúng ngữ nghĩa thu hồi theo phiên). Admin disable revoke mọi session nên
   mọi stream của user đều đóng.
3. **Client:** web đã xử lý `revoked` (`apps/web/src/features/realtime/{sse.ts,useSubjectEvents.ts}`)
   nên không cần sửa web. Tuy nhiên thông báo UI hiện là “Quyền xem hồ sơ … đã bị thu hồi”; khi
   nguyên nhân là tài khoản bị khóa, câu chữ này có thể gây hiểu nhầm — đề xuất P3 cho phiên web.
4. **Đồng bộ thời gian:** hết hạn dùng `new Date()` của API như `resolveSession` hiện có; không đổi
   sang `now()` của DB để giữ nhất quán.
5. **Tài liệu:** `docs/02` NFR-01, `docs/03` (ngắt stream khi thu hồi), `docs/08` T-01/T-02 đã mô tả
   đúng hành vi mong muốn; không sửa docs trong phạm vi fix này. Nếu lead muốn nêu rõ “session/khóa
   tài khoản” bên cạnh “thu hồi quyền”, cần một sửa docs riêng và build lại HTML (`tools/docs`).
6. **Báo cáo QA gốc:** `reports/qa/v2-admin-ops.md` chưa có trong worktree tại thời điểm làm (chỉ có
   spec); finding P1-1 được đối chiếu theo spec và code, không trích số trang báo cáo.
