# Handoff — W2 lane R (Người thân / Chia sẻ / Thiết bị / Công việc / Tài khoản)

**Task** `task_73f02c301c72` · **Dispatch** `ctx_58b19ad29e4a` · **Worker terminal**
`term_70989b30-…` · **Coordinator** `term_3f23340f-…`

- **Worktree**: `C:/Users/nguye/orca/workspaces/DATN/v7-r`
- **Branch**: `Tung204/v7-r` (chưa merge, chưa push)
- **Base**: `cf11c29` — commit cuối `v7-foundation` (`feat(web): nền tảng giao diện v7`)
- **Provider/model thực tế**: `moxuna / deepseek-v4.1-flash`
- **Spec đọc trước**: `mandate.md`, `decisions.md` (D1–D3, D5), `design-system.md`
  §5.8–5.11, `w2-common.md`, `w2-r.md`, `reports/handoffs/v7-foundation.md`.

## 0. Môi trường đo (thật)

- Web dev: `http://127.0.0.1:4354` (`npx vite --port 4354 --strictPort`,
  `VITE_API_BASE_URL=http://127.0.0.1:3104/api/v1` — `vite.config.ts` không thuộc lane).
- API: `http://127.0.0.1:3104` (`npx nest start` trong `apps/api`,
  `PORT=3104 WEB_ORIGIN=http://127.0.0.1:4354 PGLITE_DATA_DIR=.data/qa-v7-r`, migrate + seed demo).
- Tài khoản dùng: owner `ba-an@demo.heart-iot.local` / `demo-heart-iot-2026`;
  người thân `minh@demo.heart-iot.local`; hồ sơ `aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa`
  (Bà Trần Thị An) trong seed có sẵn. **Không thêm/sửa dữ liệu demo**; script đo
  chỉ mở form/xác nhận rồi `Escape`, không submit.
- Ghi chú môi trường: `npx tsx src/main.ts` cho API **không boot** (Nest
  `UndefinedDependencyException` vì `tsx` không phát metadata decorator) — dùng
  `npx nest start`. API ở `:3000` có sẵn từ phiên khác, lane này không dùng.

## 1. File thay đổi

| File | Dòng |
| --- | --- |
| `apps/web/src/features/subjects/api.ts` | +35 / -0 |
| `apps/web/src/features/subjects/SubjectsPage.tsx` | +347 / -309 |
| `apps/web/src/features/subjects/SubjectsPage.test.tsx` | +161 / -8 |
| `apps/web/src/features/subjects/SubjectForm.tsx` (xem §6.1) | +27 / -22 |
| `apps/web/src/features/subjects/SubjectForm.test.tsx` (xem §6.1) | +7 / -4 |
| `apps/web/src/features/subjects/subjects.css` | +45 / -71 |
| `apps/web/src/features/share/SharePage.tsx` | +494 / -260 |
| `apps/web/src/features/share/SharePage.test.tsx` | +56 / -0 |
| `apps/web/src/features/share/share.css` (mới) | 151 |
| `apps/web/src/features/contacts/EmergencyContactsSection.tsx` | +241 / -191 |
| `apps/web/src/features/contacts/EmergencyContactCard.tsx` | +26 / -22 |
| `apps/web/src/features/contacts/contacts.css` | +53 / -142 |
| `apps/web/src/features/devices/DevicesPage.tsx` | +302 / -149 |
| `apps/web/src/features/devices/DevicesPage.test.tsx` | +90 / -0 |
| `apps/web/src/features/devices/devices.css` (mới) | 27 |
| `apps/web/src/features/tasks/TasksPage.tsx` | +215 / -135 |
| `apps/web/src/features/tasks/TasksPage.test.tsx` | +100 / -2 |
| `apps/web/src/features/tasks/tasks.css` | +26 / -53 |
| `apps/web/src/features/settings/SettingsPage.tsx` | +37 / -19 |
| `apps/web/src/features/settings/ProfileCard.tsx` | +49 / -36 |
| `apps/web/src/features/settings/PasswordCard.tsx` | +76 / -63 |
| `apps/web/src/features/settings/SessionsCard.tsx` | +234 / -151 |
| `apps/web/src/features/settings/SettingsPage.test.tsx` | +44 / -2 |
| `apps/web/src/features/settings/settings.css` | +12 / -91 |
| `apps/web/src/styles/people.css` (mới, dùng chung trong lane) | 470 |
| `reports/qa/scripts/v7-r-visual.mjs` (mới, chạy tay) | — |
| `reports/qa/evidence/v7-r/*` (mới, 20 ảnh route + 8 ảnh state + `metrics.json`) | — |

Không sửa: `components/*`, `styles/{fonts,tokens,base,shell}.css`, `app/*`, `lib/*`,
`features/subjects/{selection,useSubjects,SubjectSwitcher}`, `features/share/phone.ts`,
`features/share/useEmergencyContacts.ts`, `test/utils.tsx`, `apps/api`, `packages/contracts`.
Không thêm dependency, không đổi schema/quyền/query key.

## 2. Hành vi theo phạm vi

### 2.1 Người thân — `SubjectsPage`, `subjects/api.ts`
- **W0 R3 làm đúng thứ tự**: viết test payload/semantics trước, rồi mới trích
  `archiveSubject(subjectId, { reason })` (POST `/subjects/:id/archive`, chấp nhận
  **204**, giữ 409 là `ApiError` `CONFLICT`) và `requestSubjectDeletion(subjectId, { reason })`
  (POST `/subjects/:id/deletion-requests`, parse `deletionRequestRecordedSchema`,
  chỉ chấp nhận `status === 'recorded'`) vào `api.ts`; JSX gọi hai hàm này.
  Test mới phủ: body đúng, 409 nổi lên UI, 202 `recorded` (dữ liệu **chưa** xóa),
  phản hồi sai hợp đồng bị từ chối. Sau đó mới sửa JSX.
- H1 **Người thân** + 1 dòng ngữ cảnh phạm vi (`SubjectContextLine scope="collection"`),
  action **Thêm người** (toggle form) và link **Công việc bảo trì**.
- Danh sách dạng hàng (`people-list`/`people-row`): tên, vai trò **bằng chữ**
  (“Chủ hồ sơ” / “Người thân xem hộ”), trạng thái chia sẻ bằng chữ (không chỉ màu);
  hàng của chủ hồ sơ không bịa “xem số đo N ngày”.
- Hàng chủ hồ sơ: `Xem sức khỏe`, `Thiết bị`, `Chia sẻ và liên hệ`, disclosure
  **Quản lý hồ sơ** chứa Sửa + **Lưu trữ hồ sơ** + **Yêu cầu xóa** (hai hành động nguy hiểm
  khác nhau, không gộp). Người thân không thấy disclosure.
- Lưu trữ ≠ xóa: lưu trữ nói rõ hồ sơ biến khỏi danh sách/tổng quan/cảnh báo, lời mời
  và care-link bị thu hồi ngay, stream mã hồ sơ đóng; dữ liệu đo/cảnh báo **vẫn còn**
  (lưu trữ hàng đợi phục hồi bằng quy trình riêng). Yêu cầu xóa chỉ ghi nhận
  (`recorded`) và nói rõ chưa xóa gì, kèm lối liên hệ quản trị.
- Xác nhận nguy hiểm tại chỗ: nêu đúng tên hồ sơ (“Lưu trữ hồ sơ “Bà Trần Thị An””),
  lý do 3–500 ký tự, gõ lại tên (chuẩn hóa NFC, không phân biệt hoa/thường/khoảng trắng
  đầu cuối), danh sách hệ quả, `Hủy` + `Escape` đóng và trả focus về nút đã mở.
- Loading/error: H1 + dòng ngữ cảnh vẫn còn, chỉ vùng danh sách đổi (không mất lối vào).

### 2.2 Chia sẻ + liên hệ — `SharePage`, `EmergencyContactsSection`
- **Xác minh chủ hồ sơ trước khi gọi API chủ sở hữu**: hai query `invitations` và
  `care-links` có `enabled: isOwner`; `isOwner` lấy từ danh sách hồ sơ đã tải. Người
  thân chỉ thấy H1 + dòng ngữ cảnh + EmptyState “Chỉ chủ hồ sơ quản lý chia sẻ”.
  Đo bằng network: trang chia sẻ của người thân phát **0** request `/invitations` và
  `/care-links` (tổng 8 request API, xem §5.3).
- Cấu trúc: H1 **Chia sẻ và liên hệ** → dòng ngữ cảnh hồ sơ (`SubjectContextLine scope="pinned"`)
  → jump link `Chia sẻ quyền` / `Liên hệ khẩn cấp` → nội dung hai mục (một trang, không tab ẩn).
- Lời mời: form inline một cột (email, nhóm quyền **Số đo và AI**, nhóm **Cảnh báo và hỗ trợ**),
  cờ độc lập; `historyDays` bị khóa khi tắt xem số đo; `canViewAi` bị ép `false` khi tắt số đo;
  mô tả ngay dưới từng nhóm nói rõ người được mời **thấy gì**. Tạo xong hiện **mã dùng một lần**
  + liên kết chấp nhận, nút ẩn; ẩn rồi thì mã biến khỏi DOM (test khẳng định lại), không có
  đường xem lại — server cũng không trả lại.
- Care-link: hàng “Người đang xem cùng” ghi email, các cờ quyền bằng chữ, thời điểm bắt đầu;
  thu hồi hai bước, nêu tên người, `Hủy`/`Escape` trả focus.
- Liên hệ khẩn cấp: tối đa 5 (đếm từ API, chặn thêm khi đủ), một **chính** (pill “Chính”),
  số điện thoại là link `tel:` (đo được `href="tel:0900000000"`, cao 44px), sửa/xóa hai bước
  có nêu tên, mô tả rõ ai thấy thông tin này (người thân có quyền nhận cảnh báo).

### 2.3 Thiết bị — `DevicesPage`
- H1 **Thiết bị** + link **Công việc bảo trì** (điểm vào theo §5.10), dòng ngữ cảnh hồ sơ do
  shell render. Hàng thiết bị: tên + Serial + độ mới dữ liệu + lần nhận/lần đo cuối + pin +
  nhịp tim + firmware.
- Độ mới theo enum contract: `live` → **Dữ liệu mới** (success), `stale` → **Chưa cập nhật gần đây**
  (warning), `offline` → **Ngoại tuyến** (warning, không dùng danger), `never` → **Chưa từng kết nối**
  (neutral). Nhãn là chữ, không chỉ màu.
- Redaction: nhịp tim chỉ hiện khi `permissions.canViewMeasurements !== false` **và**
  `device.healthDataVisible !== false`; metadata (serial, pin, firmware) vẫn đọc theo API.
- Claim/release chỉ chủ hồ sơ: caregiver thấy ghi chú chỉ đọc, **không** render form/confirm
  và không phát request ghi (test khẳng định).
- Claim thành công: “Đã gắn thiết bị vào hồ sơ. Gắn thành công **không có nghĩa thiết bị đang
  trực tuyến** — trạng thái kết nối chỉ đổi khi thiết bị gửi dữ liệu đầu tiên.” Không điền sẵn mã.
- Tháo gắn: xác nhận tại chỗ nêu tên thiết bị, hệ quả (dữ liệu mới dừng cập nhật), `Hủy`/`Escape`.
- Đổi hồ sơ: reset mã/lỗi/confirm/thông báo, `claim.reset()`/`release.reset()`, và response
  muộn của hồ sơ cũ bị bỏ (`activeSubjectIdRef`) nên không dán serial của A vào B.

### 2.4 Công việc bảo trì — `TasksPage`
- H1 **Công việc bảo trì**, breadcrumb **← Người thân**, dòng phạm vi
  **Tất cả hồ sơ có quyền** (`SubjectContextLine scope="collection"`), nên không ghi mỗi A
  khi API trả cả B. Filter Đang mở/Đã đóng + **Tải thêm** theo trang.
- Không phải mục nav thứ năm; điểm vào: link trên header **Người thân** và **Thiết bị** (§6.2).
- Chỉ chủ hồ sơ thấy **Tạo việc** (form inline một cột: hồ sơ, thiết bị đang gắn, kind, tiêu đề,
  ưu tiên 0–100, hạn, ghi chú; validate bằng contract, lỗi tại trường). Hồ sơ chưa gắn thiết bị
  có đường **Gắn thiết bị** tới `/app/devices`.
- Đóng: chỉ chủ hồ sơ hoặc admin (`canClose`), lý do 3–500 ký tự, chống gửi trùng, 409 → banner
  “dữ liệu đã thay đổi” + tải lại, `Hủy`/`Escape` trả focus về nút đóng.
- Task `subjectId = null` (việc kỹ thuật) tách nhóm riêng cho admin, vẫn dùng API/guard hiện có.
  Caregiver chỉ xem (không có nút đóng/tạo).

### 2.5 Tài khoản — `SettingsPage`
- H1 **Tài khoản** + dòng “Tài khoản của {displayName}” (không dùng tên hồ sơ, không có subject context).
- **Tên của bạn**: PATCH chỉ khi tên đổi (không đổi thì không gọi), lỗi tại trường, thông báo thành công.
- **Mật khẩu**: hiện tại/mới/nhập lại, ≥10 ký tự và phải khác mật khẩu hiện tại, focus ô lỗi đầu tiên;
  thành công nói rõ **phiên hiện tại được giữ nguyên** (không tự đăng xuất).
- **Phiên đăng nhập**: phiên hiện tại có pill “Thiết bị này” và **không có nút thu hồi** (chỉ dẫn dùng
  “Đăng xuất”); phiên khác thu hồi hai bước tại chỗ; “Thu hồi tất cả phiên khác” cũng hai bước,
  `Hủy`/`Escape` trả focus. 401 do `lib/query.ts` + `ProtectedRoute` xử lý tập trung (không sửa).

## 3. Diff test (không nới, không bỏ assertion nghiệp vụ)

Đo trên 9 file test của 6 thư mục feature trong lane: **56 test** trước khi sửa
(gồm 6 test `contacts/AlertDetailContacts` và 6 test `subjects/SubjectSwitcher` thuộc F,
không đổi) → **73 test** sau khi sửa, tất cả pass. Số khối `it()` theo file (đếm `git show HEAD:`):

| File | Trước → sau |
| --- | --- |
| `subjects/SubjectsPage.test.tsx` | 8 → 14 |
| `subjects/SubjectForm.test.tsx` | 3 → 3 (sửa kỳ vọng, xem dưới) |
| `share/SharePage.test.tsx` | 2 → 4 |
| `contacts/EmergencyContactsSection.test.tsx` | 9 → 9 (viết lại selector/copy) |
| `devices/DevicesPage.test.tsx` | 2 → 4 |
| `tasks/TasksPage.test.tsx` | 10 → 14 |
| `settings/SettingsPage.test.tsx` | 10 → 13 |
| `contacts/AlertDetailContacts.test.tsx` | 6 → 6 (F, không đổi) |
| `subjects/SubjectSwitcher.test.tsx` | 6 → 6 (F, không đổi) |

Test **thêm** (nội dung chính):
`archiveSubject` body + 204; `archiveSubject` giữ 409 `CONFLICT`; `requestSubjectDeletion` chỉ nhận
`recorded`; từ chối phản hồi sai hợp đồng; hàng hồ sơ ghi vai trò/quyền bằng chữ; Escape hủy xác nhận
nguy hiểm + focus trả về; người thân không gọi `invitations`/`care-links`; token lời mời chỉ hiện một lần;
caregiver không thấy form claim/tháo gắn và không gửi request ghi; claim nói “không có nghĩa đã trực tuyến”;
H1 + dòng phạm vi + breadcrumb ở Công việc; task kỹ thuật tách nhóm và admin đóng được; hồ sơ chưa có
thiết bị có đường Gắn thiết bị; Escape hủy đóng công việc; “Tài khoản của …” không dùng tên hồ sơ;
Escape hủy thu hồi phiên + focus; phiên hiện tại không có nút thu hồi.

Test **sửa** chỉ vì UI đổi cấu trúc (card → hàng, copy mới, H1 mới): đổi `getByText`/`getByRole`
sang selector mới, đổi “Hồ sơ” → “Tên của bạn”, thêm assert focus; **không** xóa nhánh kiểm nào.
`SubjectForm.test.tsx`: đổi kỳ vọng “lỗi tại trường” thành “lỗi tại trường **và** focus về ô lỗi”.

## 4. Cổng kiểm (output thật)

```
$ pnpm --filter @heart-iot/web typecheck
$ tsc -p tsconfig.json --noEmit            # exit 0

$ npx vitest run --no-file-parallelism --maxWorkers=1    (apps/web, toàn bộ)
 Test Files  37 passed (37)
      Tests  308 passed (308)
   Duration  107.63s

$ npx vitest run src/features/{subjects,share,contacts,devices,tasks,settings} --no-file-parallelism --maxWorkers=1
 Test Files  9 passed (9)
      Tests  73 passed (73)

$ pnpm --filter @heart-iot/web build
✓ built in 241ms   (TasksPage 17.18 kB, SharePage 23.51 kB, …)
```

## 5. Số đo giao diện (Chromium, DPR 1)

Ảnh: `reports/qa/evidence/v7-r/<route>-<viewport>.png` (20 ảnh) + 8 ảnh trạng thái
`*-390x844.png`; số thô: `reports/qa/evidence/v7-r/metrics.json`; script:
`reports/qa/scripts/v7-r-visual.mjs`. Viewport: 1280×900, 390×844, 360×740, 390×844 với
`an:text-size=large`.

| Route | overflow (1280/390/360/large) | H1 | dòng ngữ cảnh | target | target <44 | `aria-current` |
| --- | --- | --- | --- | --- | --- | --- |
| `/app/subjects` | 0/0/0/0 | 1/1/1/1 | 1/1/1/1 | 16/16/16/16 | 0/0/0/0 | Người thân (4/4) |
| `/app/subjects/<id>/share` | 0/0/0/0 | 1/1/1/1 | 1/1/1/1 | 16/16/16/16 | 0/0/0/0 | Người thân (4/4) |
| `/app/devices` | 0/0/0/0 | 1/1/1/1 | 1/1/1/1 | 10/10/10/10 | 0/0/0/0 | Người thân (4/4) |
| `/app/tasks` | 0/0/0/0 | 1/1/1/1 | 1/1/1/1 | 12/12/12/12 | 0/0/0/0 | không có mục nav riêng |
| `/app/settings` | 0/0/0/0 | 1/1/1/1 | 1/1/1/1 | 31/32/33/34 | 0/0/0/0 | không có mục nav riêng |

- Dòng ngữ cảnh: `/app/settings` đo được 1 là dòng “Tài khoản của …” (§5.11 yêu cầu), không phải
  ngữ cảnh hồ sơ; `/app/devices` lấy dòng của shell (`Theo dõi: …`); ba trang còn lại là dòng phạm vi.
- Escape hủy được xác nhận ở **cả 5 route** (`subjects-archive`, `devices-release`, `tasks-close`,
  `settings-revoke`, `share-revoke`: `closedByEscape: true`), không phát request nào.
- Ảnh trạng thái: `subjects-create-form`, `subjects-archive-confirm`, `devices-release-confirm`,
  `tasks-create-form`, `tasks-close-form`, `settings-revoke-confirm`, `share-invite-form`,
  `share-revoke-confirm`, `share-non-owner`.
- **Người thân vào `/app/subjects/<id>/share`**: 8 request API, **0** request `/invitations` hoặc
  `/care-links`; ảnh `share-non-owner-390x844.png`.
- Không có lỗi console/pageerror ở 20 lượt đo; không có chuỗi “demo/đồ án/giảng viên/nghiệm thu”
  trong nội dung 5 trang.

## 6. Lệch so với spec — cần lead xác nhận

1. **`features/subjects/SubjectForm.tsx` + test không nằm trong danh sách file của lane.** Lý do:
   Subjects cần “create/edit” theo §5.8 (một cột, label “Tên người được theo dõi”, lỗi tại trường,
   focus ô lỗi đầu tiên) và form này **chỉ** được `SubjectsPage` dùng (đã kiểm: không nơi khác import).
   Sửa tại chỗ thay vì nhân bản form trong page. Không đổi export/props công khai. Nếu lead muốn giữ
   tuyệt đối danh sách file, có thể revert 2 file này và lane sẽ nhận lại phần form.
2. **Điểm vào Công việc**: `w2-r.md` nói chọn **Hôm nay hoặc Cài đặt**; `design-system.md` §5.10 lại đặt
   link **Công việc bảo trì** ngay trên header **Thiết bị** và yêu cầu breadcrumb Người thân/Thiết bị
   “theo điểm vào”. Lane làm theo §5.10 (link trên header Người thân và Thiết bị, không thêm mục nav
   thứ năm) vì (a) tài liệu thiết kế là bản sau, (b) `features/today` và Cài đặt không nằm trong file
   được phép sửa của lane. Nếu lead muốn link ở Hôm nay/Cài đặt, cần cấp quyền file tương ứng.
3. **Lỗi primitive của F (chưa sửa, chỉ báo)**: `PageHeader` render `breadcrumb` thành **flex item ngang**
   trong `.page-header` (desktop `flex-direction: row` + `justify-content: space-between`), nên khi
   truyền `breadcrumb` thì H1 bị đẩy vào giữa trang (thấy ở ảnh `tasks-1280x900` bản trước). Lane R
   đặt breadcrumb ngoài `PageHeader` (`people-breadcrumb`) để tránh; đề nghị F sửa primitive
   (breadcrumb nên là hàng riêng phía trên) rồi các lane bỏ workaround.

## 7. Chưa kiểm / giới hạn

- Chưa chạy trình đọc màn hình thật; chỉ kiểm cấu trúc ARIA/heading/focus bằng DOM + ảnh.
- Seed demo chỉ có **1 hồ sơ** thuộc owner, nên ảnh không thể hiện trạng thái nhiều hồ sơ
  (select ngữ cảnh nhiều dòng) — trạng thái này chỉ có trong test đơn vị.
- Chưa submit thật các luồng phá hủy trên API demo (lưu trữ/xóa/thu hồi/đóng) để không làm hỏng
  seed dùng chung; các luồng này được kiểm bằng test với MSW và chỉ mở tới bước xác nhận trong ảnh.
- Chưa kiểm 401/refresh của trang Tài khoản bằng tay (dựa vào xử lý tập trung `lib/query.ts`).
- `vite.config.ts` không thuộc lane nên web dev phải chạy `--port 4354` + `VITE_API_BASE_URL`;
  khi ghép lane cần cấu hình proxy/port thống nhất.
- Chưa có blocker.

## 8. Cách chạy lại

```
# API riêng
cd apps/api && PORT=3104 WEB_ORIGIN=http://127.0.0.1:4354 \
  PGLITE_DATA_DIR=.data/qa-v7-r npx nest start
# Web
cd apps/web && VITE_API_BASE_URL=http://127.0.0.1:3104/api/v1 npx vite --port 4354 --strictPort
# Đo + ảnh
node reports/qa/scripts/v7-r-visual.mjs
```
