# Web — An Nhiên

Giao diện web của An Nhiên: landing, đăng nhập/đăng ký, khung ứng dụng `/app`, các màn hình
nghiệp vụ (tổng quan + xu hướng, lịch sử, cảnh báo, hồ sơ, thiết bị, chia sẻ + liên hệ khẩn cấp,
thông báo, cài đặt tài khoản, trợ lý, công việc, Studio, quản trị). Các trang sau đăng nhập được
**tách chunk theo route** để giảm bundle tải lần đầu.
React 19 + TypeScript + Vite 8, React Router 7, TanStack Query 5, hợp đồng zod từ `@annhien/contracts`.

**Bản demo:** dữ liệu tổng hợp (nhãn "Nguồn: dữ liệu mô phỏng" khi API trả `source=synthetic`);
cảnh báo chỉ hiển thị khi trang đang mở và kết nối máy chủ. Không có push khi đóng trình duyệt,
không tự gọi cấp cứu. Xem ranh giới trong `docs/02`, `docs/06`, `docs/14`.

## Lệnh

```bash
pnpm dev        # Vite dev (cổng 5173), proxy /api → http://localhost:3000
pnpm typecheck  # tsc --noEmit
pnpm test       # Vitest + Testing Library (không cần server)
pnpm build      # typecheck + vite build
pnpm test:e2e   # Playwright; cần web dev server
```

Nếu build lỗi do contracts chưa build: chạy `pnpm --filter @annhien/contracts build` ở root.

Biến môi trường: `VITE_API_BASE_URL` (tùy chọn) — ghi đè base API, mặc định `/api/v1`
(qua Vite proxy tới API dev tại `http://localhost:3000`).

## Cấu trúc

```text
src/
  app/          router, ProtectedRoute, AppShell (SSE + nav + badge/banner + thông báo mất quyền)
  features/
    auth/       GET /me, login/register/logout, trang đăng nhập/đăng ký
    settings/   /app/settings — hồ sơ, mật khẩu, phiên đăng nhập
    subjects/   danh sách/tạo/sửa hồ sơ, lưu trữ + yêu cầu xóa, bộ chuyển hồ sơ
    dashboard/  /app — trạng thái thiết bị, cảnh báo mở, tổng hợp hôm nay, xu hướng
    insights/   card 7/14/30 ngày trên dashboard
    history/    /app/history — bảng đo + biểu đồ SVG, gap, tải CSV
    alerts/     /app/alerts — danh sách (cursor), chi tiết, ack/resolve (409), liên hệ khẩn cấp
    contacts/   quản lý/đọc liên hệ khẩn cấp, `tel:`
    realtime/   SSE: parser/reducer thuần + hook useSubjectEvents (backoff, revoked)
    devices/    /app/devices — trạng thái thiết bị, claim code, tháo gắn
    share/      /app/subjects/:id/share — mời, token một lần, quyền xem số đo, thu hồi
    notifications/ /app/notifications — hộp thư, đánh dấu đã đọc, badge/banner
    invitations/ trang công khai /invite/:token (dùng @annhien/contracts/care)
    assistant/ /app/assistant — tóm tắt AI 7 ngày + hỏi đáp (owner/canViewAi, dataQuality, 429)
    tasks/     /app/tasks — công việc bảo trì: lọc open/closed, tạo việc (owner), đóng có lý do
    admin/     /app/admin — tổng quan, người dùng, thiết bị (cấp mã/xoay khóa), policy CAS, audit
    studio/    /app/studio — workspace views: draft → preview → publish → rollback
  components/   Button, Field, Card, Alert, EmptyState, StatusPill, MeasurementChart, ...
  lib/          api client, query keys + xử lý 401 tập trung, validation, format
  styles/       tokens.css, base.css, layout.css (design tokens An Nhiên)
  test/         setup Vitest + helpers
e2e/            smoke, alerts, history (mock /api/v1)
```

## Sơ đồ route

- Công khai: `/` (landing), `/login`, `/register`, `/invite/:token`, `*` (404).
- Bảo vệ (`/app`): `index` tổng quan, `history`, `alerts` + `alerts/:id`, `subjects`,
  `subjects/:id/share`, `devices`, `notifications`, `settings`, `assistant`, `tasks`, `admin`,
  `studio` + `studio/:id` + `studio/:id/data`; route lạ hiển thị 404 trong khung.
  Nav mobile có 5 mục chính; mục phụ nằm trong menu "Thêm" và hiện theo quyền hồ sơ/role.

## Quy ước

- Mọi query/mutation dùng schema + type từ `@annhien/contracts/*` qua `parseResponse`;
  không có schema tạm trong src.
- Query keys tập trung ở `lib/query.ts`; sau mutation luôn invalidate đúng phạm vi.
- 401 xử lý tập trung ở QueryCache/MutationCache → `/login?next=...` (xem `lib/session.ts`).
- Dữ liệu sức khỏe staleTime ≤ 30s; không hiển thị số 0 giả thay cho "chưa có dữ liệu".
- Quyền xem số đo: `canViewMeasurements=false` ẩn số đo/lịch sử/CSV, không gọi API số đo; cảnh báo
  vẫn hiển thị nếu có `canReceiveAlerts`. Không dựa vào việc ẩn nút — backend vẫn kiểm.
- SSE (`GET /subjects/:id/events`): mở theo hồ sơ đang xem; `alert.updated`/`notification.sent`
  làm mới cache; `revoked` → đóng stream, xóa cache hồ sơ, điều hướng an toàn; reconnect có
  backoff và gửi lại `cursor` (Last-Event-ID). Banner “Mất cập nhật trực tiếp” khi stream lỗi.
- Badge thông báo chưa đọc dùng query key chung với trang Thông báo; tab ẩn không poll.
- A11y: màu không là tín hiệu duy nhất, `aria-label` cho nút icon, focus-visible,
  responsive từ 360px, biểu đồ luôn có bảng dữ liệu thay thế; tôn trọng `prefers-reduced-motion`.
- Email đầy đủ của người khác chỉ hiển thị ở màn hình chủ hồ sơ quản lý chia sẻ.

## Trạng thái

- **Đã có:** landing, auth, cài đặt tài khoản/phiên, khung ứng dụng, tổng quan + xu hướng 7/14/30,
  lịch sử + biểu đồ, cảnh báo + SSE + badge/banner, hồ sơ/chia sẻ + liên hệ khẩn cấp + lưu trữ/yêu cầu xóa,
  thiết bị, thông báo, trợ lý có `dataQuality`, công việc + tạo việc, Studio draft→preview→publish→rollback,
  quản trị + tab thiết bị + policy CAS + audit; trạng thái rỗng/lỗi/mất quyền và nhãn dữ liệu mô phỏng.
- **Kiểm ngày 15/11/2026:** `pnpm test` **32 file / 178 test pass** (11,2 s); E2E **7/7 pass**; `pnpm build` **pass**.
  Bundle tách theo route; chunk lớn nhất ~269 kB, chưa đo trên mạng thật.
- **Chưa có:** Web Push khi đóng trình duyệt, PWA/native, dữ liệu sức khỏe thật, firmware/đo thật,
  form tạo thiết bị trong tab admin (tạo qua API), Studio approval độc lập, xóa cứng/retention.
  Cảnh báo chỉ hiển thị khi trang đang mở; không tự gọi cấp cứu.
