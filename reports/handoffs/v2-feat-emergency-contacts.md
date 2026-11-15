# Handoff — v2-feat-emergency-contacts

- **Thời điểm:** 2026-11-15 (Asia/Ho_Chi_Minh)
- **Worker:** feat-emergency-contacts (v2 feature worker, worktree riêng)
- **Nhánh:** `feat-emergency-contacts` (không merge master)
- **Commit code + test:** `092f7ef` (`092f7efe774eb899c18c8914965e793f6668b841`); báo cáo này ở commit sau
- **Yêu cầu:** FR-09 (SOS/liên hệ hỗ trợ), NFR-01 (quyền theo hồ sơ), NFR-05 (log tối thiểu)

## Vùng đã sửa

| Đường dẫn | Trạng thái |
| --- | --- |
| `apps/api/src/emergency-contacts/{module,controller,service}.ts` | mới |
| `apps/api/test/emergency-contacts.spec.ts` | mới (12 test) |
| `apps/web/src/features/contacts/{api.ts,useEmergencyContacts.ts,phone.ts,EmergencyContactsSection.tsx,EmergencyContactCard.tsx,contacts.css}` | mới |
| `apps/web/src/features/contacts/{EmergencyContactsSection.test.tsx,AlertDetailContacts.test.tsx}` | mới (15 test) |
| `apps/web/src/features/share/SharePage.tsx` | chỉ thêm import + `<EmergencyContactsSection/>` sau section chia sẻ |
| `apps/web/src/features/alerts/AlertDetailPage.tsx` | chỉ thêm import + card liên hệ sau card hành động |

Không sửa `apps/api/src/app.module.ts`, `apps/web/src/app/router.tsx`, `AppShell.tsx`,
`styles/layout.css`, `tokens.css`, README/docs/HTML, package export, contract, schema hay migration.
`packages/contracts/src/contacts.ts` chỉ dùng (đã có sẵn), không đổi.

## Hành vi đã làm

### API — `apps/api/src/emergency-contacts/`

- `GET /subjects/:id/emergency-contacts` → `emergencyContactListSchema` `{items}` (tối đa 5),
  sắp `isPrimary DESC`, `createdAt ASC`, `id ASC` để thứ tự ổn định.
  - `AccessService.requireSubject` → chủ hồ sơ hoặc caregiver có link; người ngoài và admin
    không có care link nhận **404** (không lộ tồn tại hồ sơ).
  - Caregiver thiếu `canReceiveAlerts` → **403** (`assertAction(..., 'receive_alerts')`).
- `POST` → **201** contact; chỉ chủ hồ sơ (caregiver **403**); đếm trong transaction, đủ 5 → **409**
  kèm `details.limit = 5`. Liên hệ đầu tiên tự thành primary; `isPrimary=true` hạ primary cũ
  trong cùng transaction.
- `PATCH /:contactId` → **200**; chỉ chủ; contact không thuộc subject → **404**; bật primary hạ
  primary cũ; bỏ cờ primary của liên hệ chính khi còn liên hệ khác → **400** `VALIDATION_FAILED`
  (dùng `AppError` status 400); nếu chỉ còn một liên hệ thì giữ primary dù client gửi `false`.
- `DELETE /:contactId` → **204**; chỉ chủ; xóa primary thì promote liên hệ **cũ nhất còn lại**
  trong transaction.
- Audit: `emergency_contact.create` / `.update` / `.delete` / `.primary_change`
  (`targetType=emergency_contact`, metadata chỉ `subjectId`, cờ primary, `fields`, id primary
  cũ/mới). **Không** ghi tên, quan hệ hay số điện thoại vào audit metadata.
- Unique partial index `emergency_contacts_primary_uq` được bắt (`isUniqueViolation`) và trả
  **409** thân thiện thay vì 500 khi hai thao tác đổi primary chạy song song.
- Không ghi `realtime_events`/SSE, không log số điện thoại.

### Web — `apps/web/src/features/contacts/`

- `EmergencyContactsSection` (trang chia sẻ, chủ hồ sơ): danh sách tên + quan hệ + số điện thoại
  dạng link `tel:`, badge **"Chính"**; form thêm/sửa validate bằng `emergencyContactInputSchema`
  với thông điệp lỗi tiếng Việt tại trường; xóa có xác nhận hai bước; đủ 5 thì ẩn nút thêm và
  hiện thông báo giới hạn; hint "Người thân có quyền nhận cảnh báo sẽ thấy thông tin này".
  Hỗ trợ `canManage={false}` (chỉ đọc) để phòng thủ nếu sau này trang mở cho caregiver.
- `EmergencyContactCard` (chi tiết cảnh báo): chỉ render khi query thành công; lỗi/đang tải thì
  trả `null` để không chặn nội dung cảnh báo; hiện liên hệ chính + nút **"Gọi"** (`tel:`), các
  liên hệ khác trong `<details>` thu gọn; chưa có liên hệ thì chủ hồ sơ thấy gợi ý + link sang
  trang chia sẻ, caregiver thấy câu "Chủ hồ sơ chưa thêm liên hệ khẩn cấp."
- `AlertDetailPage` chỉ mount card khi hồ sơ của cảnh báo là `owner` hoặc
  `permissions.canReceiveAlerts`; ngược lại không render **và không gọi API**.
- `toTelHref` giữ số và tối đa một dấu `+` ở đầu (bỏ khoảng trắng/ngoặc/chấm/gạch), không tự
  đổi mã quốc gia. `aria-label` chỉ chứa tên người liên hệ ("Gọi Cô Hoa"), không chứa số điện
  thoại; nút "Sửa"/"Xóa" có aria-label kèm tên để trình đọc màn hình phân biệt từng dòng.
- CSS riêng `features/contacts/contacts.css` (token có sẵn, không sửa `layout.css`/`tokens.css`);
  breakpoint `26rem` xếp dọc nút thao tác và khối liên hệ chính.

## Lệnh và kết quả thật (2026-11-15)

| Lệnh | Kết quả |
| --- | --- |
| `pnpm install --prefer-offline --frozen-lockfile` | ok (worktree chưa có `node_modules`) |
| `pnpm --filter @annhien/contracts build` | ok |
| `apps/api`: `pnpm typecheck` | exit 0 |
| `apps/api`: `jest --runInBand test/emergency-contacts.spec.ts` | **1 suite / 12 test pass** |
| `apps/api`: `pnpm test` (toàn bộ) | **15 suite / 112 test pass** (~120 s) |
| `apps/web`: `pnpm typecheck` | exit 0 |
| `apps/web`: `vitest run src/features/contacts` | **2 file / 15 test pass** |
| `apps/web`: `pnpm test` (toàn bộ) | **22 file / 88 test pass** |
| `apps/web`: `pnpm build` | exit 0 |
| Preview Chromium headless (script tạm, đã xóa; API mock ở tầng request) | 1280×900, 390×844, 360×740 × chữ thường/chữ lớn: **6/6 đạt** — `tel:` đúng (`tel:0909123456`, `tel:+84912345678`), `documentElement.scrollWidth == innerWidth` trên cả trang chia sẻ và chi tiết cảnh báo |

Preview tìm và đã sửa 2 lỗi CSS trước khi chốt:
1. Badge "Chính" đè lên tên dài → bọc tên trong `.ec-list__name-text` cho phép xuống dòng.
2. Ở 360px, `flex-basis: 14rem` của khối liên hệ chính bị tính theo **chiều cao** khi
   `flex-direction: column` → reset `flex: 1 1 auto` trong media query.

## Quyết định cần lead biết

1. **Path SharePage trong spec là `features/subjects/SharePage.tsx`, thực tế repo là
   `features/share/SharePage.tsx`** — đã sửa đúng file thật, không tạo file mới.
2. Section quản lý chỉ nằm trên trang chia sẻ của **chủ hồ sơ** (trang này vốn chặn caregiver
   bằng `EmptyState`). Bề mặt "caregiver chỉ đọc" là card trên chi tiết cảnh báo; component
   quản lý vẫn có prop `canManage` để tái sử dụng nếu sau này mở trang.
3. Dùng `AppError` status **400** (code `VALIDATION_FAILED`) cho trường hợp bỏ primary khi còn
   liên hệ khác, đúng yêu cầu 400; `ApiExceptionFilter` map 400 → `VALIDATION_FAILED`.
4. `PATCH` theo hợp đồng `emergencyContactUpdateSchema = emergencyContactInputSchema` nên gửi
   **đầy đủ** name/relationship/phone/isPrimary, không phải partial patch.
5. Query key `emergencyContactsQueryKey` đặt trong `features/contacts/api.ts` (tiền tố
   `['subjects', id, ...]`) thay vì sửa `lib/query.ts` — lead có thể chuyển vào `queryKeys` khi
   tích hợp nếu muốn thống nhất.
6. `MAX_EMERGENCY_CONTACTS = 5` khai báo ở cả API và web (khớp `emergencyContactListSchema`
   max 5); hằng số này không có trong package export nên không dùng chung được ở thời điểm này.
7. Không sửa audit action cũ; action mới dùng tiền tố `emergency_contact.*`. API audit hiện có
   (trang admin) sẽ tự thấy các action này.

## Việc lead cần nối

1. **Bắt buộc:** import `EmergencyContactsModule` vào `apps/api/src/app.module.ts`
   (module đã export sẵn, `AccessModule`/`AuditModule` là `@Global` nên không cần import thêm).
   Chưa nối thì 4 endpoint chưa chạy trên app thật.
2. Web **không cần sửa router/AppShell** cho feature này: `/app/subjects/:id/share` và
   `/app/alerts/:id` đã có route; card/section tự xuất hiện.
3. Cập nhật tài liệu nguồn (worker không được sửa): `docs/04` (4 endpoint mới + quy tắc quyền
   và bất biến một primary/5 liên hệ), `docs/06` (section trang chia sẻ, card trên cảnh báo),
   `docs/08` (ánh xạ FR-09/NFR-01/NFR-05 → test), `docs/14` nếu cần; sinh lại HTML và chạy
   `tools/docs/build.py --check`.
4. Chạy lại cổng cuối ở cây đã nối module (API full test, web test/build, E2E). E2E thật cho
   luồng này **chưa chạy** vì module chưa mount; preview ở trên dùng API mock.

## Chưa làm / rủi ro

- Chưa có E2E xuyên API + web thật (xem trên).
- Chưa kiểm bằng trình đọc màn hình thật (NVDA/VoiceOver); chỉ kiểm cấu trúc ARIA qua test và
  Playwright (heading, link có tên, `<details>` mở/đóng, không tràn ngang 360/390/chữ lớn).
- Chưa có optimistic update: sau create/update/delete UI chờ invalidate + refetch (mạng chậm sẽ
  thấy danh sách cũ trong ~1 nhịp).
- Chưa chặn trùng số điện thoại (không có yêu cầu; cùng một số có thể xuất hiện ở hai liên hệ).
- Audit ghi trong transaction với thao tác đổi primary/xóa; trường hợp insert/update thường cũng
  nằm trong transaction nên không có audit "mồ côi".
- Giới hạn 5 được kiểm trong transaction nhưng không khóa hàng hồ sơ; hai request tạo đồng thời
  có thể cùng qua bước đếm (PGlite tuần tự trong test; PostgreSQL vẫn có thể vượt 5 trong race).
  Nếu cần chặn tuyệt đối, lead có thể thêm `SELECT ... FOR UPDATE` trên `subjects` hoặc check
  constraint — chưa làm vì ngoài yêu cầu.
