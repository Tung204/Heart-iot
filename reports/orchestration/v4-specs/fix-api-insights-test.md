# Fix API test — insights coverage phụ thuộc giờ chạy

Base master `ced1c64`. Chỉ sửa `apps/api/test/insights.spec.ts` (và có thể thêm unit test cùng file); không sửa code API, seed, docs.

## Lỗi thật

`pnpm test` lúc 18:33 UTC fail:
```
insights.spec.ts:227 expect(todayDay.coverage.percent).toBeGreaterThan(0)
expectedCount > 0 nhưng percent = 0 vì 1 mẫu / ~4452 mẫu kỳ vọng, làm tròn 1 chữ số = 0.0
```
Đây là test phụ thuộc giờ: sáng sớm expectedCount nhỏ nên >0; cuối ngày = 0. Không phải code API sai. Không được nới thành `>=0` đơn thuần.

## Cách sửa

- Giữ nguyên assertion `observedCount=1`, `expectedCount>0`, `percent<=100`; thay `percent>0` bằng kiểm tra **công thức độc lập, tất định**: import `coverageCounts` từ `src/measurements/insights` và thêm test riêng với cửa sổ nhỏ (ví dụ 1 mẫu/10 kỳ vọng → 10%; 0 mẫu → 0; clamp 100).
- Trong test tích hợp, tính `expectedPercent = Math.min(100, Math.round((observed/expected)*1000)/10)` từ response và `expect(percent).toBe(expectedPercent)`; như vậy kiểm consistency, không phụ thuộc giờ.
- Không xóa test, không đổi fixture gốc; chạy `pnpm test -- test/insights.spec.ts` và toàn bộ `pnpm test` (218 test) phải xanh.
- Commit branch riêng; handoff `reports/handoffs/fix-api-insights-test.md`; không merge.
