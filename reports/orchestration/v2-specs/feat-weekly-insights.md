# Feature worker — feat-weekly-insights

Bạn là **feature worker** trên worktree riêng, làm một phần dọc (API + UI + test), không làm cả sản phẩm.

Trước khi làm: đọc `AGENTS.md`, `docs/02`, `docs/03`, `docs/04`, `docs/06`, `docs/12`, `docs/14`, code liên quan, `git log -3`.
Chạy `pnpm install --prefer-offline --frozen-lockfile` và `pnpm --filter @annhien/contracts build` nếu worktree chưa có dependency/dist. HEAD đã có contract nền; không sửa contract ngoài file được giao, không sửa migration.

Quy tắc: chỉ sửa vùng được giao; **không** sửa `apps/api/src/app.module.ts`, `apps/web/src/app/router.tsx`, `apps/web/src/app/AppShell.tsx`, `apps/web/src/styles/layout.css`, `tokens.css`, README/docs/HTML hoặc package export — lead sẽ nối. Không sửa/xóa test hợp lệ để làm xanh; không bịa số liệu; không báo đã chạy nếu chưa chạy. Chạy test hẹp nhất + typecheck. Commit trên nhánh riêng, không merge master. Viết `reports/handoffs/v2-feat-weekly-insights.md` với file, lệnh/kết quả, quyết định, rủi ro, việc lead cần nối. Kết thúc báo cáo ngắn: commit hash, test counts, file cần nối, điểm chưa làm.

## Mục tiêu
Đưa **xu hướng 7/14/30 ngày** vào dashboard, dựa trên dữ liệu thật đã có, hiển thị cả ngày thiếu dữ liệu và nguồn mô phỏng; không chẩn đoán.

## Vùng được sửa
- `packages/contracts/src/insights.ts` (đã có; chỉ sửa nếu bất khả kháng)
- `apps/api/src/measurements/measurements.service.ts`, `measurements.controller.ts`, `measurements.module.ts`; có thể thêm `apps/api/src/measurements/insights.ts`
- `apps/api/test/insights.spec.ts` (mới)
- `apps/web/src/features/dashboard/DashboardPage.tsx`
- `apps/web/src/features/insights/**` (mới, gồm API/hook/component/css)
- Không sửa HistoryPage, chart dùng chung, layout.css.

## API
`GET /subjects/:id/insights?days=7|14|30` (mặc định 7, chỉ 7..30) trả `insightsResponseSchema`.
- Quyền: dùng `AccessService.requireSubject`; caregiver thiếu link → 404; **dữ liệu trước `sharedFrom`/historyDays bị cắt**, không rò rỉ; ngày hoàn toàn trước mốc chia sẻ có `hasData:false`, coverage 0/0, không 403 cả request.
- `days` ngày gần nhất kết thúc hôm nay theo timezone hồ sơ, đúng thứ tự cũ→mới; hôm nay chỉ tính tới hiện tại.
- Mỗi ngày: tim chỉ tính mẫu `heart_rate_quality === 'valid'` (không có → null), bước theo delta `steps_since_boot` (xử lý boot reset; nếu không đủ tin cậy → completeness `partial`/`unavailable`), coverage dùng cùng công thức policy hiện tại; incidents đếm theo `detectedAt` trong ngày.
- `hasData` chỉ true khi có ít nhất một mẫu đã đồng bộ trong cửa sổ; `source='synthetic'` nếu có bất kỳ mẫu synthetic.
- Summary: `dataDays`, `avgHeartRate` (weighted theo validSamples; null nếu không có), `totalSteps`, `avgCoveragePercent` (trung bình các ngày có expectedCount>0, 1 chữ số thập phân), incidents.
- `notes`: tối đa 3 câu ngắn, ví dụ ngày thiếu mẫu, dữ liệu mô phỏng; không suy diễn sức khỏe.
- Tránh N+1: một query telemetry + một query incidents cho cả cửa sổ; không gọi dailySummary 30 lần. Helper thuần cho gom ngày/bước để test; không thay đổi semantics endpoint measurements/daily-summary hiện có.

## UI
- Card "Xu hướng gần đây" trên dashboard, segmented 7/14/30 ngày (`aria-pressed`).
- Hiển thị 4 chỉ số tổng quan + biểu đồ cột/đường đơn giản bằng CSS/SVG, mỗi ngày có nhãn ngày, giá trị, `aria-label`; không chỉ dựa vào màu; ngày không dữ liệu có dấu "—" và chú thích, không vẽ 0.
- Chip "Dữ liệu mô phỏng" nếu có; dòng miễn trừ ngắn "Chỉ để theo dõi, không thay thế tư vấn y tế."
- Trạng thái tải/lỗi/rỗng có hành động (link sang Lịch sử); responsive 360/390/chữ lớn; không tràn ngang.
- Không thay đổi phần dashboard khác ngoài chèn card; giữ test cũ xanh.

## Kiểm thử tối thiểu
API: 7 ngày đúng số ngày/khoảng; 30 ngày; caregiver trước sharedFrom không thấy dữ liệu; ngày thiếu dữ liệu null/0 đúng; heart rate quality; boot reset; synthetic; unauthorized 401/ngoài 404; `days=6/31` 400.
Web: loading/empty/success/synthetic; đổi 7→30 gọi đúng query; ngày thiếu hiển thị "—"; accessible name; không crash khi null.
