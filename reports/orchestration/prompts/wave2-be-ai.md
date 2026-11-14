# Prompt worker — be-ai (wave 2)

Bạn là **be-ai**, worker backend của dự án An Nhiên. Repo `C:/MyFolder/Hoc_Tap/project/DATN`.
Đọc prompt này rồi **thực thi ngay**, không chỉ lập kế hoạch.

## Bối cảnh bắt buộc đọc

1. `docs/11-nen-tang-ai-va-cau-hinh-dong.md` — ranh giới AI, quyền, audit.
2. `docs/13-dac-ta-thuc-thi-ai-va-cau-hinh.md` mục 2–5 — kiểm quyền trước khi gửi model,
   không để AI trên đường cảnh báo, kết quả phải phân biệt đề xuất/đã xác nhận.
3. `docs/02-yeu-cau-va-pham-vi.md` — FR liên quan trợ lý.
4. Code: `apps/api/src/access/access.service.ts`, `audit.service.ts`,
   `apps/api/src/incidents/incidents.service.ts`, `measurements/measurements.service.ts`,
   `database/schema.ts` bảng `ai_summaries`, `policy_configs`.
5. Hợp đồng `packages/contracts/src/assistant.ts` (đã khai báo export `./assistant`,
   chưa có file nguồn) và `package.json` exports.

## Vùng ghi

- `packages/contracts/src/assistant.ts`
- `apps/api/src/assistant/**`
- `apps/api/test/assistant.spec.ts`
- `reports/handoffs/wave2-be-ai.md`

**Không** sửa `app.module.ts`, `database/schema.ts`, module khác, `apps/web/**`, docs, HTML,
`.env`; không chạy `git`, không `pnpm add`, không đổi `.env` thật. Được đọc mọi file.

## Sản phẩm cần có

### 1. Hợp đồng (`assistant.ts`)

- `assistantSummarySchema`: `subjectId`, `periodStart`, `periodEnd`, `generatedAt`,
  `status: 'ready'|'degraded'`, `provider: 'template'|'openai-compatible'`, `model: string|null`,
  `headline` (1 câu), `sections` mảng có `kind: 'measurements'|'alerts'|'tasks'|'note'`,
  `title`, `body`, `facts` (mảng `{label,value,unit?,sourceRef?}`), `disclaimer` cố định,
  `sources` mảng `{type,id?,label,at?}`.
- `assistantAskSchema` (câu hỏi 3..500 ký tự, strict) và `assistantAnswerSchema`
  (`answer`, `status`, `provider`, `model`, `disclaimer`, `sources`, `degradedReason?`).
- Không đưa chẩn đoán/y khoa vào schema; không có trường "chẩn đoán".

### 2. Dịch vụ

- `GET /subjects/:id/assistant/summary?from&to` (mặc định 7 ngày, tối đa 31 ngày):
  - Kiểm quyền `AccessService.requireHistory` + `requireAction(..., 'view_ai')`;
    caregiver không có `view_ai` → 403; người ngoài → 404.
  - Tổng hợp **số liệu thật** từ `measurements`/`incidents`/`maintenance_tasks`:
    số mẫu, HR hợp lệ (min/avg/max), pin cuối, steps, số alert theo trạng thái, alert gần nhất,
    task đang mở. Không bịa mẫu; HR không có mẫu → null.
  - Gọi adapter AI **nếu** cấu hình `AI_BASE_URL` (OpenAI-compatible chat completions):
    timeout 10s, `AI_API_KEY` chỉ đọc từ env, không log; gửi **dữ liệu tổng hợp**, không gửi
    email/tên đầy đủ/số điện thoại, không gửi telemetry thô. Prompt hệ thống yêu cầu:
    không chẩn đoán, không kê đơn, không bịa số, chỉ dùng facts; trả lời tiếng Việt.
  - Không có cấu hình / lỗi / timeout → **fallback template xác định** từ facts,
    `status='degraded'`, `provider='template'`, `model=null`, `degradedReason` rõ ràng.
  - Lưu `ai_summaries` (content + aggregate + sourceRefs; provider/model; period).
    Không lưu prompt chứa email; không lưu API key.
  - Audit `assistant.summary` (không chứa nội dung sức khỏe, chỉ subjectId/period/provider/status).
- `POST /subjects/:id/assistant/ask` body `{question}`:
  - Cùng kiểm quyền; tổng hợp facts của 7 ngày gần nhất; gọi adapter với context facts.
  - Trả lời chỉ dựa trên facts; nếu câu hỏi ngoài dữ liệu (chẩn đoán, kê đơn, dự đoán nguy cơ)
    → từ chối lịch sự + gợi ý hỏi số liệu; template fallback cũng phải từ chối.
  - Không thực thi tool, không đọc/ghi dữ liệu khác, không gọi mạng ngoài adapter.
  - Giới hạn tần suất đơn giản theo user (ví dụ 10 câu/5 phút, trong bộ nhớ) → 429;
    ghi rõ đây là giới hạn một tiến trình.
- Adapter tách interface + provider token để test mock được. Không bắt buộc gọi mạng thật
  trong test; dùng fake adapter qua `Test.createTestingModule().overrideProvider`.
- Không import hay gọi `IncidentsService`/ingest từ module assistant theo cách có thể làm chậm
  hoặc chặn đường cảnh báo. Chỉ đọc DB.

### 3. An toàn

- Không đưa API key vào log/exception/audit.
- Không gửi toàn bộ hồ sơ sang model; chỉ facts tổng hợp + nhãn "hồ sơ" (không tên thật).
- Nội dung model trả về phải được giới hạn độ dài, strip HTML, không render như HTML.
- Nếu model trả JSON sai → fallback template, không 500.
- `disclaimer` cố định: "Thông tin tổng hợp từ dữ liệu thiết bị, không phải chẩn đoán y khoa."

## Kiểm phải chạy

```bash
cd packages/contracts && pnpm build
cd apps/api && pnpm typecheck
node --experimental-vm-modules node_modules/jest/bin/jest.js --runInBand test/assistant.spec.ts
```

Test tối thiểu:
1. Owner xem summary có số liệu đúng với fixture; HR null khi không mẫu hợp lệ.
2. Caregiver thiếu `view_ai` → 403; người ngoài → 404; from ngoài history → 403.
3. Không cấu hình AI → template + `degraded`, không gọi mạng.
4. Fake adapter trả lời → provider/model đúng, facts không chứa email/tên, lưu `ai_summaries`.
5. Adapter lỗi/timeout → fallback, không 500, `degradedReason` có lý do.
6. Câu hỏi đòi chẩn đoán/kê đơn → từ chối, không bịa.
7. Audit có bản ghi, metadata không chứa nội dung sức khỏe/secret.
8. Hai request cùng lúc (nếu dễ) → không tạo dữ liệu trùng; rate limit trả 429.

Ghi lệnh + kết quả thật vào `reports/handoffs/wave2-be-ai.md`. Nếu kẹt >15 phút ở một lỗi,
dừng và ghi handoff trung thực.
