# Prompt worker — fe-features (wave 2)

Bạn là **fe-features**, worker frontend của dự án An Nhiên. Làm việc trong repo
`C:/MyFolder/Hoc_Tap/project/DATN`. Đọc prompt này, sau đó **thực thi ngay**, không chỉ lập kế hoạch.

## Bối cảnh bắt buộc đọc trước

1. `docs/06-trai-nghiem-va-man-hinh.md` — yêu cầu màn hình, khả năng tiếp cận.
2. `docs/14-ke-hoach-trien-khai-phan-mem.md` mục 6 — hợp đồng API.
3. Code hiện có của `apps/web/src` (fe-shell wave 1): `lib/api.ts`, `lib/query.ts`,
   `components/*`, `app/router.tsx`, `app/AppShell.tsx`, `features/auth/*`.
4. Hợp đồng thật trong `packages/contracts/src/*.ts` và controller API tương ứng.
   **Không tự đoán tên trường**: mở file schema zod và dùng type export từ đó.

## Vùng ghi được phép

- `apps/web/src/**` (trừ `apps/web/src/features/auth/**` — chỉ sửa nếu thật cần và ghi rõ).
- `apps/web/src/app/router.tsx`, `apps/web/src/app/AppShell.tsx`.
- `apps/web/e2e/**` (được thêm test E2E).
- `apps/web/README.md`, `reports/handoffs/wave2-fe-features.md`.

**Không** sửa: `apps/web/package.json`, `apps/web/tsconfig.json`, `vite.config.ts`,
`playwright.config.ts`, `apps/api/**`, `packages/contracts/**`, docs, HTML, root config.
Không chạy `git`, không `pnpm add`, không đổi `.env`, không ghi Obsidian.

## API đã có (đã kiểm bằng test, dùng đúng path `/api/v1`)

| Việc | Endpoint | Ghi chú |
| --- | --- | --- |
| Hồ sơ | `GET/POST /subjects`, `GET/PATCH /subjects/:id` | `@annhien/contracts/subjects` |
| Trạng thái | `GET /subjects/:id/status` | thiết bị + policy + asOf |
| Thiết bị | `GET /subjects/:id/devices`, `POST /subjects/:id/devices/claim`, `POST /devices/:id/release` | claim body `{claimCode}` |
| Đo lường | `GET /subjects/:id/measurements?from&to&limit&cursor` | `@annhien/contracts/measurements` |
| Tổng hợp ngày | `GET /subjects/:id/daily-summary?date=YYYY-MM-DD` | HR null nếu không mẫu hợp lệ |
| CSV | `GET /subjects/:id/export.csv?from&to` | tải file, cần quyền history |
| Cảnh báo | `GET /subjects/:id/alerts?state=open`, `GET /alerts/:id`, `POST /alerts/:id/acknowledge`, `POST /alerts/:id/resolve` | body ack `{expectedVersion}`, resolve `{expectedVersion,reason,outcome}` |
| SSE | `GET /subjects/:id/events` | `EventSource` với `withCredentials: true`; event `alert.updated`, `notification.sent`, `revoked` |
| Thông báo | `GET /notifications`, `POST /notifications/:id/read` | |
| Chia sẻ | `GET/POST /subjects/:id/invitations`, `GET /subjects/:id/care-links`, `DELETE /subjects/:id/care-links/:linkId`, `GET /invitations/:token`, `POST /invitations/:token/accept` | owner mới được mời/thu hồi |

Trang lời mời công khai đã có ở `/invite/:token` (fe-shell). Giữ nguyên route này.

## Phải làm (theo thứ tự ưu tiên)

### 1. Cảnh báo (quan trọng nhất)

- `/app/alerts`: danh sách alert đang mở (mặc định), lọc trạng thái, phân trang cursor;
  mỗi dòng: loại, hồ sơ, thời điểm phát hiện, trạng thái, nút "Xác nhận" / "Đóng".
  Cảnh báo mức cao phải nổi bật nhưng **không dùng màu làm tín hiệu duy nhất**.
- `/app/alerts/:id`: chi tiết + timeline event + người nhận + hành động ack/resolve
  (reason bắt buộc khi resolve, hiển thị lỗi 409 khi version cũ và cho tải lại).
- SSE: mở stream khi vào khu vực cảnh báo; cập nhật cache TanStack Query khi có
  `alert.updated`/`notification.sent`; `revoked` → đóng stream, hiện thông báo mất quyền,
  điều hướng an toàn; reconnect có backoff và dùng `Last-Event-ID` nếu lấy được id cuối.
  Khi tab ẩn có thể đóng stream, hiện lại thì mở lại (không bắt buộc, nếu làm phải đúng).

### 2. Tổng quan và lịch sử

- `/app` (thay `AppHomePage`): chọn hồ sơ, thẻ trạng thái thiết bị (online/stale/offline/never),
  alert đang mở, lần đo gần nhất, tổng hợp hôm nay (HR chỉ hiện khi có mẫu hợp lệ, steps,
  pin). Không hiện số 0 giả; thiếu dữ liệu ghi "Chưa có dữ liệu".
- `/app/history`: chọn khoảng 24h/7 ngày/30 ngày trong giới hạn quyền, bảng đo + chart
  (dùng SVG/CSS, **không thêm thư viện**), đánh dấu gap/unsynced/`source=synthetic`,
  nút tải CSV. Biểu đồ phải có nhãn trục và bảng thay thế cho screen reader.

### 3. Hồ sơ, thiết bị, chia sẻ

- `/app/subjects`: danh sách + tạo hồ sơ (tên, timezone mặc định Asia/Ho_Chi_Minh) + sửa tên.
- `/app/subjects/:id/share`: mời người thân (email, quyền, hạn), danh sách lời mời + care link,
  thu hồi có xác nhận; hiển thị `acceptUrl`/token **một lần** sau khi tạo, cảnh báo không lưu được lại.
- `/app/devices`: trạng thái thiết bị, nhập claim code để gắn, tháo gán có xác nhận.
- `/app/notifications`: danh sách thông báo, đánh dấu đã đọc.

### 4. Chất lượng chung

- Dùng lại component/token fe-shell; bổ sung component mới đặt trong `src/components` hoặc
  `src/features/<domain>`; không copy CSS rải rác.
- Mọi query: loading skeleton, empty state, error state có thử lại; 401 → `/login?next=...`
  (xử lý tập trung ở query client hoặc ProtectedRoute, không lặp mỗi trang).
- Sau mỗi mutation: invalidate đúng query key; optimistic chỉ khi rollback chắc chắn.
- Không hiển thị email đầy đủ của người khác ngoài màn hình owner quản lý chia sẻ.
- Dữ liệu sức khỏe: luôn ghi rõ "nguồn: mô phỏng" khi `source=synthetic`; không chẩn đoán,
  không đưa lời khuyên y khoa; nút cấp cứu không tự gọi (chỉ hiện hướng dẫn).
- Responsive 360px→desktop; chữ lớn không vỡ layout; focus visible; `aria-label` cho nút icon.
- Xóa schema tạm trong `features/subjects/api.ts` và `features/invitations/api.ts`, thay bằng
  import chính thức `@annhien/contracts/subjects|care` (contracts đã build trong `dist`).

## Kiểm phải chạy và ghi vào handoff

```bash
cd apps/web
pnpm typecheck
pnpm test
pnpm build
```

- Thêm test component cho: danh sách alert (empty/error/ack 409), SSE reducer/handler,
  form tạo hồ sơ (lỗi field), claim code, và một test history hiển thị "chưa có dữ liệu".
- Có thể thêm E2E nhưng **chỉ chạy khi API đang chạy**; nếu chưa chạy được thì ghi rõ
  "chưa chạy", không bịa kết quả.
- Không sửa test cũ để làm xanh; nếu test cũ sai hợp đồng, ghi lý do trong handoff.

## Kết thúc

Ghi `reports/handoffs/wave2-fe-features.md` gồm: file đã tạo/sửa, lệnh + kết quả thật,
ảnh hưởng contract, phần chưa làm, rủi ro tích hợp. Nếu kẹt >15 phút ở một lỗi, dừng và
ghi handoff trung thực thay vì đoán.
