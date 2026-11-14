# Web — An Nhiên

Giao diện web của An Nhiên: landing, đăng nhập/đăng ký, khung ứng dụng `/app`, các màn hình
nghiệp vụ (tổng quan, lịch sử, cảnh báo, hồ sơ, thiết bị, chia sẻ, thông báo, trợ lý, công việc,
Studio, quản trị). Các trang sau đăng nhập được **tách chunk theo route** để giảm bundle tải lần đầu.
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
pnpm test:e2e   # Playwright (cần dev server + API đang chạy)
```

Nếu build lỗi do contracts chưa build: chạy `pnpm --filter @annhien/contracts build` ở root.

Biến môi trường: `VITE_API_BASE_URL` (tùy chọn) — ghi đè base API, mặc định `/api/v1`
(qua Vite proxy tới API dev tại `http://localhost:3000`).

## Cấu trúc

```text
src/
  app/          router, ProtectedRoute, AppShell (SSE + nav + thông báo mất quyền)
  features/
    auth/       GET /me, login/register/logout, trang đăng nhập/đăng ký
    subjects/   danh sách/tạo/sửa hồ sơ + bộ chuyển hồ sơ (selection dùng chung)
    dashboard/  /app — trạng thái thiết bị, cảnh báo mở, tổng hợp hôm nay
    history/    /app/history — bảng đo + biểu đồ SVG, gap, tải CSV
    alerts/     /app/alerts — danh sách (cursor), chi tiết, ack/resolve (409)
    realtime/   SSE: parser/reducer thuần + hook useSubjectEvents (backoff, revoked)
    devices/    /app/devices — trạng thái thiết bị, claim code, tháo gắn
    share/      /app/subjects/:id/share — mời, token một lần, thu hồi
    notifications/ /app/notifications — hộp thư, đánh dấu đã đọc
    invitations/ trang công khai /invite/:token (dùng @annhien/contracts/care)
    assistant/ /app/assistant — tóm tắt AI 7 ngày + hỏi đáp (owner/canViewAi, 429)
    tasks/     /app/tasks — công việc bảo trì: lọc open/closed, đóng có lý do (409)
    admin/     /app/admin — chỉ admin: tổng quan, người dùng, policy CAS, audit
    studio/    /app/studio — workspace views: draft → preview → publish → rollback
  components/   Button, Field, Card, Alert, EmptyState, StatusPill, MeasurementChart, ...
  lib/          api client, query keys + xử lý 401 tập trung, validation, format
  styles/       tokens.css, base.css, layout.css (design tokens An Nhiên)
  test/         setup Vitest + helpers
e2e/            smoke Playwright
```

## Sơ đồ route

- Công khai: `/` (landing), `/login`, `/register`, `/invite/:token`, `*` (404).
- Bảo vệ (`/app`): `index` tổng quan, `history`, `alerts` + `alerts/:id`, `subjects`,
  `subjects/:id/share`, `devices`, `notifications`, `assistant`, `tasks`, `admin`,
  `studio` + `studio/:id` + `studio/:id/data`; route lạ hiển thị 404 trong khung.
  Nav mobile có 5 mục chính; mục phụ nằm trong menu "Thêm" và hiện theo quyền hồ sơ/role.

## Quy ước

- Mọi query/mutation dùng schema + type từ `@annhien/contracts/*` qua `parseResponse`;
  không có schema tạm trong src.
- Query keys tập trung ở `lib/query.ts`; sau mutation luôn invalidate đúng phạm vi.
- 401 xử lý tập trung ở QueryCache/MutationCache → `/login?next=...` (xem `lib/session.ts`).
- Dữ liệu sức khỏe staleTime ≤ 30s; không hiển thị số 0 giả thay cho "chưa có dữ liệu".
- SSE (`GET /subjects/:id/events`): mở theo hồ sơ đang xem; `alert.updated`/`notification.sent`
  làm mới cache; `revoked` → đóng stream, xóa cache hồ sơ, điều hướng an toàn; reconnect có
  backoff và gửi lại `cursor` (Last-Event-ID).
- A11y: màu không là tín hiệu duy nhất, `aria-label` cho nút icon, focus-visible,
  responsive từ 360px, biểu đồ luôn có bảng dữ liệu thay thế.
- Email đầy đủ của người khác chỉ hiển thị ở màn hình chủ hồ sơ quản lý chia sẻ.

## Trạng thái

- **v1 đã có:** landing, auth, khung ứng dụng, tổng quan, lịch sử + biểu đồ, cảnh báo + SSE,
  hồ sơ/chia sẻ, thiết bị, thông báo, trợ lý, công việc, Studio draft→preview→publish→rollback,
  quản trị + policy CAS + audit; trạng thái rỗng/lỗi/mất quyền và nhãn dữ liệu mô phỏng.
- **Hiệu năng:** route sau đăng nhập dùng `React.lazy` + `Suspense`; build tách trang thành chunk
  riêng (Admin/Studio/History/Assistant…) thay vì một bundle duy nhất.
- **Kiểm:** 19 file/72 test Vitest, `pnpm build` sạch cảnh báo chunk >500 kB, E2E 4/4 khi API chạy.
  Số test có thể tăng; luôn chạy lại thay vì tin README.
- **Chưa có:** Web Push khi đóng trình duyệt, PWA/native, dữ liệu sức khỏe thật, firmware/đo thật.
  Cảnh báo chỉ hiển thị khi trang đang mở; không tự gọi cấp cứu.
