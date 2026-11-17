# v7 W2 — lane H: dữ liệu sức khỏe

Đọc `w2-common.md` trước. Cổng riêng: port **4353**.

## File được ghi

`features/dashboard/*`, `features/history/*`, `features/insights/*`, `components/MeasurementChart.tsx` + `.css` + test, `styles/health.css` (tạo nếu cần).

## Việc phải làm

1. **Dashboard/Sức khỏe**: query status/summary/open-alerts như hiện tại; cảnh báo không chờ summary/AI; null/coverage/source rõ; thêm gác quyền đã biết (không gọi API khi thiếu quyền — theo design §5.7); nhãn nguồn mô phỏng.
2. **History**: giữ `sharedFrom`/`historyDays`, clamp GET+CSV, phân trang 10/50/400, chỉ HR hợp lệ, một biến thể mobile, **giữ câu “Dữ liệu hiển thị là dữ liệu mô phỏng.”** cạnh khối dữ liệu/CSV; filter rõ, không mất lựa chọn khi back.
3. **Insights**: `keepPreviousData` phải ràng identity (không hiện insight hồ sơ cũ khi đổi hồ sơ); null/ngày thiếu; nguồn.
4. **Chart**: giữ dữ liệu/trục/tooltip hiện có, đọc được ở 360px và chữ lớn; không bịa điểm; empty state rõ.

## Giao diện

`design-system.md` §5.7. Số liệu chính đọc được trong viewport đầu; dạng hàng/vùng thay card kem; không gradient trang trí; màu cảnh báo không thay nghĩa chữ.

## Ảnh + đo

`/app/overview`, `/app/history`, `/app/history?days=30`, `/app/overview` (chữ lớn) × 1280/390/360. Đo: 1 H1, 1 context line, chart không tràn, target filter ≥44, CSV tải đúng khoảng, nhãn mô phỏng hiện.
