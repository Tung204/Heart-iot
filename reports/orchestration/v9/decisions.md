# v9.1 — quyết định lát cắt "tổng hợp tuân thủ chăm sóc"

Ngày 20/11/2026. Tiếp sau v8 (lịch nhắc + phiếu đi khám). Phạm vi lát cắt này chỉ là **V9.1** trong `docs/14` mục 14; V9.2 (nhắc chủ động, bản tin), V10–V12 chưa mở.

## Phạm vi

| Việc | Trong lát cắt | Ghi chú |
| --- | --- | --- |
| Tổng hợp 7/30 ngày theo lịch nhắc | **Có** | Chỉ đọc; không tạo thông báo/incident |
| Khoảng hiệu lực của lịch nhắc | **Có** | Để tắt/bật lại không làm sai lịch sử |
| Lưu trữ mềm khi xoá lịch | **Có** | Giữ completion; xoá cứng để V12 |
| Seed completion mẫu | **Có** | Chỉ dữ liệu tổng hợp, idempotent |
| Nhắc chủ động/bản tin (V9.2) | **Không** | Chưa có scheduler/notification subject-level |
| Web Push, AI, thiết bị | **Không** | Ngoài phạm vi |
| Đổi nav/luồng chia sẻ | **Không** | Giữ nguyên 4 mục và quyền hiện tại |

## Quyết định

- **V9.1-1 — Thứ tự:** làm V9.1 trước V9.2/V10. Đây là phần đọc, ít rủi ro, tạo dữ liệu nền cho bản tin và nhắc chủ động sau này.
- **V9.1-2 — Quyền:** dùng lại `canViewMeasurements` như trang `/app/care` hiện tại. **Không** thêm `canViewCare` ở lát cắt này; D3 trong `docs/14` vẫn mở và sẽ xử lý ở V9.2 (khi có bản tin/quy tắc chủ động). Lý do: v8 đã chia sẻ nội dung lịch nhắc dưới quyền này; V9.1 chỉ tổng hợp thêm, không mở loại dữ liệu mới. Nếu D3 chốt khác, đổi endpoint + UI trước khi code.
- **V9.1-3 — Định nghĩa tuân thủ:** hai tỉ lệ tách biệt, không gộp "chưa ghi nhận" vào "không làm":
  - `tỉ lệ ghi nhận = (done + skipped) / scheduled`
  - `tỉ lệ hoàn thành = done / (done + skipped)`
  - `scheduled = done + skipped + pending`; chỉ tính occurrence **đã qua** (mốc giờ địa phương ≤ hiện tại). Tỉ lệ là số nguyên 0–100, `null` khi mẫu số 0.
- **V9.1-4 — Ngày giờ:** mọi tính toán theo `subject.timezone`; `from = hôm nay - (days - 1)`, `to = hôm nay`; `days` 1–30, UI mặc định 7 và có 30. Dùng `localDateKey`, `addDays`, `isoWeekday`, `zonedToUtc` hiện có; không tự viết lại quy đổi múi giờ.
- **V9.1-5 — Khoảng hiệu lực:** thêm bảng `care_reminder_periods` thay vì chỉ dựa vào cờ `active`. Lý do: tắt rồi bật lại mà không có mốc sẽ khiến lịch sử sai. Khi tạo: mở khoảng từ `startsOn` (người dùng backdate thì lịch sử trước hôm nay cũng thuộc lịch, có thể chưa có đánh dấu). Khi tắt: đóng khoảng ở hôm nay (ngày tắt vẫn tính). Khi bật lại: nếu khoảng gần nhất đóng ở hôm nay thì mở lại, nếu không thì tạo khoảng mới từ hôm nay. `startsOn`/`endsOn` vẫn là biên toàn cục.
- **V9.1-6 — Xoá lịch:** `DELETE` chuyển thành **lưu trữ mềm** (`archived_at`), giữ completion; danh sách và “hôm nay” ẩn lịch đã lưu trữ; adherence vẫn tính lịch sử trong kỳ. Không mở endpoint khôi phục ở lát cắt này. Xoá cứng chỉ trong luồng xoá dữ liệu (V12). Đây là thay đổi hành vi so với v8 (đang cascade xoá completion) — ghi rõ trong docs/02 và README API.
- **V9.1-7 — Backfill:** migration tạo khoảng cho reminder cũ bằng xấp xỉ `active_from = starts_on`, `active_to = null` nếu đang active, ngược lại `= greatest(starts_on, updated_at::date)`. Ngày dùng UTC của DB, chỉ là xấp xỉ một lần; ghi chú trong handoff.
- **V9.1-8 — Seed:** thêm completion mẫu cho 3 ngày gần nhất (chỉ ngày lịch có hiệu lực và đúng thứ), idempotent theo unique key; không seed dữ liệu sức khỏe thật. Cập nhật test seed idempotent.
- **V9.1-9 — Không suy diễn y khoa:** không thêm câu “quên”, “không tuân thủ”, “nguy cơ”; UI dùng “chưa ghi nhận”. Không thêm trường liều lượng.

## Không được báo là đã làm

- Nhắc chủ động, bản tin, Web Push, leo thang cảnh báo.
- Xoá cứng/retention/backup.
- Đồng bộ với thiết bị hoặc firmware.
- Đánh giá độ hữu ích với người cao tuổi/bác sĩ.

## Bước tiếp

1. Backend theo `specs/backend-adherence.md`.
2. Web theo `specs/web-adherence.md` (sau khi backend hợp nhất).
3. Review độc lập phần quyền/ngày giờ; chốt D3 trước V9.2.
