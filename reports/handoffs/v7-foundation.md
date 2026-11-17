# Handoff — W1 foundation (v7)

**Task** `task_813739527bae` · **Dispatch** `ctx_a3d2bdad8bab` · **Worker terminal**
`term_c852d781-5304-48da-9dd2-6cb607e85275` · **Coordinator** `term_9d6038ec`

- **Worktree**: `C:/Users/nguye/orca/workspaces/DATN/v7-foundation`
- **Branch**: `Tung204/v7-foundation` (chưa merge, chưa push)
- **Base**: `a10c8ea` (spec W1) → **code SHA (đã đo)**: `8dbcc1f`
  (foundation `aad596c` + fix topbar); sau đó là commit bằng chứng/handoff này.
- **Provider/model thực tế**: `moxuna / deepseek-v4.1-flash`
- **Môi trường đo**: web dev `http://127.0.0.1:4350`; API dev `http://127.0.0.1:3000`
  với `PGLITE_DATA_DIR=.data/qa-v7-foundation`, chỉ đăng nhập demo + đọc.
  Không sửa API, không thêm dữ liệu giả.

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
  | `/app/history`, `/app/measurements/history` | Sức khỏe |
  | `/app/devices` | Người thân |
  | `/app/subjects` | không mục nào |
  | `/app/admin/*` | Quản trị |

  `aria-current="page"` trên cả rail và bottom-nav. Admin **không có hồ sơ** chỉ
  thấy “Quản trị”; `/app` tự chuyển `/app/admin` (giữ guard hiện có ở
  `AssistantPage`). `history` và `devices` trước đây không active → đã sửa.
- Menu tài khoản mở từ avatar: `Tài khoản`, `Quản trị` (chỉ admin), `Aa` bật/tắt
  chữ lớn, `Đăng xuất`. **Không có Studio.** Mở bằng Enter/Space/ArrowDown;
  ArrowUp/Down/Home/End di chuyển; Escape, click ngoài, focus ra ngoài đều đóng;
  focus trả về avatar. `aria-expanded`, `aria-haspopup="menu"`, `role="menu"`.
- Skip link “Bỏ qua điều hướng, tới nội dung”; `<main id="main">` nhận focus.
- Banner toàn cục ưu tiên: **mất quyền hồ sơ (role=alert)** > **thông báo mới
  (role=status, link `/app/alerts/{incidentId}`)** > **mất SSE (role=status)**.
  Banner thông báo ẩn khi đang xem đúng incident hoặc inbox; banner mất SSE chỉ
  hiện khi tab đang hiển thị.
- Route transition chỉ đổi opacity 120ms, không slide; tôn trọng
  `prefers-reduced-motion`.
- Dòng ngữ cảnh hồ sơ: một dòng, **trên H1**, chỉ render khi `scope='selected'`
  và route thuộc 5 trang (`/app`, history, alerts, devices, assistant). Nhãn
  accessible “Người được theo dõi”. Không hiện ở `/app/subjects`, inbox, admin.

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

## 2. Cổng kiểm — kết quả thật

```text
$ pnpm --filter @annhien/web typecheck
tsc -p tsconfig.json --noEmit        # exit 0

$ pnpm --filter @annhien/web build
✓ built in 451ms                     # exit 0

$ pnpm --filter @annhien/web exec vitest run --no-file-parallelism --maxWorkers=1
Test Files  37 passed (37)
     Tests  287 passed (287)
  Duration  141.00s

$ ... vitest run <10 file trọng tâm>  # AppShell, router, ProtectedRoute,
Test Files  10 passed (10)            # TextSizeToggle, ErrorBoundary, primitives,
     Tests  83 passed (83)            # useSubjectEvents, useUnreadNotifications,
                                      # SubjectSwitcher, lib/query
```

`pnpm build:contracts` đã chạy trước typecheck (exit 0).

### Đo giao diện (Playwright/Chromium, `metrics.json`)
24 tổ hợp route × viewport (`/`, `/login`, `/app`, `/app/alerts`, `/app/subjects`,
`/app/admin`; 1280×900, 390×844, 360×740, 390×844 chữ lớn):

| Chỉ số | Kết quả |
| --- | --- |
| `scrollWidth ≤ clientWidth` | 24/24, overflowX = 0 (cả body) |
| Đúng một H1 | 24/24 |
| CTA chính trong viewport đầu | 100% (`primary.txt` đủ) |
| Target ≥44px | 12 vi phạm, **chỉ** 3 chip gợi ý Hôm nay (finding F1, lane C) |
| Dòng ngữ cảnh trên H1 | today/alerts/history/devices/assistant ✓; subjects/inbox/admin ✗ đúng thiết kế |
| Menu tài khoản bàn phím | mở, item 44px, Escape đóng, focus về avatar ✓ |
| Focus ring | 3px `#174bc5`, offset 3px |
| Font | Be Vietnam Pro; body 16px; H1 32px; large-text root 20px; topbar 57px (56 + border) |
| Tương phản | body 14.13:1; nút primary 7.37:1; secondary 15.18:1; nav rail 15.37:1 |
| `/app/notifications` | → `/app/alerts?view=notifications` (replace) |

Ảnh + JSON: `reports/qa/evidence/v7-foundation/` (31 PNG + `metrics.json` +
`shell-behavior.json` + `css-ledger.md`). Tên file `<route>-<viewport>[-state].png`,
ví dụ `today-390x844.png`, `alerts-390x844-large.png`,
`mobile-account-menu-390x844.png`, `admin-1280x900-admin.png`.

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

## 4. Delta W0 #1–#11 — đối chiếu

1. Ảnh vào `reports/qa/evidence/v7-foundation/` ✓
2. Chỉ retire selector foundation; feature giữ; ledger + thứ tự import ✓ (cổng
   “không double CSS” toàn bộ chuyển W3) ✓
3. Context line 5 trang, trên H1, tên “Người được theo dõi”; patch tối thiểu
   AssistantPage + ghi test diff ✓
4. Admin không hồ sơ: nav Quản trị + `/app → /app/admin`; test cả hai ✓
5. Giữ boot/noscript; theme-color `#F4F7FB`; skeleton tĩnh; copy trung thực ✓
6. `/app/notifications` → replace `/app/alerts?view=notifications` ✓
7. Banner mới link `/app/alerts/{incidentId}`, ẩn đúng incident/inbox; ưu tiên
   mất quyền > thông báo mới > mất SSE ✓
8. Interface W2 đóng băng: không đổi `features/auth/useAuth`,
   `features/dashboard/api`, `features/notifications/api` +
   `useUnreadNotifications`, `features/alerts/labels`, `features/contacts/phone`
   + `useEmergencyContacts` ✓
9. `primitives.css` một chỗ ✓
10. `purgeSubjectData` theo subjectId, không `removeQueries(['alerts'])` ✓
11. QA API pinned `WEB_ORIGIN=http://127.0.0.1:4350` + PGlite local ✓

## 5. Finding / việc còn lại (không sửa trong W1)

| ID | Việc | Số đo | Owner |
| --- | --- | --- | --- |
| F1 | Chip gợi ý Hôm nay (`Nhịp tim?/Cảnh báo?/Pin?`) thấp hơn 44px | 31.7px (39.1px chữ lớn) | C — Assistant |
| F2 | Link “Tạo tài khoản mới” ở chân form đăng nhập | cao 18px (23px chữ lớn) | P — Auth |
| F3 | `.dashboard-region__action .button` ép `min-height: 2.5rem` (40px) | trong `layout.css:1479` | H |
| F4 | `.alert-row__side` định nghĩa 2 lần trong `layout.css` (nợ cũ) | 415, 951 | C |
| F5 | 19 alias `--color-*` cũ vẫn còn để W2 chuyển; xoá khi lane xong | `tokens.css` | F/W2 |
| F6 | `AppShell.test.tsx` đọc nội dung CSS để kiểm token — dễ vỡ khi tách file | — | F/W3 |

Ngoài ra: `.site-header__nav .button` (P) và `.adm-filter-form .field` (A) còn
override primitive trong `layout.css`; đã ghi trong ledger, không sửa vì thuộc
lane và không ảnh hưởng cổng W1.

## 6. Cách tích hợp

```bash
git -C C:/Users/nguye/orca/workspaces/DATN/v7-foundation log --oneline -1   # 8dbcc1f
# merge branch Tung204/v7-foundation khi coordinator duyệt; KHÔNG push từ worker
```

- Không đổi API/contract; không thêm dependency.
- Chạy lại `pnpm --filter @annhien/web build` sau merge để chắc CSS chunk mới.
- Nếu W2 thêm primitive mới: thêm vào `components/primitives.css` + test, không
  thêm định nghĩa trùng trong `layout.css`.

## 7. Ghi chú quy trình

- Commit gộp thành **một** commit foundation (`aad596c`) + một fix topbar
  (`8dbcc1f`) thay vì nhiều commit
  phase: bản tách phase đầu bị thiếu 2 file primitive (`PageHeader`, `Section`)
  nên commit trung gian không typecheck; đã squash trước khi bàn giao, branch
  chưa push nên không ảnh hưởng ai. Không merge.
- Ảnh được chụp lại sau commit trên đúng source `aad596c` (dev server HMR).
- Không viết Obsidian theo uỷ quyền (worker không ghi shared brain).
