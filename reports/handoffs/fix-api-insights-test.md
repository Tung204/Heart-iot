# Handoff — sửa test insights phụ thuộc giờ

- Base: master `ced1c64`; branch `fix-api-insights-test`; **không merge**.
- Worker bị lead dừng sau khi đã sửa test nhưng chưa commit; lead chạy lại test đích và commit phần đã sửa, không thêm code.

## Vì sao

`insights.spec.ts:227` cũ yêu cầu `coverage.percent > 0` với 1 mẫu. `expectedCount` phụ thuộc giờ chạy; cuối ngày 1/~4452 làm tròn 1 chữ số = 0.0 → test đỏ dù API đúng. Sáng sớm test xanh, chiều tối đỏ.

## Sửa

- Bỏ ngưỡng thời gian; kiểm consistency: `percent === min(100, round1(observed/expected*100))` từ response.
- Thêm unit test tất định cho `coverageCounts`: 1/10 = 10%, 0 = 0, vượt = 100.
- Không xóa test, không nới assertion khác, không sửa API.

## Kiểm

```text
apps/api $ pnpm test -- test/insights.spec.ts
Test Suites: 1 passed, 1 total
Tests: 9 passed, 9 total
```

Chưa chạy lại toàn bộ 218 test trên nhánh này (worker bị dừng); lead sẽ chạy trên master sau merge.
