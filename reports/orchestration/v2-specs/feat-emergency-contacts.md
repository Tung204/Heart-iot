# Feature worker — feat-emergency-contacts

Bạn là **feature worker** trên worktree riêng, làm một phần dọc (API + UI + test), không làm cả sản phẩm.

Trước khi làm: đọc `AGENTS.md`, `docs/02`, `docs/03`, `docs/04`, `docs/06`, `docs/12`, `docs/14`, code liên quan, `git log -3`.
Chạy `pnpm install --prefer-offline --frozen-lockfile` và `pnpm --filter @annhien/contracts build` nếu worktree chưa có dependency/dist. HEAD đã có contract/bảng/migration 0001; không sửa migration.

Quy tắc: chỉ sửa vùng được giao; **không** sửa `apps/api/src/app.module.ts`, `apps/web/src/app/router.tsx`, `apps/web/src/app/AppShell.tsx`, `apps/web/src/styles/layout.css`, `tokens.css`, README/docs/HTML hoặc package export — lead sẽ nối. Không sửa/xóa test hợp lệ để làm xanh; không bịa số liệu; không báo đã chạy nếu chưa chạy. Chạy test hẹp nhất + typecheck. Commit trên nhánh riêng, không merge master. Viết `reports/handoffs/v2-feat-emergency-contacts.md` với file, lệnh/kết quả, quyết định, rủi ro, việc lead cần nối. Kết thúc báo cáo ngắn: commit hash, test counts, file cần nối, điểm chưa làm.

## Mục tiêu
Quản lý **liên hệ khẩn cấp** của hồ sơ và hiển thị liên hệ chính ngay trên chi tiết cảnh báo để người thân gọi nhanh.

## Vùng được sửa
- `packages/contracts/src/contacts.ts` (đã có; chỉ dùng)
- `apps/api/src/database/schema.ts`: **đã có bảng `emergencyContacts` + migration 0001**, không sửa migration
- `apps/api/src/emergency-contacts/**` (module/controller/service mới)
- `apps/api/test/emergency-contacts.spec.ts` (mới)
- `apps/web/src/features/subjects/SharePage.tsx` (chỉ thêm section quản lý; không đổi phần mời/thu hồi hiện có)
- `apps/web/src/features/alerts/AlertDetailPage.tsx` (chỉ thêm card liên hệ khẩn cấp)
- `apps/web/src/features/contacts/**` (mới: api/hook/component/css)
- Không sửa app.module/router/layout.css; lead sẽ import module.

## API
- `GET /subjects/:id/emergency-contacts` → `emergencyContactListSchema` `{items}` tối đa 5, sắp primary trước rồi createdAt.
  - Chủ hồ sơ: được; caregiver có link + `canReceiveAlerts`: được đọc; caregiver thiếu quyền: 403; người ngoài/admin không link: 404.
- `POST /subjects/:id/emergency-contacts` → 201 contact; **chỉ chủ hồ sơ**; caregiver 403; tối đa 5 → 409. Liên hệ đầu tiên tự thành primary nếu không chọn; nếu `isPrimary=true`, hạ primary cũ trong transaction.
- `PATCH /subjects/:id/emergency-contacts/:contactId` → 200; chỉ chủ; contact phải thuộc subject (nếu không 404); bật primary hạ primary cũ; không cho bỏ primary của liên hệ chính khi còn liên hệ khác (400) để luôn có một liên hệ chính; nếu chỉ còn một, giữ primary.
- `DELETE ...` → 204; chỉ chủ; xóa primary thì tự chọn liên hệ cũ nhất còn lại làm primary; audit create/update/delete/primary change, **không ghi số điện thoại vào audit metadata**.
- Không trả phone cho admin không có care link. Không đưa contact vào SSE/log.
- Dùng `AccessService`; transaction khi đổi primary/delete; unique partial index có thể ném lỗi, bắt và trả 409 thân thiện.

## UI
- SharePage (chủ hồ sơ): section "Liên hệ khẩn cấp" sau phần chia sẻ; list tên/quan hệ/số điện thoại dạng `tel:`; badge "Chính"; nút Thêm/Sửa/Xóa có xác nhận; form tối đa 5, thông báo giới hạn; hint "Người thân có quyền nhận cảnh báo sẽ thấy thông tin này."
- AlertDetailPage: card "Liên hệ khẩn cấp" chỉ khi tải được; hiện liên hệ chính + nút "Gọi" (`tel:`), các liên hệ khác thu gọn; nếu chưa có, hint chủ hồ sơ thêm; lỗi tải không chặn nội dung cảnh báo; không hiển thị với người không có quyền.
- Responsive 360/390/chữ lớn; không lộ số điện thoại trong aria-label dài không cần thiết; focus/confirm rõ.

## Kiểm thử tối thiểu
API: owner CRUD; caregiver đọc khi có quyền, 403 khi thiếu; outsider/admin 404; giới hạn 5; primary duy nhất; bật primary hạ cũ; xóa primary promote; contact subject khác 404; validation phone/tên; audit không chứa phone.
Web: owner thêm/sửa/xóa; max 5; caregiver chỉ đọc; AlertDetail hiện primary + tel link; lỗi tải không phá cảnh báo; accessible.
