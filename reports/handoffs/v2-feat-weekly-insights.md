# Handoff — v2 / feat-weekly-insights (xu hướng 7/14/30 ngày)

- **Thời điểm:** 2026-11-15 07:17 (Asia/Ho_Chi_Minh)
- **Nhánh/worktree:** `feat-weekly-insights`
- **Commit code:** `1ba3127a61c3e62cc9cc0ddaf75434a027334bb5`
- **Vùng ghi:** `packages/contracts/src/insights.ts` (không sửa), `apps/api/src/measurements/{insights.ts,measurements.service.ts,measurements.controller.ts}`, `apps/api/test/insights.spec.ts`, `apps/web/src/features/dashboard/DashboardPage.tsx`, `apps/web/src/features/insights/**`, file này.
- **Không sửa:** `app.module.ts`, `measurements.module.ts` (không cần), migration/schema, `router.tsx`, `AppShell.tsx`, `layout.css`, `tokens.css`, README/docs/HTML, package export, HistoryPage, chart dùng chung, contract sẵn có.

## Đã làm

### API — `GET /api/v1/subjects/:id/insights?days=7|14|30`

- `measurements.controller.ts`: route mới dùng `insightsQuerySchema` (contract sẵn có: mặc định 7, 7..30, strict) và trả `insightsResponseSchema.parse(...)`.
- `measurements.service.ts` → `insights(userId, subjectId, query)`:
  - `AccessService.requireHistory(userId, subjectId, null)` (gọi `requireSubject`): người ngoài/không có link → 404. Không truyền `from` nên **không 403** khi cửa sổ vượt quyền; `effectiveFrom` được dùng để cắt dữ liệu.
  - `buildInsightDayWindows(days, now, subject.timezone)` sinh đúng `days` ngày kết thúc hôm nay theo timezone hồ sơ, cũ→mới, dùng `zonedDayToUtcRange` (xử lý DST).
  - Truy vấn telemetry **một lần** cho cả cửa sổ (`measured_at` khác null, `>= max(ngày đầu, effectiveFrom)`, `<= now`), chỉ select `measuredAt, bootId, metrics, quality, source`; incidents **một lần** (`detected_at` trong cùng khoảng). Không gọi `dailySummary` lần nào.
  - Ngày đang diễn ra: `windowTo = min(hết ngày, now)`. Ngày hoàn toàn trước mốc chia sẻ: `hasData:false`, `heartRate:null`, bước `unavailable`, coverage `{0,0,0}`.
- `measurements/insights.ts` (helper thuần, test được):
  - `localDateKey`, `buildInsightDayWindows`, `findInsightWindow` (binary search, không tạo `Intl.DateTimeFormat` cho từng mẫu).
  - `coverageCounts` dùng **cùng công thức** với coverage hiện có; `computeCoverage` của `measurements.service.ts` được refactor gọi lại helper này (semantics daily-summary/measurements không đổi, test cũ xanh).
  - `insightHeartRate`: chỉ mẫu `heart_rate_quality='valid'` + bpm khác null; avg 1 chữ số thập phân; không có → null; không dùng spread `Math.min(...)` để tránh tràn stack ở cửa sổ lớn.
  - `aggregateStepsByWindow`: cộng delta `steps_since_boot` theo từng boot, gán cho ngày của mẫu mới hơn (boot qua nửa đêm vẫn nối tiếp). Counter giảm → bỏ delta âm + `partial`; khoảng mất mẫu > 4 nhịp tim (60s với policy 15s) → bỏ đoạn chênh lệch + `partial`; mẫu `motion_quality='sensor_error'` không tính; ngày không có mẫu tin cậy → `unavailable`; ngày có mẫu nhưng không suy ra delta dương → `partial`.
  - `buildDailyInsights`: incidents đếm theo `detectedAt` trong ngày (đã cắt theo mốc chia sẻ), `source='synthetic'` nếu ngày có bất kỳ mẫu simulator/synthetic.
  - `summarizeInsights`: `dataDays`, `avgHeartRate` weighted theo `validSamples` (null nếu không có), `totalSteps`, `avgCoveragePercent` trung bình các ngày `expectedCount>0` (1 chữ số), incidents, `syntheticDays`.
  - `buildInsightNotes`: tối đa 3 câu ngắn, ưu tiên: ngày thiếu mẫu → dữ liệu mô phỏng → bước ước tính một phần → ngày không có nhịp tim hợp lệ (câu thứ 4 bị cắt). Không suy diễn sức khỏe.

### Web — card “Xu hướng gần đây” trên dashboard

- `features/insights/api.ts`: `fetchInsights` + parse `insightsResponseSchema`.
- `features/insights/useInsights.ts`: query key cục bộ `['subjects', id, 'insights', days]`, `enabled` theo hồ sơ, `staleTime: 30_000`, `keepPreviousData` khi đổi khoảng.
- `features/insights/RecentInsightsCard.tsx`:
  - Segmented 7/14/30 dùng lại class `segmented` chung, `aria-pressed`, group có nhãn “Khoảng thời gian xu hướng”.
  - 4 chỉ số: nhịp tim TB, tổng bước, ngày có dữ liệu `x/y`, độ phủ TB; dòng cảnh báo trong kỳ (tổng/đã đóng).
  - Biểu đồ cột CSS cho nhịp tim trung bình/ngày: mỗi ngày có nhãn ngày `dd/MM`, giá trị, `aria-label` đầy đủ; ngày thiếu hiển thị “—” (không vẽ cột 0), caption giải thích; biểu đồ cuộn ngang trong card khi nhiều ngày.
  - Chip “Dữ liệu mô phỏng” khi `syntheticDays > 0`, dòng “Chỉ để theo dõi, không thay thế tư vấn y tế.” luôn hiển thị ở trạng thái có dữ liệu/rỗng.
  - Trạng thái tải (role=status), lỗi (role=alert + “Thử lại” + link Lịch sử), rỗng (`EmptyState` + link `/app/history`); không crash khi `heartRate`/`avgHeartRate` null.
- `features/insights/insights.css`: CSS riêng của feature (tokens sẵn có), grid tự co, biểu đồ cuộn trong khung, không sửa `layout.css`.
- `DashboardPage.tsx`: chỉ thêm import + `<RecentInsightsCard subjectId={subjectId} />` trong nhánh dashboard đã tải xong, ngay sau grid “Tổng hợp hôm nay/Thiết bị”. Không đổi phần khác; card không tự gọi API khi dashboard đang lỗi/tải.

### Test đã thêm

- `apps/api/test/insights.spec.ts` (7 test): 7 ngày mặc định/đúng khoảng; timezone hồ sơ (+07) khác ngày UTC; 14/30 ngày; `days=6/31/0/-1/abc` + query lạ → 400; 401/404; caregiver `sharedFrom` giữa ngày và `historyDays=1` bị cắt (không 403, không rò rỉ HR/incident trước mốc, coverage ngày chia sẻ = 2880); heart rate quality + incidents + synthetic; boot reset/gap/một mốc/sensor_error; helper coverage 5760/50%/tối thiểu 1.
- `apps/web/src/features/insights/RecentInsightsCard.test.tsx` (8 test): loading, empty, success (4 chỉ số + aria-label từng ngày + “—” không vẽ 0), synthetic chip, đổi 7→30 gọi đúng `?days=30` + `aria-pressed`, null không crash, lỗi + thử lại + link Lịch sử, không có hồ sơ → không gọi API.

## Kiểm đã chạy (kết quả thật)

| Lệnh | Kết quả |
| --- | --- |
| `pnpm install --prefer-offline --frozen-lockfile` | exit 0, +711 packages, 33s |
| `pnpm --filter @annhien/contracts build` | exit 0 |
| `pnpm -r typecheck` (root) | exit 0 — contracts, api, web, simulator đều Done |
| `cd apps/api && node --experimental-vm-modules node_modules/jest/bin/jest.js --runInBand test/insights.spec.ts` | **1 suite, 7/7 passed** |
| `cd apps/api && ... test/insights.spec.ts test/measurements.spec.ts` | **2 suites, 14/14 passed** |
| `cd apps/api && ... --runInBand` (toàn bộ) | **15 suites, 107/107 passed**, ~114s |
| `cd apps/web && npx vitest run` | **21 files, 81/81 passed** |
| `cd apps/web && pnpm build` | exit 0, Vite build thành công |
| Preview Playwright (script tạm, mock API, Vite dev cổng 5180) | 1280×900, 390×844, 360×740, 390/360 + chữ lớn: `documentElement.scrollWidth === innerWidth` (overflow 0), biểu đồ chỉ cuộn trong khung; bấm 30 ngày → `aria-pressed=true` |

Preview dùng response mock (không chạy API/DB thật) và script/screenshot nằm ở `C:/Users/nguye/AppData/Local/Temp/insights-preview/` — **không commit**. Chưa chạy E2E với API + PGlite thật.

## Quyết định

1. **Cắt quyền thay vì 403** cho cả cửa sổ: dùng `requireHistory(..., null)` lấy `effectiveFrom`, truy vấn bắt đầu từ `max(ngày đầu, effectiveFrom)`; ngày trước mốc vẫn có mặt với dữ liệu rỗng. Đúng yêu cầu v2 và không làm lộ sự tồn tại của mẫu cũ.
2. **`days` ngoài 7..30 trả 400** theo đúng spec v2. Các endpoint khác trong repo dùng `ZodValidationPipe` → 422; đây là điểm **khác quy ước toàn cục**. Muốn đồng nhất 422 chỉ cần thay khối `safeParse` trong controller bằng `@Query(new ZodValidationPipe(insightsQuerySchema))`.
3. **Bước gán theo ngày của mẫu mới hơn**, không chia đôi delta qua nửa đêm. Khoảng mất mẫu > 4 nhịp tim bị bỏ và đánh dấu `partial` (không dồn toàn bộ chênh lệch vào ngày nhận) — bám docs/04.
4. **Ngày không có mẫu nhưng trong quyền** vẫn có `expectedCount` theo policy (ví dụ 5760), `observedCount: 0`, `percent: 0`; chỉ ngày hoàn toàn trước mốc chia sẻ mới `0/0` theo yêu cầu.
5. **Coverage dùng một nguồn công thức** (`coverageCounts`) để insights và daily-summary không lệch; đã refactor `computeCoverage` của service, không đổi semantics.
6. **Chỉ số biểu đồ là nhịp tim trung bình/ngày.** Bước có trong 4 chỉ số tổng và trong notes/aria-label; chưa vẽ biểu đồ bước riêng (xem “Chưa làm”).
7. **Notes tối đa 3** theo đúng spec; nếu đã có 3 câu (thiếu ngày, mô phỏng, bước partial) thì câu “ngày không có nhịp tim hợp lệ” không xuất hiện.
8. **Query key cục bộ** trong `features/insights/useInsights.ts` vì `lib/query.ts` ngoài vùng được sửa; lead có thể chuyển sang `queryKeys.insights`.
9. Không cần sửa `measurements.module.ts`: route nằm trong controller/service đã đăng ký; `MeasurementsModule` đã có trong `AppModule`.

## Rủi ro / giới hạn

- **Hiệu năng/memory:** 30 ngày × heartbeat 15s ≈ tối đa 172.800 mẫu trong một query (đã select cột hẹp). Chưa aggregate trong SQL; PGlite một tiến trình. Chấp nhận cho demo, cần đo/đổi sang aggregate SQL nếu dùng dữ liệu thật dài ngày.
- **Phân bổ bước theo ngày là xấp xỉ:** delta của khoảng vắt qua nửa đêm tính vào ngày của mẫu sau; gap dài bị bỏ (under-count) và đánh dấu `partial`. Không bịa bước, nhưng tổng có thể thấp hơn thực tế.
- **Mẫu có `measured_at > now`** (lệch đồng hồ thiết bị) bị loại khỏi cửa sổ để tôn trọng “hôm nay chỉ tính tới hiện tại”; thiết bị lệch giờ nhiều có thể bị ẩn mẫu.
- **400 vs 422** như trên — cần lead chốt.
- **Incidents** đếm mọi trạng thái (kể cả `suspected`/`cancelled`) theo `detectedAt`, giống `dailySummary`; nếu muốn loại `suspected` như danh sách cảnh báo/trợ lý thì phải sửa cả daily-summary để nhất quán.
- **Synthetic theo ngày:** ngày không có mẫu luôn `source='device'`; card dựa `summary.syntheticDays` để hiện chip.
- **UI:** đã kiểm bằng mock + CSS, chưa kiểm với API thật/E2E, chưa kiểm screen reader thật hay người cao tuổi. Biểu đồ chỉ có một series (nhịp tim); giá trị bước/ngày không hiển thị trực quan từng ngày.
- **Preview/chấp nhận:** đây là thay đổi frontend trên nhánh; theo AGENTS cần lead/người dùng xem preview trước khi coi là “áp dụng chính thức”.

## Việc lead cần nối / quyết định

1. **Không cần nối module/route**: merge là endpoint và card hoạt động (đã kiểm bằng mock). Không thêm dependency, không migration.
2. Chốt **400 hay 422** cho query `days`; nếu 422, sửa 1 khối trong `measurements.controller.ts` và đổi 2 assertion trong `insights.spec.ts`.
3. Cân nhắc thêm `queryKeys.insights` vào `lib/query.ts` và trỏ `useInsights` sang đó (hiện key cục bộ đúng format).
4. Cập nhật docs nguồn (`docs/06`, `docs/14`) + sinh lại `docs/html` bằng `tools/docs/build.py` — ngoài vùng worker được sửa.
5. Quyết định chính sách `suspected` cho incidents của cả insights và daily-summary nếu cần.
6. Xem preview 360/390/chữ lớn (screenshot tạm) và chấp nhận hướng biểu đồ một series trước khi coi là hoàn thiện UI.

## Chưa làm

- E2E/real-API run với PGlite + seed; chưa đo hiệu năng 30 ngày với dữ liệu dày.
- Biểu đồ riêng cho bước chân hoặc tooltip chi tiết từng ngày; chưa có bảng “chi tiết theo ngày”.
- Chưa kiểm screen reader/người dùng thật; chưa chụp/preview trên trình duyệt thật với API thật.
- Không sửa docs/HTML (đúng phân vùng).

## Báo cáo ngắn

- **Commit:** `1ba3127a61c3e62cc9cc0ddaf75434a027334bb5` (code).
- **Test:** API 107/107 (riêng insights 7/7), web 81/81 (riêng insights 8/8), typecheck toàn repo sạch, web build OK.
- **File cần nối:** không bắt buộc; endpoint đã nằm trong `MeasurementsModule` đang được `AppModule` import. Tùy chọn: `lib/query.ts` cho query key, docs/HTML, quyết định 400/422.
- **Chưa làm:** E2E/API thật, đo hiệu năng 30 ngày, biểu đồ bước riêng, kiểm trợ năng với người dùng thật.
