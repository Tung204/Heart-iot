# Handoff — wave2-be-ai

- **Thời điểm:** 2026-11-14 (Asia/Ho_Chi_Minh), wave 2
- **Worker:** be-ai
- **Vùng ghi:** `packages/contracts/src/assistant.ts`, `apps/api/src/assistant/**`, `apps/api/test/assistant.spec.ts`, file này. Không sửa gì ngoài vùng (app.module.ts, schema.ts, module khác, web, docs, .env giữ nguyên).

## Đã làm

### Hợp đồng (`packages/contracts/src/assistant.ts`)

- `assistantSummarySchema`: `subjectId`, `periodStart`, `periodEnd`, `generatedAt`, `status: 'ready'|'degraded'`, `provider: 'template'|'openai-compatible'`, `model: string|null`, `headline` (≤300), `sections` (`kind: 'measurements'|'alerts'|'tasks'|'note'`, `title` ≤140, `body` ≤3000, `facts` ≤30 mục `{label,value(string|number),unit?,sourceRef?}`), `disclaimer` là `z.literal(ASSISTANT_DISCLAIMER)`, `sources` (`{type: measurements|incidents|maintenance_tasks, id?, label, at?}`), `degradedReason: string|null` (bổ sung so với liệt kê prompt để fallback có lý do trong response).
- `ASSISTANT_DISCLAIMER = 'Thông tin tổng hợp từ dữ liệu thiết bị, không phải chẩn đoán y khoa.'` — hằng số xuất khẩu, API và web dùng chung.
- `assistantAskSchema` (`question` trim 3..500, strict), `assistantAnswerSchema` (`answer` ≤4000, `status`, `provider`, `model`, `disclaimer` literal, `sources`, `degradedReason?`), `assistantSummaryQuerySchema` (`from`/`to` ISO tùy chọn).
- **Không có** trường chẩn đoán/y khoa nào trong schema.

### `apps/api/src/assistant/` (AssistantModule)

- `assistant-adapter.ts`: token `ASSISTANT_AI_ADAPTER` + interface `AssistantAiAdapter` (`isConfigured()`, `complete(messages)`) để test override bằng fake; `OpenAiCompatibleAdapter` gọi `{AI_BASE_URL}/chat/completions` bằng `fetch` + AbortController **timeout 10s** (hằng số `ASSISTANT_AI_TIMEOUT_MS`); `AI_API_KEY` chỉ đọc từ env, không vào log/exception (lỗi mạng bị che thành message chung); lỗi phân loại `AssistantAdapterError` (`timeout|http_error|invalid_response`).
- `assistant.service.ts`:
  - `getSummary`: window mặc định **7 ngày**, tối đa **31 ngày** (422 khi vi phạm); kiểm quyền `requireHistory` (người ngoài → **404**, `from` ngoài lịch sử chia sẻ → **403**) rồi `assertAction('view_ai')` (caregiver thiếu → **403**). Khi không truyền `from`, khoảng mặc định bị kẹp theo `effectiveFrom` (không vượt quyền lịch sử). Tổng hợp **số liệu thật** từ `telemetry`/`incidents`/`maintenance_tasks`: số mẫu, HR chỉ mẫu `quality.heart_rate === 'valid'` (min/avg/max, **null khi không có mẫu hợp lệ** — không bịa 0), pin mẫu gần nhất, số bước (tổng delta dương theo boot), cảnh báo theo trạng thái (**loại trừ `suspected`** chưa xác nhận), cảnh báo gần nhất, task đang mở. Chỉ đọc DB trực tiếp — **không import IncidentsService/ingest**, không chạm đường cảnh báo.
  - Có `AI_BASE_URL` → gọi adapter với **chỉ facts tổng hợp** + nhãn "hồ sơ được theo dõi" (không email, không tên, không telemetry thô); system prompt cấm chẩn đoán/kê đơn/bịa số, yêu cầu tiếng Việt + JSON. Model trả JSON sai/thiếu → **fallback template, không 500**. Không cấu hình/lỗi/timeout → template `status='degraded'`, `provider='template'`, `model=null`, `degradedReason` rõ lý do.
  - Nội dung model được strip HTML, cắt độ dài (headline 300, title 140, body 3000, answer 4000, fact value 200) trước khi parse qua zod.
  - Lưu `ai_summaries` mọi lần (content + aggregate + sourceRefs; provider/model; period). **Không lưu prompt, không lưu API key.**
  - `ask`: cùng kiểm quyền (7 ngày gần nhất); **chặn trước khi gọi model** câu hỏi ngoài dữ liệu (từ khóa chẩn đoán/kê đơn/thuốc/điều trị/nguy cơ/dự đoán/tiên lượng + tiếng Anh) → từ chối lịch sự + gợi ý hỏi số liệu; template fallback cũng từ chối. Rate limit **10 câu/5 phút/user trong bộ nhớ một tiến trình** → 429 `RATE_LIMITED`, details ghi rõ `scope: 'single_process_memory'`.
  - Audit `assistant.summary` (metadata chỉ `{periodStart, periodEnd, provider, status}`) và `assistant.ask` (metadata chỉ `{provider, status, degradedReason?}`) — không nội dung sức khỏe, không câu hỏi, không secret.
- `assistant.controller.ts` + `assistant.module.ts`: `GET /subjects/:id/assistant/summary`, `POST /subjects/:id/assistant/ask` (HttpCode 200), guard `SessionGuard`, validate bằng `ZodValidationPipe`, response parse qua zod. Module imports `AuthModule`; adapter đăng ký qua token.
- **Không sửa `app.module.ts`** (thuộc lead nối module); test dùng `createModuleTestApp`-style riêng.

## Kiểm đã chạy (kết quả thật)

| Lệnh (thư mục) | Kết quả |
| --- | --- |
| `cd packages/contracts && pnpm build` | exit 0, sinh `dist/assistant.js` + `.d.ts` |
| `cd apps/api && pnpm typecheck` | exit 0 — sạch toàn repo |
| `cd apps/api && node --experimental-vm-modules node_modules/jest/bin/jest.js --runInBand test/assistant.spec.ts` | **1 suite, 13/13 tests pass** (~3.2s) |
| Hồi quy full: `node --experimental-vm-modules node_modules/jest/bin/jest.js --runInBand` | **12 suites, 86/86 pass** (~24.2s) |

Bao phủ đúng 8 nhóm yêu cầu của prompt: (1) owner xem summary đúng fixture (4 mẫu, HR 70/80/90, pin 55, bước 30, 1 cảnh báo open + 1 task) và HR null khi không mẫu hợp lệ; (2) caregiver thiếu `view_ai` → 403, người ngoài → 404, `from` ngoài lịch sử → 403, đủ quyền → 200; (3) không cấu hình AI → template degraded + spy chứng minh adapter không được gọi (không mạng); (4) fake adapter → provider/model đúng, prompt gửi model không chứa email/tên, lưu `ai_summaries`; (5) adapter lỗi/timeout/JSON sai → fallback 200 với `degradedReason` rõ, bản ghi `status='failed'`; (6) câu hỏi chẩn đoán/kê đơn → từ chối không bịa (kể cả khi AI sẵn sàng — không gọi adapter); (7) audit chỉ metadata đã lọc; (8) rate limit 429 từ câu thứ 11 + hai request summary đồng thời → 2 bản ghi, không lỗi.

## Quyết định cần lead chốt / giới hạn

1. **`ai_summaries.status`**: enum bảng chỉ có `ready|failed|superseded`, không có `degraded`; hiện degraded (fallback) lưu là `failed`. Nếu muốn phân biệt "chưa cấu hình" với "lỗi thật" cần đổi enum (schema.ts thuộc lead).
2. **Timeout AI**: prompt worker yêu cầu 10s; env `AI_TIMEOUT_MS` (mặc định 20s) hiện **không được dùng** cho assistant (hằng số 10s). Lead quyết giữ 10s hay nối lại config.
3. **Rate limit** là bộ nhớ một tiến trình (ghi rõ trong details response); nhiều instance sẽ không dùng chung — cần chốt giải pháp tập trung khi deploy nhiều tiến trình.
4. **Chặn câu hỏi ngoài phạm vi bằng từ khóa** (VN + EN) trước khi gọi model; ngoài ra tin system prompt của model. Đây là phòng thủ tầng 1, không phải phân loại ý định hoàn chỉnh (không dùng classifier).
5. `ask` không lưu nội dung câu hỏi/trả lời vào DB (chưa có bảng); chỉ audit metadata. Nếu cần lịch sử hội thoại phải thiết kế bảng + quyền riêng.
6. **Không nối `AssistantModule` vào `AppModule`** (thuộc lead); hiện module chạy độc lập qua test. Cần lead thêm vào `app.module.ts` để endpoint hoạt động trên app thật.
7. Prompt gửi model là tiếng Việt + JSON schema nội bộ; chưa có bộ đánh giá chất lượng trả lời (chưa chốt model thật).

## Rủi ro tích hợp

- `packages/contracts` export `./assistant` đã có sẵn trong `package.json` (không cần sửa); web có thể import ngay sau khi build contracts.
- Response summary/answer luôn parse qua zod ở controller — fe-ai cần khớp `assistantSummarySchema`/`assistantAnswerSchema`.
- `requireHistory` từ chối `from` sớm hơn mốc chia sẻ thay vì cắt im lặng (đúng semantics access service); caregiver `historyDays < 7` sẽ 403 ở `ask` (dùng cửa sổ 7 ngày cố định) — đây là hành vi theo "from ngoài history → 403", lead xác nhận có cần kẹp mềm không.
- Bản ghi `ai_summaries` được tạo cho **mọi** request summary (kể cả template fallback) — có thể nhiều bản ghi nếu UI gọi lại thường xuyên; chưa có cơ chế thay thế/dedup (cột `runId` để trống).
