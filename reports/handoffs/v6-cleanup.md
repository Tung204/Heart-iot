# Handoff — v6 cleanup: bỏ Studio khỏi shell, gọn copy landing

**Nhánh:** `v6-cleanup` (base `a51f6b3`), **không merge**.
**Commit code:** `a72c9fe` — `feat(web): bỏ link Studio khỏi shell, gọn copy landing v6`.
**Phạm vi đã sửa:** `apps/web/src/app/AppShell.tsx` + `AppShell.test.tsx`,
`apps/web/src/pages/LandingPage.tsx` + `LandingPage.test.tsx`,
`apps/web/src/styles/{base,layout,tokens}.css` (chỉ comment),
`apps/web/src/features/subjects/selection.ts` (chỉ comment).
Không đổi API/contracts/router/public pages; không merge.
**Thời điểm đo:** 15/11/2026 20:12 (Asia/Ho_Chi_Minh).

## 1. Đã làm

| Yêu cầu | Cách làm | Bằng chứng |
| --- | --- | --- |
| Bỏ `Studio` khỏi menu tài khoản | Xóa `NavLink` `/app/studio` khỏi `AccountMenu`; bỏ prop `isStudioUser` và biến `isStudioUser` trong `AppShell` (không còn dùng). Menu chỉ còn `Tài khoản`, mục `Quản trị` cho admin, `Aa` chữ lớn và `Đăng xuất`. | Test `admin … không có Studio`, `chủ hồ sơ → menu chỉ có Tài khoản, KHÔNG có Studio/Quản trị`, `caregiver …`; ảnh `app-menu-390x844.png`. |
| Giữ route `/app/studio*` | Không sửa `router.tsx`; route lazy vẫn render trực tiếp. | Test mới `không còn link Studio trong shell; /app/studio vẫn mở trực tiếp`; visual `/app/studio` giữ URL và H1 `Studio`. |
| H2 landing | `Theo dõi sức khỏe làm gì` → `Ứng dụng làm gì`. | Test heading level 2; ảnh `landing-390x844.png`. |
| Hero lead bỏ lặp tên | Copy đúng câu yêu cầu: “Nhịp tim, vận động và kết nối thiết bị của người thân được ghi lại; bạn nhận cảnh báo khi có bất thường. Trợ lý AI trả lời câu hỏi về số liệu của người thân.” | Test so khớp nguyên câu trong `.hero`; visual `leadOk=true`. |
| Không đổi CTA/dòng an toàn | Giữ nguyên `Tạo tài khoản`, `Đăng nhập`, `Mở ứng dụng` và `HERO_SAFETY_NOTE`. | Test CTA/dòng an toàn cũ vẫn pass; visual `safetyOk=true`. |
| Comment CSS | Đổi `An Nhiên — …` thành `Theo dõi sức khỏe — …` ở `base.css`, `layout.css`, `tokens.css`; không đổi rule CSS. | `git diff --stat`: mỗi file 1 dòng đổi; build pass. |
| Comment `selection.ts` | `Hồ sơ đang xem hiệu lực` → `Hồ sơ đang chọn hiệu lực`; không đổi logic. | Diff chỉ 1 dòng comment; test subjects/shell vẫn pass. |

## 2. Test đã sửa/thêm

- `AppShell.test.tsx`: cập nhật kỳ vọng menu owner/admin không còn `Studio`; thêm test route Studio vẫn mở trực tiếp nhưng shell không có link; test bàn phím dùng nút `Bật chữ lớn` thay cho mục Studio đã bỏ.
- `LandingPage.test.tsx`: kỳ vọng H2 `Ứng dụng làm gì`; khẳng định nguyên câu hero lead mới.
- Không nới/bỏ test quyền, badge, SSE, menu, focus, CTA hay dòng an toàn.

## 3. Kiểm chứng đã chạy

```text
pnpm build:contracts                        exit 0
pnpm --filter @annhien/web typecheck        exit 0
pnpm --filter @annhien/web test             35 file / 263 test pass
pnpm --filter @annhien/web build            exit 0
```

Grep `An Nhiên` trong `apps/web/src`: **0** ngoài test âm bản (6 dòng, đều là
`queryByText`/`queryByRole` khẳng định không còn tên cũ).

Trình duyệt: Chromium headless (Playwright) tại 390×844. API riêng cổng **3100**
(PGlite `.data/pglite-v6-cleanup`, seed demo tổng hợp) và Vite dev cổng **4210**
proxy `/api` → 3100; không dùng API/web đang chạy ở 3000/5173 (thuộc worktree khác).
Đăng nhập bằng form với `ba-an@demo.annhien.local` (owner) và `admin@demo.annhien.local`;
không tạo/sửa/xóa dữ liệu, không ack/đóng cảnh báo.

| Điều kiện | Kết quả |
| --- | --- |
| Landing 390×844 | H2 `Ứng dụng làm gì`; hero lead đúng câu; dòng an toàn đủ 4 ý; không thấy “An Nhiên”; tràn ngang `scrollWidth = clientWidth = 390`. |
| App 390×844 (owner) | Nav đủ 4 mục; menu `Tài khoản`, `Đăng xuất` — **không Studio**, không Quản trị; menu nằm trong viewport; tràn ngang 0. |
| App 390×844 (admin) | Vào `/app/admin`; menu `Tài khoản`, `Quản trị`, `Đăng xuất` — **không Studio**; tràn ngang 0. |
| `/app/studio` trực tiếp (owner) | URL giữ `/app/studio`, H1 `Studio`; route không bị xóa. |

Ảnh và số đo thô ở `C:/tmp/v6-cleanup/`:
`landing-390x844.png`, `app-390x844.png`, `app-menu-390x844.png`,
`studio-390x844.png`, `app-admin-menu-390x844.png`, `results.json`.

## 4. Chưa làm / cần biết

- Tài liệu `docs/06-trai-nghiem-va-man-hinh.md` (và `docs/html/index.html` sinh từ đó)
  vẫn còn mô tả nav “Thêm” và Studio trong menu từ thời v2; nằm ngoài danh sách file
  được phép sửa của việc này nên **chưa cập nhật**, cần một việc tài liệu riêng.
- Không chạy lại bộ Playwright E2E có sẵn (cấu hình trỏ cổng 5173/3000 và chỉ kiểm public);
  kiểm tra bằng script Chromium riêng nêu trên.
- Console có một lỗi `401 Unauthorized` khi trang khách gọi `/me` — hành vi có sẵn, đúng
  thiết kế (khách chưa đăng nhập), không liên quan thay đổi này.
- Không merge; không đổi API/quyền/dữ liệu.
