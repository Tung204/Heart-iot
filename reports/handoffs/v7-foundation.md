# Handoff — W1 foundation (v7)

**Task** `task_813739527bae` · **Dispatch** `ctx_a3d2bdad8bab` · **Worker terminal**
`term_c852d781-5304-48da-9dd2-6cb607e85275` · **Coordinator** `term_9d6038ec`
**Review-fix** `task_03ce72d8fdf9` · dispatch `ctx_1db1d4f7faa4` (P1/P2 review W1)

- **Worktree**: `C:/Users/nguye/orca/workspaces/DATN/v7-foundation`
- **Branch**: `Tung204/v7-foundation` (chưa merge, chưa push)
- **Base**: `a10c8ea` (spec W1), đã merge master + đổi tên dự án ở `f7c1322`
  (`@heart-iot`, demo `*@demo.heart-iot.local`). **Code SHA fix review**: xem
  `git log -1` sau commit này (`fix: đóng P1/P2 review W1`).
- **Provider/model thực tế**: `moxuna / deepseek-v4.1-flash`
- **Môi trường đo**: web dev `http://127.0.0.1:4350`; API dev `http://127.0.0.1:3000`
  với `PGLITE_DATA_DIR=.data/qa-v7-review`, seed demo mới (owner
  `ba-an@demo.heart-iot.local`, admin `admin@demo.heart-iot.local`); chỉ đăng
  nhập/đọc. Không sửa API, không thêm dữ liệu giả.

## 1. Đã làm

### Tokens / font / base (design-system §2)
- `src/styles/tokens.css`: palette v7 (nền `#f4f7fb`, chữ `#18263d`, action
  `#174bc5`, rail `#15253e`, danger/warning/success), spacing 4→64, radius
  chip 4/control 6/vùng 10, `--focus-*`, `--target-min: 44px`,
  `--control-height: 48px`, `--shell-rail: 216px`, `--shell-topbar: 56px`,
  `--shell-bottomnav: 64px`, motion 120ms. Giữ **19 alias `--color-*` cũ** trỏ
  token mới để lane W2 chuyển dần; bỏ `--font-display`; large-text = 125% root.
- `src/styles/fonts.css`: chỉ Be Vietnam Pro 400/500/600/700 (vietnamese+latin).
- `src/styles/base.css`: reset, typography sans, focus 3px + offset 3px,
  `.skip-link`, `.on-dark`, container/stack/page-title/section-title/brand/
  visually-hidden. Không selector nghiệp vụ.

### Primitive — API khoá (dùng ở W2, chỉ thêm không phá)
| Primitive | API |
| --- | --- |
| `Button` / `ButtonLink` | `variant?: primary\|secondary\|subtle\|danger\|danger-quiet`, `size?: sm\|md` (cả hai ≥44px), `fullWidth?`; native props (`type` mặc định `button`), `ref` |
| `TextField` | `id` (bắt buộc), `label`, `error?`, `hint?`, native input props; `aria-describedby` nối **cả** hint + error; lỗi `role="alert"` |
| `Card` | `title?`, `description?`, `headingLevel?: 2\|3\|4` (mặc định 3), `className?` |
| `Alert` | `tone?: info\|success\|warning\|error`, `title?`, `announce?: alert\|status\|none` (mặc định error/warning→alert, còn lại→status) |
| `EmptyState` / `ErrorState` | `title`, `description?`, `action?`, `headingLevel?` |
| `PageLoader` | `label?` (mặc định “Đang tải…”), skeleton tĩnh, không shimmer |
| `StatusPill` | `tone?: teal\|brick\|sand\|neutral\|success\|danger\|warning\|info` + `className`, luôn kèm chữ |
| `PageHeader` (mới) | `title`, `headingLevel?: 1\|2`, `context?`, `actions?`, `breadcrumb?`, `id?` |
| `Section` (mới) | `title?`, `headingLevel?: 2\|3`, `lead?`, `actions?`, `surface?`, `id?` |

CSS: `src/components/primitives.css` là **nơi duy nhất** định nghĩa các lớp
foundation (`button/field/card/alert/pill/empty-state/error-state/page-loader/
text-size-toggle/page-header/page-section`). Không đổi tên lớp cũ.

### Shell (design-system §3)
- Desktop ≥1024px: rail 216px nền mực, brand, 4 mục + badge cảnh báo, avatar
  cuối rail. Mobile/tablet: topbar 57px (56 + border) + bottom-nav 65px, đúng
  4 mục; không có nút hamburger.
- Nav theo nhóm route (một nguồn `src/app/routeScope.ts`):

  | Route | Mục active |
  | --- | --- |
  | `/app`, `/app/assistant` | Hôm nay |
  | `/app/alerts`, `/app/alerts/:id` | Cảnh báo |
  | `/app/overview`, `/app/history` | Sức khỏe |
  | `/app/devices` | Người thân |
  | `/app/subjects`, `/app/subjects/:id/*` | Người thân (`people`) |
  | `/app/tasks`, `/app/settings`, `/app/studio/*` | không mục nào |
  | `/app/admin/*` | Quản trị |

  `aria-current="page"` trên cả rail và bottom-nav. Badge cảnh báo dùng
  `nextCursor` của `IncidentList`: còn trang sau thì hiện `20+` và label
  “20+ cảnh báo đang mở” (không trộn với thông báo chưa đọc). Admin **không có hồ sơ** chỉ
  thấy “Quản trị”; `/app` tự chuyển `/app/admin` (giữ guard hiện có ở
  `AssistantPage`). `history` và `devices` trước đây không active → đã sửa.
  Focus bàn phím trên rail (brand, 4 nav, account trigger) dùng **ring trắng
  3px offset 3px** (`--focus-on-dark`), không dùng xanh trên nền mực; menu tài
  khoản nền sáng vẫn ring xanh.
  `/app/subjects` trả `section: 'people'` và `context: 'collection'` trong
  `routeScope.ts`, nên mục **Người thân** active (đúng ảnh `subjects-360x740`);
  context `collection` nghĩa là trang danh sách tự render ngữ cảnh, shell không
  render dòng chọn.
- Menu tài khoản mở từ avatar: `Tài khoản`, `Quản trị` (chỉ admin), `Aa` bật/tắt
  chữ lớn, `Đăng xuất`. **Không có Studio.** Mở bằng Enter/Space/ArrowDown;
  ArrowUp/Down/Home/End di chuyển; Escape, click ngoài, focus ra ngoài đều đóng;
  focus trả về avatar. `ArrowDown`/`ArrowUp` khi menu **đang đóng** cũng mở và
  focus mục đầu/cuối. `aria-expanded`, `aria-haspopup="menu"`, `role="menu"`.
- Skip link “Bỏ qua điều hướng, tới nội dung”; `<main id="main">` nhận focus.
- H1 sản phẩm: desktop 2rem (32px), **mobile 1.5rem (24px)**, chữ lớn root 20px
  → 30px; đã bỏ override `.today/.subjects-page/.assistant .page-title`.
- Banner toàn cục ưu tiên: **mất quyền hồ sơ (role=alert)** > **thông báo mới
  (role=status, link `/app/alerts/{incidentId}`)** > **mất SSE (role=status)**.
  Banner thông báo ẩn khi đang xem đúng incident hoặc inbox; banner mất SSE chỉ
  hiện khi tab đang hiển thị.
- Route transition chỉ đổi opacity 120ms, không slide; tôn trọng
  `prefers-reduced-motion`.
- Dòng ngữ cảnh hồ sơ: một dòng, **trên H1**, chỉ render khi `scope='selected'`
  và route thuộc 5 trang (`/app`, history, alerts, devices, assistant). Nhãn
  accessible “Người được theo dõi”. Không hiện ở `/app/subjects` (scope
  `collection`), inbox và admin (scope `none`).

### Router / cache
- Giữ lazy chunk, alias `/app/assistant`, `NotFoundPage`, `ProtectedRoute`,
  admin guard. `/app/notifications` → `Navigate to="/app/alerts?view=notifications" replace`.
- `src/lib/query.ts`: `registerSubjectScopedKey` + `purgeSubjectData(subjectId)`
  chỉ xoá subtree của subject đó, alert detail có `data.subjectId` khớp và item
  thông báo thuộc subject; **không** `removeQueries(['alerts'])` toàn bộ.
  `useSubjectEvents` dùng hàm này khi bị thu hồi quyền.

### CSS graph
- `src/main.tsx`: `fonts → tokens → base → primitives → layout (feature legacy)
  → public-simple → app-simple → admin-simple → shell`.
- `layout.css` 3509 → 2536 dòng: retire toàn bộ selector foundation + shell +
  subject-switcher. `app-simple.css` bỏ `.subject-context*`, `.shell__*`.
- Ledger đầy đủ selector → file cũ → owner → trạng thái:
  `reports/qa/evidence/v7-foundation/css-ledger.md`.

### index.html
- `<title>Theo dõi sức khỏe</title>`, description trung tính, `theme-color
  #F4F7FB`; giữ `lang="vi"`, viewport, `#root`, script boot; boot skeleton tĩnh
  xanh xám (không shimmer); `<noscript>` giữ, copy trung thực (“Cần JavaScript
  để dùng ứng dụng…”). Không còn “An Nhiên”.

### Fix pass sau review lead (account name/role)
- **Tên/vai trò tài khoản:** `.shell__account-trigger-text` thêm `flex: 1 1 auto`
  + `min-width: 0`; tên ở trigger và menu một dòng, `overflow: hidden` +
  `text-overflow: ellipsis`; vai trò `white-space: normal` +
  `overflow-wrap: anywhere` (xuống dòng, không clip ngang). Không đặt
  `overflow: hidden` trên phần tử chứa vai trò.
- **Đo lại:** displayName mặc định/dài (`Nguyễn Thị Phương Thảo Nguyên`)/ngắn ×
  rail 216px, menu 390×844 và 360×740. Tên dài ellipsis đúng (trigger
  `scrollWidth 229 > clientWidth 95`; menu `262 > 142`), “Chủ hồ sơ” luôn đủ
  chữ, cao 16.3px một dòng, ký tự cuối nằm trong box, menu trong viewport
  (`account-name-audit.json`, 3 ảnh `account-long-*`).
- **Trung thực về lỗi cũ:** không tái hiện được việc cắt giữa glyph bằng DOM ở
  bản trước (`scrollWidth = clientWidth`, ký tự cuối vẫn trong box); ở ảnh 1x
  glyph “ơ” trông giống “a”. Thay đổi trên loại bỏ khả năng cắt do thiếu chỗ và
  được khoá bằng test CSS, nhưng không khẳng định đã tái hiện đúng ảnh báo.
- **Tài liệu:** bảng nav sửa `/app/subjects` → Người thân (`people`, context
  `collection`); bổ sung phạm vi target <44px (F7) để không hiểu là F đã đo hết
  page legacy.

## 2. Cổng kiểm — kết quả thật (sau fix review)

```text
$ pnpm --filter @heart-iot/web typecheck
tsc -p tsconfig.json --noEmit        # exit 0

$ pnpm --filter @heart-iot/web exec vitest run src/app/AppShell.test.tsx
Test Files  1 passed (1)
     Tests  45 passed (45)

$ pnpm --filter @heart-iot/web exec vitest run --no-file-parallelism --maxWorkers=1
Test Files  37 passed (37)
     Tests  291 passed (291)

$ pnpm --filter @heart-iot/web build
✓ built in 510ms                     # exit 0
```

`pnpm build:contracts` chạy trước typecheck (exit 0). Các số cũ 287/288 đã
được thay bằng **291** sau khi thêm test badge `20+`, ArrowDown/ArrowUp và CSS
focus/H1.

### Đo giao diện (Playwright/Chromium, `metrics.json`)

**32 tổ hợp** = 8 route × 4 viewport: `/`, `/login`, `/register`, `/app`,
`/app/overview`, `/app/alerts`, `/app/subjects`, `/app/admin`; 1280×900,
390×844, 360×740, 390×844 chữ lớn.

| Chỉ số | Kết quả |
| --- | --- |
| `scrollWidth ≤ clientWidth` | 32/32, overflowX = 0 (cả body) |
| Đúng một H1 | 32/32 |
| CTA chính trong viewport đầu | 100% (`primary` đủ, 0 ngoài viewport) |
| H1 mobile | `/app`, `/app/overview`, `/app/subjects`, `/app/admin` = **24px** ở 390 và 360; **30px** khi root 20px; desktop 32px |
| Focus rail | trắng 3px offset 3px: brand/nav **15,37:1**, nav active **9,11:1**, account **9,11:1** (`shell-behavior.json`) |
| Target ≥44px | **shell: 0 vi phạm**; page legacy: 12 target đứng riêng <44px (52 lượt trên 4 viewport) — bảng owner ở §5, **chưa đạt cổng toàn app** |
| Menu tài khoản | Enter/click mở; **ArrowDown khi đóng mở + focus “Tài khoản”**, ArrowUp focus “Đăng xuất”; Escape/focus-return đúng; item 44px |
| Badge `20+` | unit test fixture 20 item + `nextCursor` → badge `20+`, label “20+ cảnh báo đang mở”; chưa có runtime 21 cảnh báo trong seed |
| Tên/vai trò tài khoản | stress test dài/ngắn: tên ellipsis, “Chủ hồ sơ” đủ chữ, không cắt glyph |
| Tương phản nền sáng | body 14,13:1; primary 7,37:1; secondary 15,18:1 |
| `/app/notifications` | → `/app/alerts?view=notifications` (replace) — **chỉ redirect**, nội dung inbox chưa render (P2-02, lane C) |

Ảnh + JSON: `reports/qa/evidence/v7-foundation/` — **42 PNG** (thêm
`overview-*`, `register-*`) + `metrics.json` (có `targetSelectors` và toàn bộ
`targets`, không chỉ button) + `shell-behavior.json` (focus/contrast, ArrowDown)
+ `account-name-audit.json` + `css-ledger.md`. Ảnh route chụp tại code SHA của
commit fix; `metrics.json` đo cùng phiên.

## 3. Test diff đáng chú ý

- `AssistantPage.test.tsx`: harness thêm `SubjectContextLine` vì shell sở hữu dòng
  ngữ cảnh; bỏ kỳ vọng “Bà Năm” **trong trang** (vẫn kiểm qua harness), không nới
  assertion nào khác. `AssistantPage.tsx` chỉ xoá import + 1 dòng render.
- `AppShell.test.tsx`: `readStyle` đọc thêm `components/primitives.css`; thêm route
  detail/devices/assistant; banner thông báo trỏ `/app/alerts/{id}`; test mới cho
  context-above-H1, history→Sức khỏe, devices→Người thân, alias→Hôm nay, inbox
  không context, banner bị ẩn đúng incident.
- `SubjectSwitcher.test.tsx`: locator đổi sang “Người được theo dõi”.
- `router.test.tsx`: khẳng định search `?view=notifications` + `replace`.
- Mới: `components/primitives.test.tsx`, `lib/query.test.ts` (purge theo subject),
  `useSubjectEvents.test.tsx` thêm ca thu hồi B chỉ xoá B, giữ A.
- `AppShell.test.tsx` fix pass: thêm test CSS đọc rule của 4 selector tên/vai trò
  (ellipsis ở tên, wrap ở vai trò, `flex`/`min-width` của khung chữ); test badge
  `20+` với 20 item + `nextCursor`; test ArrowDown/ArrowUp khi menu đóng; test
  CSS focus trắng trên rail + H1 mobile 1.5rem và không còn override legacy —
  **45 test** trong file, không nới assertion cũ.

## 4. Delta W0 #1–#11 — đối chiếu

1. Ảnh vào `reports/qa/evidence/v7-foundation/` ✓
2. Chỉ retire selector foundation; feature giữ; ledger + thứ tự import ✓ (cổng
   “không double CSS” toàn bộ chuyển W3) ✓
3. Context line 5 trang, trên H1, tên “Người được theo dõi”; patch tối thiểu
   AssistantPage + ghi test diff ✓
4. Admin không hồ sơ: nav Quản trị + `/app → /app/admin`; test cả hai ✓
5. Giữ boot/noscript; theme-color `#F4F7FB`; skeleton tĩnh; copy trung thực ✓
6. `/app/notifications` → replace `/app/alerts?view=notifications` ✓ (chỉ
   redirect; nội dung inbox deferred C — P2-02, xem §5.3)
7. Banner mới link `/app/alerts/{incidentId}`, ẩn đúng incident/inbox; ưu tiên
   mất quyền > thông báo mới > mất SSE ✓
8. Interface W2 đóng băng: không đổi `features/auth/useAuth`,
   `features/dashboard/api`, `features/notifications/api` +
   `useUnreadNotifications`, `features/alerts/labels`, `features/contacts/phone`
   + `useEmergencyContacts` ✓
9. `primitives.css` một chỗ ✓
10. `purgeSubjectData` theo subjectId, không `removeQueries(['alerts'])` ✓
11. QA API pinned `WEB_ORIGIN=http://127.0.0.1:4350` + PGlite local ✓

## 5. Finding / nợ mở sau fix review

### 5.1. Đã đóng trong fix pass này

| Mục | Kết quả |
| --- | --- |
| P1-01 focus rail | ring trắng 3px/offset 3px cho brand, 4 nav, account trigger; đo computed 15,37:1 (rail), 9,11:1 (nav active/account) — `shell-behavior.json.focus` |
| P1-02 H1 mobile | `.page-title` mobile 1.5rem; bỏ 3 override `.today/.subjects-page/.assistant`; đo 24px ở 390/360, 30px root 20px, 32px desktop |
| P2-03 badge 20+ | `NavBadge` nhận `capped` từ `nextCursor`; label “20+ cảnh báo đang mở”; test 20 item + cursor |
| P2-04 ArrowDown/Up | trigger đóng: ArrowDown mở + focus mục đầu, ArrowUp mở + focus mục cuối; giữ Escape/outside/Tab-out/focus-return; test + đo browser |
| P2-01 gate script | quét `a[href]`, `button`, `select`, `summary`, `[role=menuitem]`; metrics có toàn bộ targets; brand mobile 145,8×44 (shell 0 vi phạm) |

### 5.2. Target ≥44px — **cổng toàn app CHƯA đạt**, còn nợ lane

Đo 32 tổ hợp route × viewport, quét mọi action đứng riêng. **Shell (F) 0 vi
phạm**; các target dưới đây thuộc page legacy, ghi owner + số đo thay vì F tự
sửa page:

| Route | Target | 390/1280 (px) | 390 chữ lớn (px) | Owner |
| --- | --- | --- | --- | --- |
| `/login` | “Tạo tài khoản mới” | 125,5×18 | 156,9×23 | P |
| `/register` | “Đăng nhập” | 76×18 | 95×23 | P |
| `/app` | “Sức khỏe 7 ngày →” | 146,8×24,8 | 183,5×31 | C |
| `/app` | “Nhịp tim?” | 90,8×31,7 | 113×39,1 | C |
| `/app` | “Cảnh báo?” | 100,6×31,7 | 125,3×39,1 | C |
| `/app` | “Pin?” | 54,8×31,7 | 68×39,1 | C |
| `/app/alerts`, `/app/overview` | tiêu đề incident “Nghi ngã — cần chú ý” | 168,9×24,8 | 211,1×31 | C (alerts), H (overview) |
| `/app/overview` | “← Hôm nay” | 86,5×20 | 108,2×25 | H |
| `/app/overview` | “Xem tất cả cảnh báo →” | 160,8×18 | 201×23 | H |
| `/app/overview` | “Xem lịch sử và biểu đồ →” (2 chỗ) | 166,3×21,7 | 207,8×27,1 | H |
| `/app/overview` | “Quản lý” | 52,6×21,7 | 65,7×27,1 | H |
| `layout.css:1479` | `.dashboard-region__action .button` bị ép 40px (F3 cũ) | 40 | — | H |

- 12 target unique, **52 lượt** trên 4 viewport; ảnh/metrics: `metrics.json`
  (`smallTargets` + `targets`) và ảnh `today-*`, `login-*`, `register-*`,
  `overview-*`, `alerts-*`.
- Ba link “Xem sức khỏe / Chia sẻ / Thiết bị” ở `/app/subjects` **không** vi
  phạm: 104,3×44,0 / 59,6×44,0 / 61,1×44,0.
- Các trang legacy khác (settings, share, studio, tasks, admin subpages) chưa
  được đo toàn bộ target trong pass này; lane sở hữu tự kiểm khi chuyển CSS.
  Không tuyên bố cổng 44px đã đạt.

### 5.3. Deferred / nợ khác (không sửa trong pass này)

| Mục | Trạng thái | Owner |
| --- | --- | --- |
| P2-02 inbox | `?view=notifications` mới **redirect**; `AlertsPage` chưa đọc searchParams, chưa có H2 “Thông báo đã nhận”/hàng/mark-read. Ảnh `alerts-inbox-1280x900.png` giống alerts thường, **không** dùng làm bằng chứng inbox. Phải xong trước khi đóng W2 | C |
| P2-05 CSS | keyframes `shell-route-in`/`shell-banner-in` còn trùng trong `layout.css`; `.segmented/.breadcrumb` chưa dời primitives; F3 40px | F (keyframes) / H (F3) |
| P2-06 | pinned context alert detail/share chưa có; H1 alert detail gộp StatusPill | C/R |
| P2-07 | invite 422 vẫn báo như lỗi kết nối; link auth <44px | P |
| P2-08 | landing/admin vẫn presentation v6; ảnh chỉ chứng minh shell/token trên trang legacy | P/A |
| P3-01/02/03 | toggle trong menu thiếu `role=menuitem`; H1 alert detail chứa status; comment AssistantPage còn “dưới H1” | C |
| F4/F5/F6 | alert-row trùng; alias `--color-*`; test đọc CSS text | C/F/W3 |

Ngoài ra: `.site-header__nav .button` (P) và `.adm-filter-form .field` (A) còn
override primitive trong `layout.css`; đã ghi trong ledger.

## 6. Cách tích hợp

```bash
git -C C:/Users/nguye/orca/workspaces/DATN/v7-foundation log --oneline -1   # tip = commit handoff này
git -C C:/Users/nguye/orca/workspaces/DATN/v7-foundation log --oneline -6   # gồm f7c1322 merge rename
# merge branch Tung204/v7-foundation khi coordinator duyệt; KHÔNG push từ worker
```

- Branch đã merge master + rename `@heart-iot` (`f7c1322`); dùng account demo
  `*@demo.heart-iot.local`, không quay lại `@annhien`.
- Không đổi API/contract; không thêm dependency.
- Chạy lại `pnpm --filter @heart-iot/web build` sau merge để chắc CSS chunk mới.
- Nếu W2 thêm primitive mới: thêm vào `components/primitives.css` + test, không
  thêm định nghĩa trùng trong `layout.css`.

## 7. Ghi chú quy trình

- Lịch sử: foundation + fix topbar + fix tên/vai trò (đã rebase theo rename) +
  merge rename `f7c1322` + commit fix review này. Commit foundation từng gộp vì
  bản tách phase thiếu 2 file primitive; branch chưa push.
- Ảnh và `metrics.json` được chụp lại sau fix, trên đúng source của commit fix
  review (dev server HMR), không dùng ảnh cũ `dd01cbe`.
- Không viết Obsidian theo uỷ quyền (worker không ghi shared brain).
