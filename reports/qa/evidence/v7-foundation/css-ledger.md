# CSS ledger — W1 foundation (v7)

Trạng thái đo tại HEAD `aad596c` (nhánh `Tung204/v7-foundation`), web dev
`http://127.0.0.1:4350`, API `http://127.0.0.1:3000` (chỉ đăng nhập demo + đọc).

Quy ước cột **Owner**: F = foundation (W1), P = public/auth, C = hôm nay +
assistant + cảnh báo + hồ sơ, H = dashboard/lịch sử/thiết bị, R = realtime/
thông báo, A = admin/studio. Lane feature chuyển tiếp ở W2/W3.

## 1. Selector foundation đã retire khỏi file cũ

| Selector (đại diện) | File cũ | File mới (một nguồn) | Owner | Trạng thái |
| --- | --- | --- | --- | --- |
| `.button`, `.button--primary/secondary/subtle/danger/danger-quiet`, `.button--sm`, `.button__spinner` | `layout.css` | `components/primitives.css` | F | retired |
| `.field`, `.field__label`, `.field__input`, `.field__hint`, `.field__error`, `.field--invalid` | `layout.css` | `components/primitives.css` | F | retired |
| `.card`, `.card-grid`, `.card__head`, `.card__title` | `layout.css` | `components/primitives.css` | F | retired |
| `.alert`, `.alert--info/success/warning/error`, `.alert__title`, `.alert__body` | `layout.css` | `components/primitives.css` | F | retired |
| `.pill`, `.pill--teal/brick/sand`, `.pill` tone nghĩa | `layout.css` | `components/primitives.css` | F | retired |
| `.empty-state*`, `.error-state*`, `.page-loader*` | `layout.css` | `components/primitives.css` | F | retired |
| `.text-size-toggle*` | `layout.css` | `components/primitives.css` | F | retired |
| `.shell*` (rail, topbar, bottomnav, account, banner, context, logout confirm) | `layout.css` + `app-simple.css` | `styles/shell.css` | F | retired |
| `.subject-switcher*`, `.subject-context*` | `layout.css` + `app-simple.css` | `styles/shell.css` (`.subject-context*`), `SubjectSwitcher.tsx` dùng `.subject-context` | F/C | retired khỏi file cũ |
| `.skip-link` | `layout.css` | `styles/base.css` | F | retired |
| `@keyframes an-spin` | `layout.css` | giữ tại `layout.css` cạnh `.dashboard-region__spinner` | H | giữ có chủ đích (spinner dashboard; PageLoader không dùng) |
| `var(--font-display)` (9 chỗ trong layout + 1 mỗi file admin-simple/admin-devices/studio) | nhiều file | `var(--font-ui)` | F (cơ học) | retired |

Kiểm chứng: `grep -rn "subject-context\|shell__" src/styles/layout.css src/styles/app-simple.css`
→ 0 dòng; `grep -rn "\.button\b" src/styles/layout.css` chỉ còn selector
feature scoped (xem §2).

## 2. Selector feature còn chạm primitive/shell — bàn giao lane

| Selector còn lại | File | Owner | Ghi chú / số đo |
| --- | --- | --- | --- |
| `.site-header__nav .button` (2 block) | `layout.css:50,67` | P | chỉ override khoảng cách; `min-height: 2.75rem` = 44px ✓ |
| `.resolve-form textarea.field__input` | `layout.css:533` | C | resize/khoảng, không đổi target |
| `.adm-filter-form .field` | `layout.css:1202` | A | lặp với `admin-simple.css:214` — chuyển về `admin.css` khi tách |
| `.dashboard__header .page-title`, `.dashboard-section-head .section-title`, `.section-heading-row .section-title`, `.dashboard-section-head > .pill` | `layout.css:1381,1416,1821,2095` | H | typography cục bộ; nên dùng `.page-title/.section-title` primitive |
| `.dashboard-region__action .button { min-height: 2.5rem }` | `layout.css:1479` | H | **40px < 44px** — bỏ override khi lane H chuyển CSS |
| `.alert-row > .pill`, `.alert-row__main + .pill`, `.alert-row__side` (2 block) | `layout.css:415,951,2004–2005` | C | `.alert-row__side` định nghĩa 2 lần (nợ cũ, không phải do W1) |
| `.alert-detail__action-card .field__hint` | `layout.css:2073` | C | spacing |
| `.assistant-chat__head > .button`, `.assistant-composer__row .field__input`, `.assistant-composer__row .button`, `.assistant-composer__field .field__label/.field__hint`, `.assistant-chat__head .section-title` | `layout.css:2185,2277,2281,2466,2469,2482–2483` | C | giữ layout assistant; target do primitive quyết định |
| `.today-ask__row .button`, `.today-status__action(s) .button`, `.insights-card__notice .pill` | `app-simple.css:86,353,391,415,418` | C | chip gợi ý dùng `.ai-suggestion` (feature) — xem finding F1 |
| `.ai-suggestion` (chip gợi ý Hôm nay) | `layout.css:1739` | C | **cao 31.7px (39.1px chữ lớn) < 44px** — finding F1 |
| `.auth-card .field*`, `.auth-footer a` | `public-simple.css:304,313,...` | P | link chuyển đăng ký cao 18px — finding F2 |
| `.admin-page .field/.button`, `.adm-tabs/.adm-subtabs .button` | `admin-simple.css` | A | scoped theo `.admin-page`, chuyển `admin.css` khi tách |

## 3. Thứ tự import (một chiều, không quay lại)

`main.tsx`: `fonts.css → tokens.css → base.css → components/primitives.css →
styles/layout.css (feature legacy) → public-simple.css → app-simple.css →
admin-simple.css → styles/shell.css`.

- Foundation chỉ định nghĩa ở `base.css`, `components/primitives.css`,
  `styles/shell.css`.
- `layout.css`/`*-simple.css` chỉ còn selector feature; không thêm override
  foundation mới. Cổng "không định nghĩa hai lần" cho toàn bộ selector feature
  thuộc W3 (theo delta W0 #2).

## 4. Finding mở (không sửa trong W1 vì ngoài quyền file)

| ID | Mô tả | Số đo | Owner |
| --- | --- | --- | --- |
| F1 | Chip gợi ý "Nhịp tim?/Cảnh báo?/Pin?" ở Hôm nay | 90.8×31.7 / 100.6×31.7 / 54.8×31.7; chữ lớn 113×39.1 / 125.3×39.1 / 68×39.1 | C (Assistant) |
| F2 | Link "Tạo tài khoản mới" ở chân form đăng nhập | 125.5×18 (390), 156.9×23 (chữ lớn) | P (Auth) |
| F3 | `.dashboard-region__action .button` bị ép 40px | `min-height: 2.5rem` | H |
