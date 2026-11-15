# Review độc lập v2 — Accessibility và khả năng dùng với người cao tuổi/người chăm sóc

**Ngày:** 15/11/2026 07:14 (+07:00) · **Reviewer:** phiên `qa-accessibility` (chỉ đọc mã, tự chạy lại)
**HEAD của worktree review:** `8434d66` — *perf(web): tách chunk theo route và thống nhất quyền xem cảnh báo* (v1.1)
**Ứng dụng đã kiểm:** instance của lead ở `http://localhost:5173` (Vite) + `http://localhost:3000` (API), checkout lead ở `c796f2e`.
Đã đối chiếu: `git diff --stat 8434d66 c796f2e -- apps/web` **rỗng** → mã web trùng HEAD review. `apps/api`/`packages/contracts` có thêm migration + contract (insights/tasks/contacts) nhưng không đổi hành vi web.
**Không sửa mã sản phẩm, không sửa docs, không commit.** Chỉ tạo file báo cáo này.

---

## 1. Môi trường và công cụ

| Thành phần | Giá trị |
| --- | --- |
| OS | Windows (shell qua MSYS bash), Node `v24.22.2`, pnpm `12.5.1` |
| Dependency | `pnpm install --prefer-offline --frozen-lockfile` trong worktree này, hoàn tất 17,8 s, **không đổi `pnpm-lock.yaml`** |
| Trình duyệt | Playwright `1.65.1` → Chromium `159.0.8154.6`, headless |
| Axe | `axe-core 4.14.0` (cài ngoài repo tại `C:/tmp/qa-a11y`, inject `axe.min.js` bằng `page.addScriptTag`) |
| App/API | dùng instance đang chạy của lead; **không** khởi động API riêng, **không** dùng `.data/pglite` |
| Script kiểm | `C:/tmp/qa-a11y/{axe-audit,keyboard,layout,deep,probe,probe2,overlap,chart,demo-label}.mjs` (thư mục tạm ngoài repo, có thể bị xoá) |

Luật axe dùng cho mỗi lần quét: `runOnly: wcag2a, wcag2aa, wcag21a, wcag21aa, wcag22aa, best-practice`; tổng **50 lượt**: 15 route × 3 viewport (45) + 3 tab Quản trị + 2 trang vai người thân.

---

## 2. Phạm vi kiểm

### Đã kiểm (có chạy thật)

1. **Axe/WCAG AA** trên 15 route: `/`, `/login`, `/register`, `/app`, `/app/history`, `/app/alerts`, `/app/alerts/:id`, `/app/devices`, `/app/notifications`, `/app/subjects`, `/app/assistant`, `/app/tasks`, `/app/studio`, `/app/subjects/:id/share`, `/app/admin` (4 tab), ở `1280×900`, `390×844`, `360×740`, cộng vai người thân ở 390×844.
2. **Bàn phím**: đăng nhập (gồm submit rỗng), skip link, thứ tự tab desktop/mobile, mở menu “Thêm”, chuyển hồ sơ (người thân có 2 hồ sơ), “Xác nhận”/“Đóng cảnh báo”, form mời chia sẻ, xác nhận thu hồi quyền, panel tạm khoá người dùng, đóng công việc, đổi tab Quản trị, gửi câu hỏi Trợ lý.
3. **Focus**: focus ring (`:focus-visible`), focus bị mất sau thao tác, focus có bị che bởi thanh cố định.
4. **Co giãn**: `360px`, `390px`, `320px`, `1280px`, chế độ “chữ lớn” của ứng dụng (17px→20px), ép `150%` và `200%` cỡ chữ gốc, và `640×450` (tương đương zoom 200% của 1280×900).
5. **Tràn ngang, cắt chữ, đè nav**: đo `scrollWidth` → `innerWidth`, quét phần tử vượt viewport, so `bottom` phần tử với `top` của `.shell__bottomnav` sau khi cuộn hết trang.
6. **Ngôn ngữ/ngữ nghĩa**: `lang`, heading, landmark, `aria-current`, label form, ARIA live/alert, `prefers-reduced-motion`, nhãn dữ liệu mô phỏng.

### Chưa kiểm / không tự động hoá được

- **Trình đọc màn hình thật** (NVDA/JAWS/VoiceOver), **TalkBack** trên điện thoại thật; kiểm “dùng được với người cao tuổi” cần người thật theo `docs/08` và `docs/14` (ngoài phạm vi v1).
- **Firefox/Safari**: chỉ có Chromium. Các kết luận về vùng cuộn bằng bàn phím (F-P2-6) phụ thuộc hành vi trình duyệt.
- **Độ tương phản ở trạng thái hover/disabled** không quét hết; axe chỉ đánh giá trạng thái đang render.
- **Đăng ký/đăng nhập bằng tài khoản mới, luồng chấp nhận lời mời `/invite/:token`, Web Push** — không kiểm.
- **Kiểm tải/độ trễ, SSE khi mất mạng** — ngoài phạm vi accessibility.
- **Không** kiểm với dữ liệu sức khỏe thật; toàn bộ là seed tổng hợp.

---

## 3. Tổng hợp axe

50 lượt quét: **25 lượt sạch, 25 lượt có vi phạm** (18 lượt có `color-contrast`, tổng 59 phần tử tương phản; 3 lượt có 2 luật cùng lúc).

| Luật | Mức | Số lượt | Số phần tử | Trang |
| --- | --- | --- | --- | --- |
| `color-contrast` | serious | 18 | 59 | landing, mọi trang `/app` ở ≥1024px, `/app/admin` (3 tab), `/app/subjects/:id/share` |
| `heading-order` | moderate | 5 | 5 | `/app/alerts/:id` (3 viewport + vai người thân), tab “Chính sách thiết bị” |
| `aria-prohibited-attr` | serious | 3 | 3 | `/app/notifications` (mọi viewport) |
| `scrollable-region-focusable` | serious | 2 | 2 | `/app/history` ở 390px và 360px |

Ở 390px/360px, các trang `/app` **không** còn vi phạm tương phản (sidebar bị ẩn) — đúng như thiết kế token.

---

## 4. Findings

### P0

Không có. Không phát hiện lỗi chặn hoàn toàn luồng chính, rò dữ liệu qua UI hay mất nội dung khi co giãn trong 4 cấu hình mà `docs/06:76` đã tuyên bố.

---

### P1 — nên sửa trước khi coi là “đạt AA ở các màn hình chính”

#### F-P1-1. Chữ phụ trên nền `paper-deep` chỉ đạt 4.35:1 (< 4.5:1), gồm cả **dòng cảnh báo an toàn**

- **Nguồn:** `apps/web/src/styles/tokens.css:13` (`--color-paper-deep: #f2ead9`), `:20` (`--color-ink-muted: #5b6f81`);
  `apps/web/src/styles/layout.css:353-357` (`.site-footer__note`), `:348-351` (`.site-footer` nền `paper-deep`), `:651-652` (`.shell__tagline`), `:711-712` (`.shell__user-email`), `:721-726` (`.shell__safety-note`, 13,8px), `:1475-1485` (`.shell__more-toggle`).
- **Tái hiện:** đăng nhập chủ hồ sơ, mở `/app` ở 1280×900, chạy axe (luật `color-contrast`) → 4 node:
  `.shell__tagline`, `.shell__more-toggle > span`, `.shell__user-email`, `.shell__safety-note`.
  Landing/login/register → 1 node `.site-footer__note`.
- **Expected:** ≥ 4.5:1 cho chữ thường (< 18,66px hoặc < 24px không bold).
- **Actual:** axe `insufficient color contrast of 4.34 (foreground #5b6f81, background #f2ead9)`; tự tính lại cùng kết quả **4.35:1** (công thức WCAG 2.x). Trên nền `--color-paper` `#faf6ed` cùng màu chữ đạt 4.82:1 → lỗi chỉ xảy ra ở bề mặt `paper-deep`.
- **Vì sao P1:** đây là **dòng cảnh báo an toàn** ở sidebar desktop (“Cảnh báo chỉ hiển thị khi trang đang mở. Bản demo không tự gọi cấp cứu.”) và disclaimer ở footer công khai; cỡ chữ nhỏ nhất trong ứng dụng (13,8px) — đúng nhóm người dùng đích (giảm thị lực). Axe xếp `serious`. Lưu ý phạm vi: dòng cảnh báo trong sidebar chỉ hiển thị ở ≥1024px; ở mobile nội dung tương đương nằm trong thẻ “Giới hạn của bản demo” (không thuộc lỗi này).
- **Đề xuất:** tăng tương phản `--color-ink-muted` (ví dụ `#4c5f70` ≈ 5,0:1 trên `paper-deep`) hoặc dùng `--color-ink-soft` cho các bề mặt `paper-deep`; kiểm lại bằng axe + đo tay.

#### F-P1-2. “Xác nhận” cảnh báo thất bại **im lặng** khi lỗi không phải 409

- **Nguồn:** `apps/web/src/features/alerts/AlertsPage.tsx:56-74` (mutation chỉ xử lý `isConflictError`), `:205-214` (nút “Xác nhận”, `disabled` theo `acknowledge.isPending`, không render `acknowledge.isError`); so sánh `features/tasks/TasksPage.tsx:300` (có hiển thị lỗi) và `features/notifications/NotificationsPage.tsx:130-133` (có hiển thị lỗi).
- **Tái hiện:** mở `/app/alerts` ở 390×844, chặn `POST **/api/v1/alerts/*/acknowledge` trả `500` bằng `page.route(...)` (không cần sửa DB/API), bấm “Xác nhận”, đợi 1,5 s.
- **Expected:** thông báo lỗi + hướng thử lại (như trang Công việc/Thông báo).
- **Actual:** không có `[role=alert]`, `[role=status]`, `.alert` nào xuất hiện; nút trở lại trạng thái bình thường; danh sách không đổi. Người chăm sóc có thể tin rằng mình **đã** nhận trách nhiệm hỗ trợ trong khi server chưa ghi.
- **Đề xuất:** thêm nhánh `acknowledge.isError && !isConflictError` → `Alert tone="error"` + nút “Thử lại”; nên chặn cả khi mất mạng.

---

### P2

#### F-P2-1. Sau thao tác thành công: không có thông báo cho trình đọc màn hình và **focus rơi về `<body>`**

- **Nguồn:** `AlertsPage.tsx:59-66` (không có live region), `NotificationsPage.tsx:115-116`, `features/subjects/SubjectSwitcher.tsx:67-68,94` (chuyển hồ sơ chỉ đổi dữ liệu, không thông báo).
- **Tái hiện (bàn phím):** `/app/alerts` 390×844 → Tab tới “Xác nhận” → Enter. Đo `document.activeElement` sau 2 s.
- **Actual:** `activeElement = BODY`; truy vấn `[role=alert],[role=status],[aria-live]` trả **rỗng**; dòng cảnh báo chỉ đổi chữ “Đang mở” → “Đã xác nhận” và thêm “đã xác nhận bởi …”. Cùng hành vi với “Đánh dấu đã đọc” (thông báo) và khi gửi câu hỏi Trợ lý (`AssistantPage.tsx:83-93`, `.ai-answer` không có `role`/`aria-live`).
- **Expected:** vùng `aria-live="polite"` (hoặc `role="status"`) xác nhận “Đã xác nhận cảnh báo…”, và giữ focus ở nút vừa bấm/ô kế tiếp.
- **Đề xuất:** thêm live region cấp trang trong khung `AppShell` (một chỗ dùng chung), phát thông điệp ngắn sau ack/đọc thông báo/lưu; đặt lại focus hợp lý.

#### F-P2-2. Panel xác nhận tại chỗ **thay thế nút bấm** → mất focus (4 luồng)

- **Nguồn:** `features/share/SharePage.tsx:386-410` (thu hồi quyền), `features/admin/AdminPage.tsx:273-334` (tạm khoá/kích hoạt người dùng), `features/tasks/TasksPage.tsx:248-268` (đóng công việc), `features/devices/DevicesPage.tsx:181-204` (tháo gắn thiết bị). Mẫu chung: nút được render có điều kiện, khi bấm thì bị thay bằng `.confirm-box`/`form.adm-confirm`.
- **Tái hiện:** `/app/admin` → tab “Người dùng” → focus “Tạm khóa” → Enter. Rồi bấm “Hủy”.
- **Actual:** sau khi mở panel `activeElement = BODY`; sau “Hủy” cũng `BODY`. Panel chỉ có `role="group"` + `aria-label`, không được thông báo, và không đóng bằng `Escape`.
- **Expected:** chuyển focus vào phần tử đầu tiên của panel (ví dụ ô “Lý do”), `Escape` đóng và trả focus về nút gốc (mẫu disclosure/dialog của ARIA APG).
- **Đề xuất:** một component `ConfirmInline` dùng chung: `ref` + `focus()` khi mở, `Escape` đóng, trả focus; hoặc dùng `<dialog>` native nếu muốn chặn nền.

#### F-P2-3. Menu “Thêm”: không đóng bằng `Escape`/bấm ra ngoài, `aria-haspopup="true"` sai ngữ nghĩa

- **Nguồn:** `apps/web/src/app/AppShell.tsx:196-224` (nút ở `:197-206`, menu ở `:207-222`) — chỉ có `onClick` toggle, không `keydown`/`Escape`, không xử lý click ngoài; `aria-haspopup="true"` (`:201`) tương đương `menu` nhưng nội dung là các `NavLink`; menu không có `id`/`role` nên không có `aria-controls`.
- **Tái hiện:** 390×844 → focus “Thêm” → Enter (mở, `aria-expanded=true`) → `Escape`; rồi bấm vào vùng nội dung phía trên menu.
- **Actual:** `aria-expanded` vẫn `true`, menu 187×255 vẫn phủ lên nội dung. Đo tại chỗ: sau khi bấm ra ngoài, `.shell__more-menu` vẫn tồn tại và hiển thị. Tab từ nút đi đúng vào 5 mục (tốt), nhưng muốn đóng phải Tab ngược về nút.
- **Expected:** `Escape` và bấm ra ngoài đóng menu (chuẩn disclosure); bỏ `aria-haspopup` hoặc dùng `aria-haspopup="menu"` kèm `role="menu"` nếu thực sự là menu.
- **Ghi chú:** menu được render **2 lần** trong DOM (sidebar + bottom-nav), bản không dùng bị `display:none` — không gây trùng landmark trong cây trợ năng (đã đo `offsetParent`), nhưng là nguồn dễ lỗi khi bảo trì.

#### F-P2-4. Bỏ cấp heading H2 (H1 → H3) ở chi tiết cảnh báo và tab Chính sách

- **Nguồn:** `apps/web/src/components/Card.tsx:13` (`<h3 className="card__title">`), dùng ở `features/alerts/AlertDetailPage.tsx:214` (`Cảnh báo cần hành động` / `Đang có người hỗ trợ`) và `features/admin/AdminPage.tsx:497` (`Chính sách vận hành thiết bị`).
- **Actual:** axe `heading-order` (moderate) — lần lượt `H1: Nghi ngã…` → `H3: Đang có người hỗ trợ` → `H2: Diễn biến sự kiện`; tab Chính sách: `H1: Quản trị` → `H3: Chính sách vận hành thiết bị` → `H2: Lịch sử phiên bản`.
- **Expected:** cấp heading tăng dần 1.
- **Đề xuất:** cho `Card` nhận prop `headingLevel` (mặc định `h2` cho cấp trang, `h3` khi lồng trong section đã có `h2`).

#### F-P2-5. Chấm “chưa đọc” có `aria-label` trên `<span>` không role → thuộc tính bị bỏ

- **Nguồn:** `apps/web/src/features/notifications/NotificationsPage.tsx:97` — `<span className="notification-item__dot" aria-label="Chưa đọc" />`.
- **Actual:** axe `aria-prohibited-attr` (serious) ở cả 3 viewport. Trạng thái chưa đọc **vẫn** suy ra được qua nút “Đánh dấu đã đọc” và dòng “Bạn có N thông báo chưa đọc.” → không mất thông tin, nhưng ARIA sai.
- **Đề xuất:** thêm `<span className="visually-hidden">Chưa đọc</span>` bên trong, hoặc `role="img"` + `aria-label`, hoặc bỏ `aria-label` và giữ nhãn chữ.

#### F-P2-6. Vùng cuộn biểu đồ không được khai báo focusable; **focus bị thanh nav dưới che**

- **Nguồn:** `apps/web/src/components/MeasurementChart.tsx:86-90` (`.chart__scroll` `overflow-x:auto`, không `tabindex`/`role`); `styles/layout.css:2653-2655`, `:2687-2693`; **không có** `scroll-padding*` trong `styles/base.css`/`tokens.css` (grep rỗng).
- **Tái hiện A:** `/app/history` 390×844 → axe → `scrollable-region-focusable` (serious). Trong Chromium 159, Tab **vẫn** vào được `.chart__scroll` (tính năng “scrollable containers focusable” từ Chrome 126) và `ArrowRight` cuộn `scrollLeft 0 → 80`; nhưng không có `tabindex` nên Firefox/Safari không đảm bảo.
- **Tái hiện B (che khuất):** `/app/history` 390×844, Tab tới khi focus vào biểu đồ, đo `getBoundingClientRect`.
  **Actual:** `chart.top=611, chart.bottom=835`, `.shell__bottomnav` `top=777` → **58px cuối biểu đồ (nhãn trục thời gian) nằm sau thanh nav**; ở chế độ chữ lớn: `bottom=844`, nav `top=739` → **105px bị che**. Ảnh: `C:/tmp/qa-a11y/shot-chart-overlap-default.png`.
- **Đề xuất:** thêm `tabindex="0"` + `role="group"`/`aria-label` cho `.chart__scroll` (kèm hướng dẫn “dùng phím mũi tên”), và `html { scroll-padding-bottom: 6rem }` (đủ cho nav 105px ở chữ lớn) để phần tử được focus không bị nav che.

#### F-P2-7. Cảnh báo đã xác nhận vẫn hiện nút “Xác nhận”; bấm lại ra thông điệp sai nguyên nhân

- **Nguồn:** `features/alerts/AlertsPage.tsx:205-214` (chỉ kiểm `isActionableState(item.state)`, không kiểm `item.acknowledgedBy`), `:67-72` (mọi 409 → “Danh sách dưới đây có thể cũ”).
- **Tái hiện:** mở `/app/alerts` khi cảnh báo đã ở trạng thái “Đã xác nhận” → bấm “Xác nhận”.
- **Actual:** dòng vẫn có pill “Đã xác nhận” + nút “Xác nhận”; bấm → banner “Danh sách có thể chưa cập nhật — Cảnh báo đã thay đổi ở nơi khác…” (gợi ý tải lại), trong khi sự thật là **đã có người xác nhận trước**. Với người cao tuổi đây là thông điệp dễ hiểu sai.
- **Đề xuất:** ẩn nút khi `acknowledgedBy != null` (hoặc đổi thành “Đã có người hỗ trợ”); phân biệt 409 “đã xác nhận” với “dữ liệu cũ”.

#### F-P2-8. Co giãn chữ 150%/200% làm tràn ngang ở 390px/360px

- **Nguồn:** `styles/layout.css:554-565` (`.shell__topbar-row` không `flex-wrap`), `:1959-1993` (`.shell__topbar-row{gap}`, `.shell__topbar-actions{flex:none}`, `.shell__topbar-logout{white-space:nowrap;font-size:.78rem}`), `.pill{white-space:nowrap}` (`layout.css:218-229`) — nền “Nguồn: dữ liệu mô phỏng” đo được 367px khi ép 200%.
- **Tái hiện:** `/app` 390×844, đặt `document.documentElement.style.fontSize = '200%'`.
- **Actual:** `documentElement.scrollWidth = 524` với `innerWidth = 390` (360px cũng 524). Phần tử vượt phải: `.shell__topbar-actions` (r=524, “Aa Bật chữ lớn Đăng xuất”), `.pill--sand` (r=440). Ở **150%**: `/app` 390 → `scrollWidth 395` (5px), `/app/assistant` → `415` (25px). Ở 1280 + 150%: bảng lịch sử rộng 1525 nhưng nằm trong vùng cuộn riêng nên trang không tràn.
- **Đối chứng (đạt):** 4 cấu hình mà `docs/06:76` tuyên bố — `1280×900`, `390×844`, `360×740`, chế độ “chữ lớn” — **không** tràn ngang (`scrollWidth == innerWidth`), khớp tài liệu. `640×450` (≈ zoom 200% của 1280) cũng không tràn.
- **Đánh giá:** chưa phải vi phạm 1.4.10 Reflow (ngưỡng 320px ở cỡ chữ mặc định đạt), nhưng là rào cản thực tế cho người dùng tăng cỡ chữ của hệ điều hành/trình duyệt.
- **Đề xuất:** `flex-wrap: wrap` cho `.shell__topbar-row`, bỏ `flex:none` ở `.shell__topbar-actions`, cho `.pill` `white-space: normal`.

#### F-P2-9. Cỡ chữ và vùng chạm nhỏ hơn khuyến nghị cho người cao tuổi

- **Số đo (390×844, chữ mặc định):**
  - `.shell__mobile-demo` (nhãn “Bản demo” trên topbar) **11,56px**, cao 14px (`layout.css:2726-2731`, `font-size: .68rem`).
  - Nút “Đăng xuất” mobile **13,26px**, cao 38px (`.shell__topbar-logout`, `layout.css:1988-1993`, `font-size: .78rem`).
  - Liên kết “Quản lý và chia sẻ” **124×23px** (cách mục tương tác gần nhất 9px); “Xem cảnh báo” trong thông báo **121×22px** (cách 16px).
  - `select` chọn hồ sơ cao **32px**; nút `button--sm` cao **43px**; checkbox quyền chia sẻ **21×21px** (nhưng nhãn `.checkline` 274×34px nên vùng chạm hiệu dụng lớn hơn).
- **Số đo desktop (1280×900):** `.shell__safety-note` **13,8px** (`tokens.css:44` `--text-xs: 0.8125rem`) — chính là dòng cảnh báo an toàn; `.shell__tagline`/`.shell__user-email` cùng 15,9px.
- **Đánh giá:** WCAG 2.2 AA 2.5.8 yêu cầu 24×24px; hai liên kết 22–23px nằm dưới ngưỡng và **cần kiểm khoảng cách** theo ngoại lệ “spacing”. Khuyến nghị 44×44px cho người cao tuổi (2.5.5 AAA) chưa đạt ở nhiều mục.
- **Đề xuất:** nâng `--text-xs` lên ≥ 0,875rem (14,9px) cho văn bản nội dung; đưa link phụ về ≥ 44px cao bằng padding; tăng checkbox lên 24px.

#### F-P2-10. Lỗi form không đưa focus về trường sai và không có tóm tắt lỗi

- **Nguồn:** `components/Field.tsx:32-40` (đã tốt: `aria-invalid`, `aria-describedby`, `role="alert"`), nhưng `features/auth/LoginPage.tsx:42-46`, `RegisterPage`, `features/share/SharePage.tsx:126-142`, `features/alerts/AlertDetailPage.tsx:145-168`, `AdminPage` (policy, user status) chỉ `setState` lỗi.
- **Tái hiện:** `/login` → focus “Đăng nhập” → Enter (form rỗng); lặp lại với `/register`, form mời chia sẻ, form đóng cảnh báo, policy `0`.
- **Actual:** thông báo lỗi hiện đúng (được đọc nhờ `role="alert"`), nhưng `activeElement` **vẫn là nút submit** (“Đăng nhập”, “Tạo tài khoản”, “Xác nhận đóng cảnh báo”, “Phát hành”).
- **Đề xuất:** focus vào trường lỗi đầu tiên (hoặc tóm tắt lỗi có link tới từng trường) sau khi validate thất bại.

#### F-P2-11. Đổi tab Quản trị không được thông báo, heading không nhất quán

- **Nguồn:** `features/admin/AdminPage.tsx:793-810` — nhóm nút `aria-pressed` (`:799`, đã bỏ `role="tab"`, đúng hướng sau review trước) nhưng panel nội dung thay đổi (`:807-810`) mà không có live region, không đổi focus.
- **Actual:** sau khi bấm “Chính sách thiết bị”, focus vẫn trên nút; `[role=alert]/[role=status]/[aria-live]` = **0**; người dùng trình đọc màn hình không biết nội dung đã đổi.
- **Đề xuất:** `aria-live="polite"` thông báo tên mục, hoặc chuyển focus vào heading của panel (`tabindex="-1"`) như mẫu tabs/accordion.

#### F-P2-12. Nhãn “dữ liệu mô phỏng” thiếu ở cấp trang tại một số màn hình

- **Nguồn:** `docs/06:35` yêu cầu số liệu từ simulator phải có nhãn “Dữ liệu mô phỏng”. Trong mã: `DashboardPage.tsx:201,346`, `HistoryPage.tsx:340`, `SubjectsPage.tsx:196`, `AlertDetailPage.tsx:316` có nhãn; **`DevicesPage`, `AlertsPage`, `NotificationsPage`, `AssistantPage`, `TasksPage` không có** (đo `main.innerText` không chứa “mô phỏng/bản demo”).
- **Actual:** ở 390×844, nhãn toàn cục duy nhất trên các trang đó là chip “Bản demo” **11,56px/14px cao** ở topbar; ở desktop là pill “Bản demo · dữ liệu mô phỏng” trong sidebar. Trang Thiết bị hiển thị số liệu sức khỏe (61 bpm, 86% pin) mà không có nhãn cục bộ.
- **Đề xuất:** thêm một dòng/`StatusPill` “Nguồn: dữ liệu mô phỏng” ở đầu nội dung các trang còn thiếu, tối thiểu ≥14px.

#### F-P2-13. Không có dialog/modal nào trong ứng dụng

- **Bằng chứng:** `grep -rn 'role="dialog"\|aria-modal\|<dialog' apps/web/src` → **0 kết quả**. Các luồng nguy hiểm dùng panel tại chỗ (xem F-P2-2) hoặc **không có bước xác nhận** — “Phát hành” policy (`AdminPage.tsx:535`) gửi ngay khi bấm.
- **Hệ quả:** không có nguy cơ “khoá focus trong dialog” (mục cần kiểm của đề bài) **nhưng** cũng không có vùng cách ly, không `Escape`, không thông báo; và thao tác khó hoàn tác (phát hành policy) thiếu bước xác nhận.
- **Đề xuất:** nếu chấp nhận hướng “không modal”, hãy chuẩn hoá `ConfirmInline` (focus/Escape/announce) và thêm xác nhận cho “Phát hành”.

---

## 5. Những điểm đã kiểm và **không** thấy lỗi (kèm bằng chứng)

| Hạng mục | Bằng chứng |
| --- | --- |
| Skip link | Tab đầu tiên ở `/login` và `/app` là `A.skip-link "Chuyển tới nội dung chính"`; Enter → `MAIN#main` nhận focus |
| Focus visible | Mọi phần tử thử đều có `outline: solid 3px rgb(12,110,99)`, offset 2px, kể cả trên nền đỏ `#a33b2e` và segmented active; riêng `select` là 2px (mảnh hơn phần còn lại — không phải lỗi, chỉ thiếu nhất quán) |
| Landmark | Mỗi breakpoint chỉ 1 `nav[aria-label="Điều hướng ứng dụng"]` hiển thị (bản còn lại `display:none`, `offsetParent=null`); `main` = 1 ở mọi trang; landing có `HEADER/NAV/MAIN/FOOTER` |
| `aria-current` | Nav active có `aria-current="page"` (Tổng quan) |
| Ngôn ngữ | `index.html:2` `<html lang="vi">`; thông báo/empty state đều tiếng Việt |
| Reduced motion | `prefers-reduced-motion: reduce` → `transition-duration: 1e-05s`, `scroll-behavior: auto`, `document.getAnimations().length = 0` |
| Label form | `TextField` nối `label[for]` + `hint` + `error` bằng `aria-describedby`; login/register/invite/policy đều có label thật; input có `autocomplete` (`email`, `current-password`, `new-password`, `name`) |
| Lỗi form | Có `aria-invalid="true"` + `aria-describedby="…-error"` + `role="alert"` (chỉ thiếu việc chuyển focus — F-P2-10) |
| Bàn phím: đăng nhập | Login hoàn tất chỉ bằng Tab/Enter; thứ tự: skip → brand → email → mật khẩu → đăng nhập → summary “Tài khoản demo” → link đăng ký |
| Bàn phím: chuyển hồ sơ | `select` native; ArrowDown đổi hồ sơ, focus giữ trên `SELECT`, dữ liệu đổi đúng (hồ sơ B: “Chưa gắn thiết bị nào”, “Không có cảnh báo”) |
| Bàn phím: menu Thêm | Mở bằng Enter, Tab đi đúng vào 5 mục, focus không nhảy khỏi nút khi mở |
| Bàn phím: đóng cảnh báo | Form đóng cảnh báo nằm trong luồng tab, `textarea`/`select` có label, lỗi có `role=alert` |
| Phản hồi thành công có sẵn | “Đã tạo lời mời” (`Alert tone=success` → `role=status`), “Đã phát hành policy…” (`AdminPage.tsx:494`), lỗi đánh dấu đã đọc (`NotificationsPage.tsx:130-133`) và lỗi đóng công việc (`TasksPage.tsx:300`) đều có Alert |
| Tràn ngang theo tài liệu | 1280×900 / 390×844 / 360×740 / chữ lớn: `scrollWidth == innerWidth` ở 11 trang `/app` (dashboard → studio, gồm cả trang chia sẻ); không phần tử nào bị cắt chữ (`overflow:hidden` + `scrollWidth>clientWidth`) trong `main` |
| Đè nav | Cuộn hết trang ở mọi cấu hình: 0 phần tử nội dung nằm sau `.shell__bottomnav` (padding `calc(--space-8 + 4.5rem)` đủ) — trừ trường hợp focus biểu đồ (F-P2-6) |

---

## 6. Cần người thật kiểm (không tự động hoá được)

1. **NVDA/JAWS + Chrome** trên luồng: nhận cảnh báo → “Tôi đang hỗ trợ” → đóng cảnh báo; đo xem thay đổi trạng thái có được đọc hay không.
2. **TalkBack + điện thoại 360–390px**: vùng chạm 43px và liên kết 22–23px có dễ bấm trượt không.
3. **Người cao tuổi thật** (theo `docs/08`, `docs/14` mục ngoài phạm vi): hiểu “Bản demo/dữ liệu mô phỏng”, hiểu khác biệt “Đã xác nhận” vs “Đã đóng”, phản xạ với màu đỏ + icon ⚠.
4. **Trình duyệt khác** (Firefox/Safari) cho vùng cuộn biểu đồ và `:focus-visible` trên `select`.
5. **Zoom hệ điều hành** (Windows scaling 150%/200%) — khác với ép cỡ chữ CSS mà tôi đã đo.

---

## 7. Tác động lên dữ liệu dùng chung (cần lead biết)

- Trong lúc kiểm luồng “Xác nhận”, tôi đã bấm “Xác nhận” thật trên **instance API của lead** (`:3000`): cảnh báo seed `ffffffff-ffff-4fff-8fff-ffffffffffff` chuyển `open → acknowledged` (version 1 → 3, `acknowledgedBy = Trần Thị An`). Đây là thay đổi trạng thái demo trong `.data/pglite` của lead; nếu cần trạng thái gốc, phải dựng DB mới + `pnpm seed` (seed idempotent không tự reset state).
- Các lần sau tôi mô phỏng phản hồi bằng `page.route(...)` (không ghi DB). Tôi **không** chạy seed/migration, không ghi file nào ngoài `reports/qa/`.

---

## 8. Liên hệ finding của review trước (không đóng finding nào)

- `reports/qa/review-frontend-2026-11-14.md` P2-2 (“tab admin chưa theo ARIA APG”): mã hiện dùng nhóm nút `aria-pressed` (`AdminPage.tsx:793-810`) — chấp nhận được, **nhưng** vẫn còn thiếu thông báo khi đổi panel (F-P2-11). Tôi **không** đánh dấu P2-2 đã đóng.
- Các P2 khác của review trước (bundle >500 kB, tab admin, mốc thời gian, clipboard) không nằm trong phạm vi accessibility lần này; không kết luận.

---

## 9. Đề xuất thứ tự sửa

1. **F-P1-1** (contrast token) — sửa 1 dòng token, ảnh hưởng toàn bộ khung; đo lại bằng axe.
2. **F-P1-2** (lỗi ack im lặng) — thêm nhánh lỗi; nhỏ nhưng là niềm tin an toàn.
3. **F-P2-1 + F-P2-2** (live region dùng chung + `ConfirmInline` có focus/Escape) — sửa một lần cho 4 luồng.
4. **F-P2-3, F-P2-4, F-P2-5, F-P2-11** — chi phí thấp, dọn sạch axe.
5. **F-P2-6** (`tabindex` + `scroll-padding-bottom`), **F-P2-8** (`flex-wrap` topbar), **F-P2-9** (cỡ chữ/vùng chạm), **F-P2-10** (focus lỗi form), **F-P2-7, F-P2-12, F-P2-13** (nội dung + xác nhận).
6. Sau khi sửa: chạy lại cùng bộ quét axe 50 lượt + 6 kịch bản bàn phím ở trên để so sánh số vi phạm (kỳ vọng: `color-contrast` 0 ở ≥1024px, `aria-prohibited-attr` 0, `heading-order` 0).

---

## Tóm tắt 5 dòng

1. Đã quét axe (axe-core 4.14.0 × Chromium 159) 50 lượt trên 15 route × 3 viewport + 3 tab Quản trị + 2 trang vai người thân, và chạy 6 nhóm kịch bản bàn phím/co giãn trên instance web của lead (mã web trùng HEAD `8434d66`).
2. Không có P0; **2 P1**: chữ phụ trên nền `paper-deep` chỉ 4,35:1 (gồm dòng cảnh báo an toàn), và bấm “Xác nhận” cảnh báo thất bại **không hiện lỗi** khi server trả 500.
3. **13 P2** tập trung vào phản hồi sau thao tác (không live region, focus rơi về `body`), panel xác nhận tại chỗ không giữ/trả focus và không đóng bằng `Escape`, menu “Thêm” không đóng được, heading nhảy cấp, ARIA sai ở chấm “chưa đọc”, biểu đồ bị nav che 58–105px khi focus, và tràn ngang khi ép chữ 150–200%.
4. Đã xác nhận các điểm **đạt**: skip link, focus ring 3px, landmark/`lang`, `aria-current`, `prefers-reduced-motion`, label + `aria-invalid`/`aria-describedby` cho form, tràn ngang 0 ở 1280/390/360/chữ lớn — khớp `docs/06:76`.
5. Còn lại: kiểm bằng NVDA/TalkBack và người cao tuổi thật; và lead cần biết một cảnh báo seed đã bị “xác nhận” trên DB dùng chung trong lúc thử.
