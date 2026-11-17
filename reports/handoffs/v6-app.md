# Handoff — v6-app: bỏ card hồ sơ, gọn Hôm nay/Người thân

- **Thời điểm:** 2026-11-15 20:05 (Asia/Ho_Chi_Minh)
- **Nhánh:** `v6-app` (base `08fd3b5`, HEAD lúc bắt đầu `03672cc`), **không merge**.
- **Commit code:** `065699b` — `feat(web): bỏ card hồ sơ, gọn Hôm nay và Người thân`.
- **Phạm vi đã sửa:** `features/assistant/AssistantPage.tsx` + `.test.tsx`,
  `features/subjects/SubjectsPage.tsx` + `.test.tsx`,
  `features/subjects/SubjectSwitcher.tsx` + `.test.tsx`, `styles/app-simple.css`.
  Không sửa `AppShell.tsx`, router, public pages, API/contracts, `layout.css`, `subjects.css`.
- **Việc chạy tại chỗ:** dev server tạm cổng **4330** (Vite trong worktree) proxy tới API demo
  đang chạy sẵn ở cổng 3000; đăng nhập qua API với `Origin: http://localhost:5173` (API chỉ
  cho origin đó ở thao tác ghi). Không seed lại DB, không ghi/xóa dữ liệu demo.

## Đã làm

### Hôm nay (`/app`) — `AssistantPage.tsx`

- Bỏ hẳn `<SubjectSwitcher />` (card `HỒ SƠ ĐANG XEM · CHỦ HỒ SƠ` full-width và link
  “Quản lý và chia sẻ”) khỏi nội dung trang.
- Thay bằng **một dòng ngữ cảnh gọn dưới H1** (`SubjectContextLine`):
  - 1 hồ sơ: chỉ tên (`Bà Trần Thị An`); hồ sơ được chia sẻ thêm chữ nhỏ `Người thân`.
  - >1 hồ sơ: một `<select>` nhỏ cùng hàng (nhãn trợ năng `Chọn hồ sơ`), chọn xong gọi
    `setActiveSubjectId` — dùng chung store với các trang khác.
  - Không nhãn “Hồ sơ đang xem”, không link quản lý, không khung card; tên chỉ xuất hiện một lần.
  - Giữ trạng thái đang tải (một câu + `role="status"`), 404 (“Chưa kết nối được dữ liệu hồ sơ.”),
    lỗi khác (“Không tải được danh sách hồ sơ.” + `Thử lại`), rỗng (“Chưa có hồ sơ nào.” +
    link `Tạo hồ sơ` → `/app/subjects`).
- Chuyển `Sức khỏe 7 ngày →` và `Dữ liệu mô phỏng · không thay thế cấp cứu.` vào **một khối
  `.today-meta` ngay dưới thẻ trạng thái, trên ô hỏi**. Không thêm nội dung mới; hội thoại dài
  không còn đẩy hai dòng này xuống đáy trang (trước đây chúng nằm sau cả section hỏi/hội thoại,
  dòng giới hạn nằm ngoài fragment nên luôn ở cuối trang). Khi chưa có hồ sơ, dòng giới hạn
  vẫn hiện ngay dưới dòng ngữ cảnh, không đặt sau ô hỏi.
- Đổi heading ẩn của vùng hỏi từ “Hỏi về hồ sơ đang xem” thành “Hỏi trợ lý về hồ sơ này”
  (tránh lặp lại nhãn “Hồ sơ đang xem”; a11y không đổi).
- Giữ nguyên: thẻ trạng thái cảnh báo/calm/lỗi, 403 số đo/cảnh báo, offline/stale, nút Gọi/Xem
  cảnh báo, ô hỏi + 3 gợi ý, reset hội thoại khi đổi hồ sơ, chặn phản hồi muộn, 429/403/rate.

### Người thân (`/app/subjects`) — `SubjectsPage.tsx`

- Header **một hàng**: H1 `Người thân` + nút `Thêm người` (`aria-expanded`/`aria-controls`);
  bấm mở form tạo tại chỗ ngay dưới header, bấm `Đóng` hoặc `Hủy` để đóng. Bỏ section
  `Thêm người`/`Tạo hồ sơ mới` tách rời ở cuối trang và bỏ card settings.
- Danh sách là **hàng gọn**, phân cách bằng đường mảnh (không nền/shadow/bo góc kiểu card):
  - tên + vai trò (`Chủ hồ sơ` / `Người thân xem hộ`) + trạng thái quyền
    (`nhận cảnh báo` / `không nhận cảnh báo`, thêm `không xem số đo` khi bị hạn chế);
  - actions text-link gọn `Xem sức khỏe`, `Chia sẻ` (chỉ chủ hồ sơ), `Thiết bị`;
  - `Thêm thao tác` (details) đặt cuối hàng, giữ nguyên `Sửa tên` / `Lưu trữ hồ sơ` /
    `Yêu cầu xóa dữ liệu`, quyền `isOwner` và toàn bộ bước xác nhận gõ đúng tên.
- **Sửa bug chọn hồ sơ:** `Xem sức khỏe` và `Thiết bị` gọi `setActiveSubjectId(item.id)`
  **trước khi** điều hướng. Đã kiểm trên trình duyệt thật với tài khoản có 2 hồ sơ.
- Form sửa tên chuyển xuống khối riêng dưới hàng (không còn nằm giữa cụm actions); khi đang sửa
  thì ẩn `Thêm thao tác`; lưu/xóa vẫn dùng mutation và thông báo hiện có.
- Empty: một câu ngắn “Chưa có hồ sơ nào…” + nút `Thêm người` ở header (không tự mở form).

### `SubjectSwitcher.tsx`

- Thay nội dung bằng `SubjectContextLine` (compact). Giữ export tên cũ
  `SubjectSwitcher` nhưng **không render gì** trong lúc chờ nhánh `v6-shell` bỏ lời gọi ở
  `AppShell.tsx`; nếu xóa file ngay thì nhánh app (base `08fd3b5`) không build được vì AppShell
  còn import. Sau khi merge `v6-shell` có thể xóa export tương thích này.
- Không còn element `.subject-switcher`/card ở bất kỳ trang nào trong phạm vi nhánh này.

### CSS — `styles/app-simple.css` (phần app pages)

- `.subject-context*`: dòng ngữ cảnh, select nhỏ có gạch chân, focus-visible, nút `Thử lại`.
- `.today-meta`: hàng link + giới hạn dưới thẻ trạng thái.
- `.subjects-page__header/__create/__empty`, `.subject-list*`: hàng gọn, đường phân cách,
  action text-link vùng chạm 44px, disclosure gập, form sửa, panel nguy hiểm giữ nguyên style
  từ `subjects.css`. Mobile: H1 hạ còn `--text-xl` để header vẫn một hàng ở 360 (kể cả chữ lớn).
- Không sửa `layout.css`/`subjects.css`; các rule cũ của `.subject-switcher` vẫn còn trong
  `layout.css` nhưng không còn element dùng (trừ class `subject-switcher__hint` ở `InvitePage`).

## Kiểm chứng thật

### Unit test / typecheck / build (trong `apps/web`)

```text
$ pnpm test
 Test Files  35 passed (35)
      Tests  259 passed (259)
$ pnpm typecheck   # tsc -p tsconfig.json --noEmit, exit 0
$ pnpm build       # tsc + vite build, ✓ built
```

Test tăng 250 → 259, không nới assertion cũ:

- `AssistantPage.test.tsx`: thêm kiểm không còn “Hồ sơ đang xem”/“Quản lý và chia sẻ”; kiểm
  link `Sức khỏe 7 ngày` + dòng giới hạn cùng khối `.today-meta`, đứng trước ô hỏi và vẫn trước
  `role=log` sau khi hỏi; kiểm select nhiều hồ sơ đổi active và xóa hội thoại cũ.
- `SubjectSwitcher.test.tsx`: viết lại theo dòng ngữ cảnh — 1 hồ sơ chỉ tên/không select/không
  card; hồ sơ chia sẻ có vai trò `Người thân`; nhiều hồ sơ select đổi `localStorage`; rỗng có CTA;
  404 không lỗi thô/không retry; 500 có `Thử lại` và tải lại danh sách.
- `SubjectsPage.test.tsx`: giữ toàn bộ test FR-14; thêm `Xem sức khỏe` và `Thiết bị` đổi active
  rồi mới điều hướng; form `Thêm người` mở/đóng tại chỗ; empty vẫn mở được form.

### Trình duyệt thật (Playwright/Chromium, dev tạm 4330 → API 3000)

Ảnh: `C:/tmp/v6-app-ui/after/` (không nằm trong repo; trước khi sửa: `C:/tmp/v6-app-ui/before/`).

| Trang | Tài khoản | Cỡ | overflow | Ghi chú đo |
| --- | --- | --- | --- | --- |
| `/app` | chủ (1 hồ sơ) | 1280×900 | 0 | tên một dòng dưới H1; status 151–311, meta 328–357, ask 374–521 |
| `/app` | chủ | 390×844 / 360×740 | 0 | meta 329–384 / 351–406, ngay dưới status, trong màn đầu |
| `/app` | chủ | 1280×900-large | 0 | meta 385–418; không tràn |
| `/app` | người thân (2 hồ sơ) | 1280/390/360/large | 0 | select 2 lựa chọn; đổi chọn ghi đúng `an:active-subject-id` |
| `/app/subjects` | chủ | 1280×900 | 0 | H1 + `Thêm người` cùng hàng; hàng hồ sơ cao 56px |
| `/app/subjects` | chủ | 390×844 / 360×740 | 0 | header vẫn một hàng; hàng hồ sơ 158px (actions xuống dòng) |
| `/app/subjects` | người thân | 1280/390/360/large | 0 | 2 hàng gọn; caregiver không thấy `Chia sẻ`/`Thêm thao tác` |

- 24 lượt xem (2 tài khoản × 6 cỡ × 2 trang): **0 tràn ngang**, **0 console error**.
- Form `Thêm người` mở ở 1280 và 390: form hiện, `Đóng`/`Hủy` đóng đúng, không tràn.
- Mở `Thêm thao tác` ở 1280/390: body gập mở đúng, không tràn; mở panel `Lưu trữ hồ sơ`:
  vẫn đủ lý do + xác nhận tên, không tràn.
- **Bug active subject (đo thật):** đặt active = hồ sơ 1 (`aaaa…`), mở `/app/subjects`, bấm
  `Xem sức khỏe` ở hàng hồ sơ 2 (`Ông Nguyễn Văn Bình`, id `bbbb…`):
  `localStorage` đổi sang `bbbb…`; các request sau điều hướng là
  `/subjects/bbbb…/alerts|events|insights|status|daily-summary`; trang Sức khỏe hiện
  “Chưa gắn thiết bị nào cho hồ sơ này” (đúng hồ sơ 2). Ảnh
  `overview-after-xem-suc-khoe-1280x900.png`.
- Đăng nhập demo dùng `ba-an@demo.annhien.local` (1 hồ sơ) và `minh@demo.annhien.local`
  (2 hồ sơ); không đổi mật khẩu, không seed lại, không xác nhận/đóng cảnh báo.

## Chưa làm / lưu ý

- Không sửa shell/nav/brand theo `v6-shell`: ảnh vẫn còn nav “Thêm”, brand “An Nhiên” và khối
  tài khoản kiểu v4 — đúng phạm vi file được phép.
- Export tương thích `SubjectSwitcher` (render `null`) cần xóa sau khi `v6-shell` bỏ import ở
  `AppShell.tsx`; hiện giữ để nhánh `v6-app` tự build/đứng riêng.
- Không chạy bộ Playwright e2e có sẵn (`e2e/*.spec.ts`, cấu hình cổng 5173) và không chạy
  test API/simulator (không đổi API/contracts).
- Không kiểm Firefox/WebKit, thiết bị thật, landscape, trình đọc màn hình thật; chưa có
  review độc lập cho nhánh này. Các số trên là đo cục bộ, không phải nghiệm thu sản phẩm.
