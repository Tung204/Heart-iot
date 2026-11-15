# Handoff — v2-fix-ai-coverage (P2-2, F5, P2-8 một phần)

- **Ngày:** 2026-11-15 08:01 (Asia/Ho_Chi_Minh, UTC+7)
- **Worker:** fix-ai-coverage (dispatched), worktree `C:/Users/nguye/orca/workspaces/DATN/fix-ai-coverage`
- **Nhánh:** `fix-ai-coverage` (không merge/push)
- **Base:** `2b3a6ed docs(orchestration): spec AI coverage/gaps`
- **Commit code:** `1f20a16688bb45421f89b1c2db1b41ed0759f710` (`1f20a16`)
- **Nguồn finding:** `reports/qa/v2-product-gaps.md` P2-2; `reports/qa/v2-requirement-trace.md` F5; `reports/qa/v2-privacy-ethics.md` P2-8
- **Tài liệu đối chiếu:** `docs/07-tro-ly-ai.md` (coverage/missing_data/limitations, không suy luận “bình thường” từ dữ liệu thiếu), `docs/11-nen-tang-ai-va-cau-hinh-dong.md` (ranh giới AI, kiểm quyền, dẫn nguồn), `docs/06` mục AI

## Đã sửa

### 1. Hợp đồng `packages/contracts/src/assistant.ts`

Thêm `assistantDataQualitySchema` và field `dataQuality`:

- `coveragePercent` (0–100, làm tròn 1 chữ số thập phân)
- `observedCount`, `expectedCount` (số nguyên; expected tối thiểu 1 theo công thức coverage hiện hành)
- `gaps: { count, reasons }` — số khoảng thiếu + mã lý do `no_data | clock_unsynced | quarantined`, tối đa 3 mã
- `lastSeenAt` (ISO hoặc null)
- `synthetic` (boolean)
- `limitations` (mảng ngắn, tối đa 10)

`AssistantSummary` **bắt buộc** có `dataQuality` (response mới luôn trả); `AssistantAnswer` để **optional** vì nhánh từ chối câu hỏi ngoài phạm vi chưa đọc dữ liệu. Không đổi endpoint, không đổi field cũ, không thêm trường chẩn đoán/kê đơn. Khối này chỉ có số đếm, phần trăm, thời điểm, mã lý do — không có giá trị BPM/bước/pin thô.

### 2. Backend `apps/api/src/assistant/**`

- `assistant.service.ts`
  - `FactsAggregate` thêm `dataQuality`; aggregate gửi model có coverage/gaps/lastSeen/synthetic/limitations.
  - `gatherFacts` đọc policy `device_runtime` để dùng cùng `heartbeatIntervalSeconds` với measurements/daily-summary; đếm thêm mẫu `unsynced`/`quarantined` trong cửa sổ để gắn lý do khoảng thiếu.
  - Coverage dùng `coverageCounts` sẵn có (không sửa measurements); cửa sổ telemetry vẫn kẹp trần ở hiện tại, không kéo mẫu tương lai.
  - Khoảng thiếu dùng ngưỡng 1,5 nhịp tim kỳ vọng, cùng quy ước daily-summary.
  - `limitations` sinh theo: không có mẫu; coverage < 90%; có gap; gap ≥ 3; nguồn mô phỏng; không có HR hợp lệ; số mẫu bị cách ly.
  - Template: headline/body nêu `Chỉ từ X mẫu, độ phủ Y%, Z khoảng thiếu dữ liệu` khi thiếu; nêu `Dữ liệu mô phỏng` khi synthetic; thêm facts `Độ phủ dữ liệu`, `Số khoảng thiếu dữ liệu`, `Lần nhận cuối`, `Nguồn dữ liệu`.
  - Prompt provider (summary + ask) thêm quy tắc bắt buộc dùng `dataQuality`, không mô tả “bình thường”/“ổn định” khi thiếu, phải nêu “dữ liệu mô phỏng” và `lastSeenAt`.
  - Hậu kiểm tối thiểu nội dung model: khi thiếu dữ liệu, thay cụm “bình thường/ổn định” bằng “chưa đủ dữ liệu để kết luận” và chèn câu chất lượng xác định trước headline/body số liệu; answer cũng được chèn câu chất lượng.
  - Mọi nhánh `ask` đã đọc aggregate (không có dữ liệu / AI tắt / AI lỗi / AI trả lời) trả `dataQuality`; nhánh từ chối vì câu hỏi ngoài phạm vi giữ shape cũ.
- `assistant.module.ts`: import `PolicyModule` (module global sẵn có, không sửa `app.module`).

### 3. UI `apps/web/src/features/assistant/**`

- Thêm component `DataQualityPanel` hiển thị khối **“Chất lượng dữ liệu”**:
  - độ phủ `%` + `observed/expected mẫu kỳ vọng`
  - số mẫu đã nhận
  - số khoảng thiếu + lý do bằng chữ
  - lần nhận cuối hoặc “Chưa có mẫu”
  - nguồn: “Dữ liệu mô phỏng” / “Dữ liệu thiết bị”
  - `limitations` dạng danh sách; cảnh báo có tiêu đề chữ, không chỉ dựa vào màu
- Panel xuất hiện trong tóm tắt và trong câu trả lời có `dataQuality`; disclaimer cũ giữ nguyên ở cả hai.
- Không sửa `layout.css`; dùng class `ai-insight`/`ai-facts`/`ai-sources__list`/`Alert` sẵn có.

## Kiểm chứng

| Lệnh | Kết quả |
| --- | --- |
| `pnpm install --prefer-offline --frozen-lockfile` | 711 package, không lỗi |
| `pnpm --filter @annhien/contracts build` | pass |
| `pnpm --filter @annhien/contracts typecheck` | pass |
| `pnpm --filter @annhien/api typecheck` | pass |
| `pnpm --filter @annhien/web typecheck` | pass |
| `pnpm --filter @annhien/api test` | **18/18 suite, 172/172 test pass** |
| `pnpm --filter @annhien/web test` | **24/24 file, 124/124 test pass** |
| `pnpm --filter @annhien/web build` | pass (AssistantPage chunk 13.62 kB) |
| `git diff --check` | pass, không lỗi whitespace |

Riêng `assistant.spec.ts`: **23/23 test pass** (18 test cũ + 5 test mới/nhánh mới).

## Test mới/bổ sung

- `apps/api/test/assistant.spec.ts`
  1. Không có mẫu, cửa sổ 1 giờ → `dataQuality` 0%, observed 0, expected 240, 1 gap `no_data`, `lastSeenAt=null`; headline nêu “Chỉ từ 0 mẫu, độ phủ 0%, 1 khoảng thiếu dữ liệu”.
  2. Coverage thấp + 2 mẫu `simulator` → 0,8%, 3 gap, `synthetic=true`, lastSeen đúng; headline/body/facts ghi “Dữ liệu mô phỏng”.
  3. Dữ liệu đầy đủ (1/1 mẫu, không gap) → 100%, `limitations=[]`; headline/body không thêm cảnh báo hay câu “Chỉ từ”.
  4. Chỉ có mẫu `clock_status=unsynced` → 0 mẫu, gap `clock_unsynced`, không dùng mẫu.
  5. Fake provider:
     - prompt summary/ask chứa `dataQuality`, `coveragePercent`, `gaps`, `lastSeenAt`, `synthetic` và quy tắc “chỉ từ X mẫu…";
     - headline model có “bình thường” bị thay bằng “chưa đủ dữ liệu để kết luận”, câu chất lượng xác định được chèn trước;
     - answer cũng bị thay “bình thường” và có tiền tố chất lượng;
     - nhánh synthetic qua adapter ghi “Dữ liệu mô phỏng”.
  6. Test cũ vẫn giữ: caregiver thiếu `canViewAi` → **403**, người ngoài → 404, fallback template, disclaimer, audit đã lọc, rate limit.
- `apps/web/src/features/assistant/AssistantPage.test.tsx`
  - Fixture summary/answer có `dataQuality`.
  - Test mới: panel “Chất lượng dữ liệu”, độ phủ 0,8% + 2/240 mẫu, 3 khoảng (lý do chữ), nguồn mô phỏng, câu “Chỉ từ…”, `limitations`, disclaimer vẫn hiện.

## File thay đổi

- `packages/contracts/src/assistant.ts`
- `apps/api/src/assistant/assistant.module.ts`
- `apps/api/src/assistant/assistant.service.ts`
- `apps/api/test/assistant.spec.ts`
- `apps/web/src/features/assistant/AssistantPage.tsx`
- `apps/web/src/features/assistant/AssistantPage.test.tsx`
- `reports/handoffs/v2-fix-ai-coverage.md` (file này)

Không sửa measurements/incidents/`app.module`/router/`layout.css`, không đổi schema/migration.

## Rủi ro và việc còn lại

1. **Hậu kiểm model vẫn là guard chuỗi, không phải kiểm ngữ nghĩa:** chỉ thay “bình thường/ổn định” và chèn câu chất lượng; chưa đối chiếu số model nêu với aggregate, chưa phát hiện diễn giải y tế khác. P2-8 chỉ được xử lý một phần.
2. **`lastSeenAt` là mốc đo cuối trong cửa sổ yêu cầu**, không phải “lần nhận cuối ngoài cửa sổ”; khi cửa sổ không có mẫu thì null dù thiết bị từng gửi trước đó. Nếu cần nghĩa “lần nhận cuối toàn thời gian”, phải thêm truy vấn ngoài window và nhãn UI tương ứng.
3. **`synthetic` chỉ xét mẫu trong cửa sổ** (`simulator`/`synthetic`); cửa sổ rỗng trên hồ sơ từng có dữ liệu mô phỏng sẽ trả `false` + “không có mẫu”.
4. **Ngưỡng diễn đạt 90%/3 gap là hằng số trong service**, chưa cấu hình động. Đây là ngưỡng câu chữ, không phải ngưỡng y khoa; nếu muốn chỉnh theo hồ sơ/policy cần thiết kế riêng.
5. **Summary `dataQuality` là field bắt buộc mới**; client cũ chỉ đọc field cũ vẫn chạy, nhưng client validate strict cần biết field mới. `answer.dataQuality` là optional.
6. **Chưa chạy provider thật/E2E/đo p95**; mới kiểm fake adapter và test UI jsdom. Chưa cập nhật docs/HTML (ngoài phạm vi file được phép sửa).
7. Không backfill `ai_summaries` cũ; cột `aggregate` là jsonb nên không cần migration, nhưng bản ghi cũ không có `dataQuality` nếu có endpoint đọc lại trong tương lai.
8. Các P1 khác (suspected bị ẩn, bước 0/complete, thiếu liên hệ, badge đa hồ sơ, admin thiết bị, xóa/lưu trữ) không thuộc phạm vi task này.

## Trạng thái

- Code + test đã commit trên nhánh riêng `fix-ai-coverage`, chưa merge, chưa push.
- Sẵn sàng để lead review diff `1f20a16` và quyết định có đưa câu chất lượng vào chuẩn nội dung AI chính thức hay không.
