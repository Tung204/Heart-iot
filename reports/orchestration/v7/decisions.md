# v7 — quyết định của lead sau cổng W0

Ngày 17/11/2026. Nguồn: `reports/orchestration/v7/w0-gate-review.md` (P1: C2, G1, R1, R2, R4, R12) + `mandate.md`. Quyết định dưới đây **thay** chỗ mâu thuẫn trong `implementation-plan.md`/`w1-foundation.md`; chỗ khác giữ nguyên.

## D1 — Mô hình CSS F1: thu hẹp có kiểm (phương án B), không tách toàn bộ

- F1 **chỉ retire selector foundation** khỏi `layout.css`: button, field, card, alert/notice, pill/status, shell (rail/header/bottom-nav/account menu/skip link/context line), layout primitive mới.
- Block CSS của feature **giữ nguyên** trong `layout.css` cho tới khi lane sở hữu thay trang; `layout.css` do **F** sở hữu trong W1–W3 (lane gửi patch/xoá block qua F hoặc được F giao quyền ghi trong spec lane).
- `main.tsx` import: fonts → tokens → base → **legacy `layout.css` (chỉ còn feature)** → shell. Không nạp hai định nghĩa foundation.
- Cổng “không double CSS” **chuyển sang W3**, khi đó `layout.css` phải bị xoá/ngừng import. Cổng W1 chỉ yêu cầu: không còn selector foundation trùng, có ledger.
- Lý do: tách 3.509 dòng cho các trang sắp bị viết lại là rủi ro cao, dễ mất rule động; nhưng để nguyên foundation cũ thì vi phạm “một nguồn cho mỗi selector”.

## D2 — Đóng băng interface dùng chung trong W2 (chỉ thêm, không đổi/xoá)

Các module sau coi như **frozen export** trong W2; lane muốn đổi tên/chữ ký/xoá phải xin patch qua owner + thông báo tất cả lane + chạy lại test liên quan:

- `features/auth/useAuth` (`useMe`, `useLogout`)
- `features/dashboard/api` (`fetchOpenAlerts` + export hiện có)
- `features/notifications/api` (`fetchNotifications`), `useUnreadNotifications`
- `features/alerts/labels`
- `features/contacts/phone`, `features/contacts/useEmergencyContacts`
- `features/subjects/{selection,useSubjects,SubjectSwitcher}`
- `lib/query.ts` (query keys), `lib/api.ts`
- `src/test/utils.tsx`

F công bố thêm primitive dùng chung: `Notice` (tone/role rõ), `Status`/tone, `ConfirmInline` (nêu tên đối tượng + Huỷ + focus), `Breadcrumb` nếu cần. Primitive đặt CSS tại **một nơi duy nhất**: `src/components/primitives.css` (không rải trong `base.css`).

## D3 — Context hồ sơ: chỉ shell, một dòng, đúng một lần

- Shell render context cho 5 trang subject-scoped (`/app`, `/app/overview`, `/app/history`, `/app/alerts`, `/app/devices`); vị trí **trên H1** trong vùng nội dung; accessible name **“Người được theo dõi”**.
- Trang **bỏ** dòng context cục bộ. F được phép patch tối thiểu `AssistantPage.tsx` để xoá `SubjectContextLine` và sửa locator test C (`AssistantPage.test.tsx`) trong cùng commit — đây là ngoại lệ duy nhất với quy tắc “F không sửa page”; test diff phải nêu trong handoff.
- Các trang khác: lane của trang xoá dòng cục bộ khi thay trang (C/R/H). Không trang nào render hai lần.
- Cổng W1: đếm đúng **1** context line + 1 combobox ở 5 trang; `/app` không còn `<span>Bà Năm</span>` rời.

## D4 — Cache khi thu hồi quyền: registry + purge theo subject

- F tạo registry key có `subjectId` (alerts list/detail, studio, tasks, insights, history) + hàm `purgeSubjectData(subjectId)`.
- Không purge `['alerts']` toàn bộ. Notifications toàn tài khoản: chỉ loại item của subject hoặc invalidate, không xoá cả hộp.
- W1: F làm phần registry + `useSubjectEvents` dùng purge; key của Studio/tasks do A/R đăng ký khi tới lượt (không chặn W1).
- Test bắt buộc: revoke B khi form A mở → dữ liệu A còn, cache B mất; không purge toàn app.

## D5 — Inbox: bắt buộc `?view=notifications`

`/app/notifications` → `/app/alerts?view=notifications` (replace). C render inbox theo `searchParams`; giữ mark-read optimistic + rollback; URL cũ không mất hộp.

## D6 — Banner shell

- Thông báo mới: link `/app/alerts/{incidentId}`; chỉ ẩn khi đang mở đúng incident đó hoặc đang ở inbox.
- Thứ tự ưu tiên: **mất quyền > thông báo mới > mất SSE**; mất quyền `role=alert` + nút “Đã hiểu”; mất SSE `role=status`, không tự ẩn khi đang mất kết nối.
- Giữ nguyên nghĩa copy hiện có; không gộp ba trạng thái vào một Notice.

## D7 — Studio: chỉ URL/bookmark (chấp nhận deviation)

Không thêm mục thứ năm, không menu “Thêm”, không link trong avatar. Studio giữ deep link `/app/studio` cho tài khoản đủ quyền. Ghi rõ trong tài liệu là deviation so với câu “chức năng phụ có đường vào”, lý do: yêu cầu 4 mục nav của người dùng + thiết kế đã chốt. Nếu người dùng sau này yêu cầu, mở lại.

## D8 — Ngoại lệ admin không hồ sơ

“Đúng 4 mục” áp dụng cho tài khoản có hồ sơ. Admin không hồ sơ giữ ngoại lệ hiện có: `/app` → `/app/admin`, nav chỉ Quản trị. Test cả hai trạng thái.

## D9 — Nhãn nguồn dữ liệu

- History: giữ câu “Dữ liệu hiển thị là dữ liệu mô phỏng.” cạnh khối dữ liệu/CSV.
- Studio data: “Dữ liệu hồ sơ” + “Dữ liệu mô phỏng” khi nguồn synthetic; **không** dùng “Dữ liệu thật”. Test `StudioViewDataPage.test.tsx` cập nhật kèm test diff.
- Sức khỏe: giữ nhãn nguồn mô phỏng.

## D10 — Cổng QA/ảnh trong workspace

- Ảnh: `reports/qa/evidence/v7-<lane>/<route>-<viewport>-<state>.png`; không ghi `C:/tmp`.
- API khi chụp: pin `WEB_ORIGIN=http://127.0.0.1:<port>` cho process API; không bypass origin; seed PGlite **cục bộ trong worktree** (không DB chia sẻ), ghi tài khoản admin demo.
- Ma trận tối thiểu mỗi lane: 1280×900, 390×844, 360×740, 390×844 chữ lớn; thêm 200% zoom ở W4. Đo target **mọi action đứng riêng** (kể cả `sm`, brand/header, auth switch, select) ≥44×44 bằng bbox; active nav (history→Sức khỏe, devices→Người thân, alias→Hôm nay); contrast/focus/reduced-motion; không request Newsreader, không nền `#faf6ed`.

## D11 — Tài liệu

`docs/06` còn mô tả “Thêm”/5 mục/badge chưa đọc/caregiver đóng task: cập nhật **trước W4 review ảnh**, không đợi sau hợp nhất. `design-system.md` + source là nguồn của W2.

## D12 — Trạng thái W0

W0 gate **đóng** với các quyết định trên. Không mở W2 cho tới khi F1 báo xong cổng và lead kiểm lại bằng chứng (không chỉ đọc báo cáo). Provider W0 là `moxuna/deepseek-v4.1-flash` (không phải dola); ghi trong handoff.
