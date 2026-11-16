# v7 — kế hoạch thay presentation và chia implementation

**Ngày:** 15/11/2026 · **Baseline:** `bc10ae60d5cc443a8e4070da63b5e6be0e4a8127` · **Trạng thái:** kế hoạch kỹ thuật để lead điều phối, không phải checklist tiến độ thứ hai hay xác nhận đã triển khai.

Đặc tả duy nhất để worker dùng: [design-system.md](design-system.md). Mandate mới thay UI trực tiếp trên nhánh, không chờ vòng preview xin phép riêng; bản build hợp nhất vẫn phải tự kiểm ảnh và được reviewer độc lập kiểm trước master. Worker không được tự chọn palette/font/IA khác. Các vai trò dưới đây là **đề xuất assignment**, không khẳng định các worker đã được khởi chạy.

## 1. Khảo sát và impact map

### 1.1. Các điểm source quyết định phạm vi

- `index.html` còn inline boot CSS/theme-color nền kem và shimmer; đây cũng là presentation phải thay, không chỉ React sau mount. `src/main.tsx` đang import bảy stylesheet toàn cục: fonts, tokens, base, `layout.css`, `public-simple.css`, `app-simple.css`, `admin-simple.css`. `layout.css` dài 3.509 dòng, chứa primitive, shell, mọi feature và nhiều đợt tinh chỉnh/selector lặp; ba file `*-simple` tiếp tục ghi đè. Không thêm `v7.css` cuối chuỗi.
- CSS cục bộ còn ở `features/{subjects,contacts,insights,settings,tasks,studio}`, `features/admin/admin-devices.css`, `components/MeasurementChart.css`. Chỉ đổi tokens sẽ bỏ sót cả presentation JSX và logic nhóm trạng thái.
- Router có public/auth/invite/404, `/app` Hôm nay, overview/history/alerts/detail/subjects/share/devices/tasks/settings/admin và ba route Studio. `/app/assistant` là alias; `/app/notifications` hiện redirect về list alerts nhưng **`NotificationsPage` vẫn có chức năng mark-read đang không được mount**.
- `SubjectContextLine` hiện chỉ ở Hôm nay; `SubjectSwitcher` export no-op. Selection store dùng chung và được hàng Người thân set trước navigate. Phải thiết kế lại ngữ cảnh nhiều hồ sơ ở tất cả trang subject-scoped, không khôi phục card lớn.
- `insights/useInsights.ts` dùng `placeholderData: keepPreviousData` không ràng identity. Hôm nay đã có guard late answer riêng, nhưng form/confirm của thiết bị, share, alerts, Studio và cache key ngoài `['subjects', id]` phải rà tương tự. Đây là rủi ro **suy ra từ source, chưa tái hiện browser**.
- Dashboard hiện một số query chỉ `enabled: Boolean(subjectId)` dù UI biết quyền; owner-only share vẫn khai query trước guard owner. Khi làm mới page, gate known permissions đúng capability; không coi backend 403 là lỗi mạng hay query forbidden là “không có dữ liệu”.
- Công việc gọi endpoint account-wide và `canClose` hiện owner/admin, caregiver chỉ xem. Không áp global subject selector làm người dùng tưởng server đang lọc theo một người; không thêm quyền bằng copy docs cũ.
- Admin có policy/audit dưới Nâng cao, state query params sẵn; Studio có preview/digest/publication/data thật và rollback. Chúng phải thay JSX/CSS nhưng giữ ranh giới, không bỏ vì không nằm menu người dùng.
- Review v6 do lead cung cấp đã tái hiện invite 422 bị gán lỗi mạng và target link auth/header thấp hơn 44px; môi trường `localhost`/`127.0.0.1` cùng port từng trả hai worktree khác. Không nhận ảnh/số test cũ làm bằng chứng v7.

### 1.2. Đường ảnh hưởng và điều phải giữ

| Đường | Thay trong v7 | Không thay / lý do | Cổng hồi quy |
| --- | --- | --- | --- |
| `main → fonts/tokens/base/primitives/shell` | Thay hệ chữ/màu/layout, xóa override cũ có kiểm, target/focus/heading | QueryClient/StrictMode/text-size init/route lazy loading giữ cơ chế | Typecheck, primitives/shell tests, build CSS asset + ảnh |
| Router → public/auth/invite/404 | JSX mới, layout phẳng, lỗi đúng nhóm, safe `next` | Không thêm auth method/reset password hoặc tự đăng ký demo | Auth/landing/invite/ProtectedRoute/router unit + smoke |
| Selection → subject pages → query keys → SSE | Context compact dùng chung, cô lập state/permission/cancel/late response | Contracts/quyền server/assignment không đổi | A→B khi response A chậm, revoke, API call assertions |
| Alerts/notifications/contacts | Row/action hub, giữ inbox mark-read có đường vào, đúng incident từ banner | In-app only; mark-read ≠ ack ≠ resolve; CAS/tel/manual calling | alerts/detail/contacts/notifications/SSE + E2E |
| Dashboard/history/insights/CSV | Hệ thông tin mới, chất lượng/source đi cùng dữ liệu, charts/table presentation | Không đổi aggregate/history window/sharedFrom/CSV from-to/giới hạn render hợp lệ | dashboard/history/insights/chart, history 60s và trần 400 |
| Subjects/share/archive/deletion | Hàng người/form mới, phân biệt user-subject, phân nhóm quyền | Archive không xóa; deletion recorded; token một lần; quyền health khác alerts | subjects/form/share/contacts/invite + mutation payload |
| Devices/tasks | Thiết bị và bảo trì có đường tìm rõ; form/confirm presentation | Không scheduler/AI tự tạo task, claim≠online, caregiver không close nếu source cấm | devices/tasks + identity/permission regression |
| Settings/sessions/account | Section mới, account popup, target/focus/errors | HttpOnly/session/logout/đổi password giữ phiên hiện tại | Settings/TextSizeToggle/AppShell và 401 |
| Admin/policy/audit/secrets | Navigation theo nghiệp vụ, bảng/row/preview feedback mới | Admin không tự có quyền health; CAS/digest, one-time secret, safe audit giữ | AdminPage/AdminDevices + test diff review |
| Studio/config/widget/data | Cả list/editor/preview/publication/data đổi presentation | Schema/version/sample/permissions/read-only/CAS/rollback giữ | Ba suite Studio + widgets/late response + screenshot |
| API/DB/contracts/firmware | **Không cần sửa** cho hướng này | Không tạo endpoint/migration/seed để bịa UI | Chỉ mở API test nếu diff thực tế chạm boundary; báo blocker nếu cần đổi backend |
| Docs/HTML | Lead cập nhật mô tả v7 thực làm sau tích hợp, nguồn rồi generated | Không sửa HTML bằng tay; không báo proposal đã nghiệm thu | docs build + `--check`, link/JSON khi liên quan |

## 2. Kiến trúc CSS thay thế — không chồng override

### 2.1. Đích cuối

Dùng **CSS thuần theo source owner và namespace BEM**, biến CSS semantic dùng chung; không framework/dependency mới, không bulk đổi sang CSS Modules chỉ để đổi phong cách. Vite hỗ trợ CSS Modules sẵn nhưng không bắt migration toàn bộ BEM hiện có; nhãn class giữ được trong giai đoạn ghép, còn layout/JSX/CSS thực sự phải thay.

- `styles/fonts.css`: chỉ Be Vietnam Pro 400/500/600/700 latin/vietnamese; không nạp Newsreader.
- `styles/tokens.css`: token v7 và alias semantic có giới hạn; không feature selector.
- `styles/base.css`: reset, typography, focus, reduced-motion, visually-hidden, skip link, utility có contract; không `.today`, `.adm-*`, `.hero`.
- `components/primitives.css`: các họ `button*`, `field*`, `alert*`, `pill*`, `empty-state*`, `error-state*`, `page-loader*`, `segmented*`, `confirm-box*`, `breadcrumb`, `page-header*`, `section*`, bảng dùng chung nếu thật sự cùng cấu trúc. **Một định nghĩa** cho từng variant; `sm` không giảm target <44.
- `styles/shell.css`: `shell*`, account popup/banner/nav/context placement; không `.dashboard`, `.subject-list`, `.auth-card`.
- `pages/public.css` và `features/auth/auth.css`: source presentation công khai/auth/invite/404, owner public.
- Feature stylesheet chính thức import tại feature/page root: `features/assistant/assistant.css`, `alerts/alerts.css`, `notifications/notifications.css`, `dashboard/dashboard.css`, `history/history.css`, `insights/insights.css`, `subjects/subjects.css`, `share/share.css`, `contacts/contacts.css`, `devices/devices.css`, `tasks/tasks.css`, `settings/settings.css`, `admin/admin.css` + `admin-devices.css`, `studio/studio.css`.
- `components/MeasurementChart.css`: **toàn bộ** chart presentation, không một phần ở layout + một phần override ở file này. Khác biệt Insights/Studio chart nằm trong feature tương ứng, không sửa geometry từ một global selector.

Mỗi route có root class rõ và chỉ định nghĩa selector của mình; không `.admin-page .button`/`.today .field__input` để tái định nghĩa primitive toàn diện. Dùng class modifier/API primitive cho variant hợp lệ, feature chỉ định placement/width/gap. Không `!important` để thắng cascade, không selector theo tên user/dữ liệu fixture, không global `.stack > .segmented` để vá toàn app.

### 2.2. Chuyển đổi có tính nguyên tử và tương thích

**Bước nền F1, trước khi feature worker chạy:** foundation owner lập ledger selector → nơi dùng → file mới; chuyển các block đang còn dùng khỏi `layout.css`/`*-simple.css` sang file source owner theo danh sách trên, gộp selector lặp thành một định nghĩa có hiệu lực. Chưa xóa block chỉ vì grep nhanh không thấy: kiểm cả dynamic class, modifier, widget và hidden states.

- Việc tách CSS là một commit nguyên tử với `main` và imports: trong build **không bao giờ nạp đồng thời** `layout.css`/`*-simple.css` và bản thay. Foundation có quyền tạo/sắp xếp các CSS feature ở bước này; đó là **quyền ghi tạm được kết thúc trước wave feature**, không hai worker sửa cùng file.
- `main.tsx` cuối chỉ import fonts/tokens/base/primitives/shell. Mỗi feature root import CSS của mình; ở commit tách nền có thể import feature sheets tạm từ main để không đụng JSX của worker, nhưng feature owner chuyển import về page root và foundation bỏ dòng main theo patch yêu cầu. Chỉ một owner chạm `main`.
- Alias token cũ cần tương thích (`--color-paper`, `--color-ink`, `--color-teal`, `--color-brick`, `--font-display`, `--text-*`, `--space-*`, radius) **trỏ token v7 ngay trong tokens**, không giữ màu/nền/serif cũ. `PillTone teal/brick/sand` và `Card` API cũ giữ tạm để test/feature đang ghép build được; mapping nghĩa teal→success kết nối, brick→danger, sand→warning, không tự đổi trạng thái nghiệp vụ.
- `Card.tsx` được foundation làm lại thành surface/section ít trang trí, cho phép heading level hợp lý; feature owners vẫn phải bỏ wrapper thừa/đổi JSX order, không nhận “đã redesign” chỉ vì Card đổi nền. Không sửa contract children/variant làm caller vỡ trước khi chuyển hết.
- Class cũ còn dùng (`today-*`, `subject-list*`, `adm-*`, `studio-*`, v.v.) có thể giữ tên trong **file feature chính thức**, không một file `compat-all.css`. Alias selector chỉ nằm tại owner feature, được ghi tên/người nhận cleanup và có gate xóa; không kéo layout cũ nguyên xi thành stylesheet mới rồi tuyên bố xong.
- Cơ chế shared subject context do foundation xuất, page có thể giữ `SubjectSwitcher` no-op export trong một commit tương thích; khi foundation render context theo route thì page không render thêm. Một route không có hai bộ chọn.
- Sau mỗi feature thay JSX, owner xóa rule/class không còn dùng trong phạm vi mình và giao bằng chứng grep/ảnh states. **Cổng cuối:** `layout.css`, `public-simple.css`, `app-simple.css`, `admin-simple.css` không còn imports/file; không Newsreader request; không duplicate định nghĩa primitive ở feature; alias presentation chết được retire có kiểm.

Nếu việc extract toàn bộ CSS khiến commit không thể giữ baseline hành vi, foundation tách commit nhỏ nhưng giữ invariant một source cho mỗi selector; lead không merge hai nhánh chứa cùng họ CSS chưa giải xung đột. Không “sửa sau bằng override” để qua gate.

## 3. Quyền sở hữu file và hợp đồng giữa worker

Tất cả đường dẫn code bên dưới tương đối `apps/web/`. Test colocated thuộc cùng owner, **trừ** test shared/E2E do QA. Một file chỉ có một writer tại một thời điểm. Shared change cần gửi patch/yêu cầu cho owner, không tiện sửa luôn.

| Vai trò | Quyền ghi sau F1 (độc quyền) | Không được đụng / giao diện cần dùng |
| --- | --- | --- |
| **F — foundation/integrator** | `index.html` (metadata/boot/noscript); `src/main.tsx`; `src/styles/{fonts,tokens,base,shell}.css`; `src/components/*` **trừ MeasurementChart***; `src/app/*` (router, AppShell, ProtectedRoute, ComingSoon và tests); `src/lib/*`; `src/features/subjects/{SubjectSwitcher.tsx,SubjectSwitcher.test.tsx,selection.ts,useSubjects.ts}` và file context CSS mới nếu cần; `src/features/realtime/*`; `src/features/notifications/useUnreadNotifications*`; `src/test/{setup,utils}.tsx/ts` khi thực cần | Không sửa page feature W2; không giữ ownership cả thư mục subjects/notifications. `main`, tokens, primitives, router chỉ F viết. F nhận patch requirement từ lanes |
| **P — public/auth/invite** | `src/pages/*`; `src/features/auth/*`; `src/features/invitations/*`; `src/pages/public.css`, `src/features/auth/auth.css` | Không SiteHeader/SiteFooter/SkipLink primitives (đề nghị F), không router/main/lib; auth useAuth giữ API/session behavior và chỉ đổi nếu có test |
| **C — cảnh báo + trợ lý + inbox** | `src/features/assistant/*`, `alerts/*`; `notifications/{NotificationsPage.tsx,NotificationsPage.test.tsx,notifications.css,api.ts}` | Không `useUnreadNotifications*`, realtime, query registry hoặc contacts files. C dùng contacts components theo contract hiện có, không tự fork một component gọi riêng |
| **H — dữ liệu sức khỏe** | `src/features/dashboard/*`, `history/*`, `insights/*`; `src/components/MeasurementChart.tsx`, `.css`, `.test.tsx` | Không shell/context. H sở hữu sửa placeholder insights ràng identity, quyền known-gate và toàn bộ presentation chart/data |
| **R — người thân + chia sẻ + thiết bị + bảo trì + tài khoản** | `src/features/subjects/{SubjectsPage*,SubjectForm*,subjects.css,api.ts}`; toàn bộ `share/*`, `contacts/*`, `devices/*`, `tasks/*`, `settings/*` | Không selection/context/useSubjects files của F; không auth API/useAuth của P. Settings tiếp tục import cơ chế auth/account có sẵn, gửi yêu cầu API shared cho P nếu thật cần |
| **A — quản trị + Studio** | `src/features/admin/*`, `src/features/studio/*` (gồm local CSS, helpers, tests) | Không global admin overrides/main/router, không privileges/contracts/server. A tự test cả direct route không qua menu |
| **Q — kiểm chứng độc lập** | `e2e/*`, `playwright.config.ts`, báo cáo/ảnh trong vùng QA được lead cấp | Không sửa source để che finding. Q không dùng `src/test` hay sửa test colocated khi feature owner đang viết |
| **D — tài liệu/tích hợp cuối (lead)** | README, docs/README, docs/06/07/12/14/ADR cần thiết; `apps/web/README.md`; `docs/html/index.html` sinh bằng tool; báo cáo gate, journal/Obsidian nếu được phép | Không tự sửa code page chồng worker; docs kể phần **thực sự** đã làm và giới hạn, không tất cả proposal |

F1 có quyền tạm tạo/tách **chỉ CSS feature** trước bàn giao; sau commit nền, file đó thuộc P/C/H/R/A như bảng. Nếu R quá rộng so với năng lực/thời gian, **chia tuần tự** R1 People/share/contacts → R2 devices/tasks/settings, hoặc lead tách assignment theo đúng thư mục trên **trước** dispatch; không thêm writer đồng thời trên `SubjectsPage`/contacts chỉ vì cần dùng cùng component.

### 3.1. API component foundation cần khóa ở F1

F công bố trong handoff, không để feature đoán API mới:

- Giữ `Button`/`ButtonLink` variants `primary|secondary|subtle|danger|danger-quiet`, `sm|md`, native props/ref. Target ≥44px cho cả hai size, pending label do caller sở hữu.
- Giữ `TextField(id,label,error,hint,required, native input props)`; hint/error IDs không mất; optional shared select/textarea chỉ thêm khi nhiều call sites cần, không bắt cả dự án refactor helper mới.
- `PageHeader`/`Section` mới nếu có phải có type/heading level/action slot rõ; `EmptyState`/`ErrorState` có option heading level để không lồng H1. Mặc định tương thích caller standalone, feature trong page truyền đúng level.
- `SubjectContextLine` hỗ trợ scope rõ `selected|pinned|collection|none` hoặc component tương đương typed; **selected chỉ cho năm loại trang subject-scoped** (Hôm nay kể cả alias, Sức khỏe, Lịch sử, list Cảnh báo không phải inbox, Thiết bị). Shell render selected context; page alert detail/share/Studio data render pinned context từ đối tượng đã xác minh và shell không render thêm, không cần dựng context provider mới chỉ để đẩy tên lên shell. F thống nhất một nguồn quyết định route scope/active nav, không mỗi page tự regex khác nhau.
- Router giữ lazy route chunks; C cung cấp Notifications content có thể mount dưới Cảnh báo, F xử lý `?view=notifications` + legacy redirect. C không import route object để né ownership.
- Settings không phụ thuộc subject; task/notification account-wide không bị remount khi chọn subject không liên quan. F không `key` toàn `Outlet` theo global selection làm mất state account/admin ngoài ý muốn.

## 4. Waves và thứ tự integration

### W0 — thiết kế, inventory và phản biện (không code)

Design worker tạo ba file hiện tại. Reviewer độc lập do lead giao đối chiếu map route→action→state→logic/test, đề xuất sai khác có bằng chứng source; không quota finding. Lead ghi quyết định công khai khi chấp nhận/điều chỉnh spec trước dispatch implementation; không tạo ba moodboard hoặc hỏi lại người dùng chọn màu.

**Cổng W0:** không route/capability bị bỏ; thống nhất cách khôi phục inbox, scope context và policy/audit navigation; xác nhận quyền ghi. Nếu reviewer không tìm vấn đề có bằng chứng thì ghi đúng phạm vi đọc, không ép đủ số lỗi.

### W1 — foundation một writer F; QA chuẩn bị read-only song song

1. F xác minh versions/docs cho API thực dùng, kiểm baseline nhỏ nhất và ledger CSS/import/class.
2. Tách source CSS nguyên tử theo §2, đổi tokens/fonts/base/primitives/shell, thay `index.html` boot/theme-color/noscript và JSX shell/utility menu/compact context. Khóa primitive contracts. Chưa nhận các route feature tạm còn layout cũ là đã redesign.
3. Cô lập selection/identity/SSE và hooks shared, active nav và pinned/collection exceptions. Không retry 4xx bừa, không biến query cancellation thành hủy mutation.
4. Q có thể đọc test/inventory/thiết kế và chuẩn bị **chỉ e2e/config của Q**; chưa chụp bản tạm rồi nhận là ảnh bản v7 hoàn tất.

**Cổng F1 bàn giao:** typecheck web; shell/router/protected/context/text-size/error-boundary/realtime/unread tests liên quan; build để chứng minh stylesheet mới có đường import hợp lệ; không double CSS; root/font/contrast/focus đạt contract mới, không mặc định alias token giữ đủ spacing cho mọi feature chưa ghép. F đưa commit nền + API components + danh sách CSS chuyển giao; lead đóng lease tạm CSS feature rồi mới mở W2. Token/primitive change sau F1 phải thông báo tất cả lanes và rerun affected tests; không lặng đổi spacing cuối phiên.

### W2 — triển khai song song P / C / H / R / A trên cùng nền F1

- P thay public/auth/invite/404; C thay Hôm nay/alerts/detail/inbox; H thay health/history/insights/chart; R thay mọi đường người thân/devices/tasks/account; A thay admin/Studio.
- F chỉ tích hợp shared requests, không viết lại feature của lanes. Contacts owner R thống nhất sớm action card API để C dùng; C có thể chạy trước bằng API cũ nhưng chỉ đóng scope detail khi R bàn giao contacts presentation mới.
- Tất cả giữ API/schema/hooks hợp lệ, sửa known permission gates trong file của mình và test identity local. Không thay backend/DB/shared seed. Cần thay outside scope thì gửi blocker có đường ảnh hưởng, không mở rộng bằng dependency.
- Mỗi lane nộp commit nhỏ có typecheck + unit nhỏ nhất + ảnh tự kiểm 1280/390/360/chữ lớn cho route mình (nếu môi trường dùng được). Kết quả phải ghi branch/SHA/URL/state và giới hạn; không giả đã xem ảnh khi chỉ có DOM. Ảnh ở nhánh riêng không thay gate hợp nhất.

**Cổng lane:** mỗi route có JSX order + presentation thực mới, không chỉ CSS; action/state matrix còn đủ; test diff giải thích từng assertion thay đổi; CSS dead-rule cleanup và không file chéo. Lanes không merge master.

### W3 — lead/F tích hợp tuần tự, rồi bản build hợp nhất

Thứ tự đề nghị: **P → H → R → C → A** sau F1; C sau R để nhận contacts và đường people/device; A không phụ thuộc API C/H nhưng được kiểm cuối với shared primitives. Các lanes vẫn triển khai song song; thứ tự này là thứ tự merge/cherry-pick vào nhánh tích hợp, không buộc chờ nhau code.

Sau **mỗi** integration: typecheck web, chạy unit các feature vừa ghép và shared suites nếu primitive/context/router đổi; kiểm imports/dynamic classes, không resolve conflict bằng giữ cả hai CSS definition. F nối notifications view/legacy redirect và bỏ context render cục bộ cuối cùng; Q cập nhật E2E expectation UI mới nhưng giữ behavior assertions.

**Cổng W3:** tất cả route trong spec đã đổi, không compatibility stylesheet toàn hệ thống, styles cũ không import và được retire; app root branding/metadata phù hợp; source/test/route inventory không còn chức năng orphan. Sau đó chạy full web unit, production build; phục vụ **production preview của đúng nhánh tích hợp**, không dev server khác host.

### W4 — reviewer độc lập trên build hợp nhất, sửa finding và cổng cuối

Q/reviewer mới kiểm ảnh + thao tác theo §6; độc lập tác giả, đọc cả **test diff** và không chỉ tin test xanh. Finding hợp lệ có route/viewport/role/state/expected/actual/evidence; không quota. Lead phân lỗi đúng owner; sửa xong test hồi quy và reviewer tái kiểm chính tình huống, không đóng vì tác giả nói xong.

D cập nhật docs phản ánh UI thực làm, sinh HTML/check. Cổng cuối: web typecheck/unit/build/E2E; docs HTML/check, payload mẫu khi source JSON/contracts có đường ảnh hưởng; API tests mở rộng đúng boundary nếu diff thật cần, không chạy/seed shared DB để đạt số test. Trước master, ghi lỗi còn mở/giới hạn và phạm vi review. Không đồng nhất “pass cục bộ” với user chấp nhận hoặc sản phẩm an toàn y tế.

## 5. Migration tests: bảo toàn hành vi, không đóng băng UI cũ

### 5.1. Bộ có sẵn phải giữ ý nghĩa

| Nguồn test có sẵn | Assertion nghiệp vụ cần giữ | Thay đổi presentation hợp lệ / thêm regression |
| --- | --- | --- |
| `AppShell.test`, `router.test`, `ProtectedRoute.test` | 4 href/nav order; account role gate/logout/keyboard; 401 next; alias assistant; chunk/error shell | Đổi selector/layout; active nhóm cho subroute; inbox redirect mới nhưng **test cũ không được chỉ xóa** — chứng minh inbox còn dùng và role không rò |
| `SubjectSwitcher.test`, `SubjectsPage.test` | 0/1/n subject; retry/no 0 giả; chọn đúng id trước Xem sức khỏe/Thiết bị; archive/deletion true semantics | Dùng context ở mọi route, pinned B khi storage A; tên user ≠ subject; không full-width card |
| `AssistantPage.test`, `e2e/assistant.spec.ts` | Không auto summary/ack; hội thoại nhiều lượt; 403/429/fallback/source/disclaimer; reset và late answer A | Heading Hỏi trợ lý AI nhìn thấy; gửi trong viewport; quyền từng capability; không show metrics trước hỏi |
| `AlertsPage`, `AlertDetailPage`, contacts suites; `e2e/alerts` | Confirm ack, CAS 409, lỗi mutation không thành công giả, gọi trước đổi trạng thái khi mở, resolved ưu tiên kết quả | Context từ detail.subjectId; mất contact/contacts lỗi vẫn thấy incident/action; banner B mở đúng incident; no-permission không ghi |
| `NotificationsPage`, `useUnreadNotifications`, realtime suites | Chưa đọc/mark-read rollback; baseline không banner giả; hidden-tab dừng poll; revoked purge/close | Inbox có đường route hoạt động, account-wide scope; count open và unread không bị gộp; late/revoked A không ảnh hưởng B |
| Dashboard/History/Insights/MeasurementChart + `e2e/history` | Missing/poor signal/source; sharedFrom/historyDays; CSV đúng window; 60s không refetch; 10→50 bước/trần 400 và only-one DOM mobile | `keepPreviousData` chỉ cùng identity, late insights A không lộ B; gate số đo/AI; chart presentation mới có bảng thay thế |
| SubjectForm/Share/Contacts/Invite | Schema validation; quyền nhận cảnh báo khác số đo; AI disabled khi không số đo; max contacts/primary; one-time link; public preview không email | Token ngắn 400/422 ≠ network/5xx; 404 invalid; hint/error/focus; #contacts truy cập trực tiếp; không tải owner-only query cho caregiver |
| Devices/Tasks/Settings | Claim/release/đóng task payload, confirm, permissions; password/sessions/toggle | Claim code/form errors reset A→B; account-wide tasks có tên người; settings chỉ tên user; late response không toast nhầm |
| AdminPage suites | Non-admin không gọi API, tab URL/reload, search/filter/paging, status rules, policy preview/digest/change/CAS, audit panel/secrets | Local nav trực tiếp policy/audit giữ URL cũ; target/focus/feedback viewport; secret không ở DOM sau ẩn/navigation |
| Ba Studio suites | Draft/save/preview/publish/rollback; dirty invalidation, revision+digest matching response, sample vs publication, scope/history/rights | List/editor/data đều presentation mới; late source/view responses; UI không quyền quản lý vẫn read-only; mobile widgets/JSON |
| Landing/Login/Register + smoke | Nguồn/giới hạn đủ nghĩa; me loading/error khác guest; next safe; first error focus; CTA viewport | Copy/heading mới được cập nhật có lý do; vẫn giữ target/overflow/CTA đúng test, không xóa 320/640 phụ nếu đang hợp lệ |

Không giảm độ mạnh test để khớp layout: thay `getByText` vì copy mới phải giữ kiểm ý nghĩa/mutation/permission. Không thêm `skip`, `todo`, `only`, retry vô cớ hoặc sửa timeout để lấp lỗi thực. Các trường hợp hình học chỉ đo browser, không jsdom. Khi route redirect chủ đích thay, reviewer đọc requirement và thêm coverage **đường chức năng thay thế**, không chỉ test link cũ biến mất.

### 5.2. Bộ scenario bổ sung bắt buộc (fixture tổng hợp)

- Owner không hồ sơ, owner một hồ sơ, hai subject A/B có tên/dữ liệu khác biệt, caregiver alerts-only, caregiver đo được nhưng không AI, caregiver không alert, user thường vào admin, admin không có care link.
- Data fresh / online nhưng số đo stale / device offline / never / no valid HR / unknown battery / source synthetic / khoảng thiếu / before-share incident / late incident / open acknowledged resolved unconfirmed.
- Chặn một response của A (AI, insights, devices, share, Studio data) → chọn B → assert **ngay render đầu B** không có DOM/data A → thả response A → vẫn không A/nhầm focus/success → B vẫn dùng được. Thêm thu hồi quyền giữa request và giữa mutation; không khẳng định mutation đã bị undo khi navigation.
- Network/5xx/403/404/409/422/429 từng vùng; form giữ giá trị và retry đúng loại. Invalid invite token validation từ server không hiện “Không kết nối”; không log token.
- Inbox account-wide có item B trong khi selection A; bấm Xem cảnh báo thấy đúng B/context/actions quyền theo B; mark-read không ack/resolve. Legacy URL mở đúng inbox mode.
- Studio preview sample không ghi nghiệp vụ; publication dữ liệu không dùng draft; admin/user/global scope không mở subject không có care permission; thay preview input vô hiệu publish.

## 6. Acceptance đo được trên browser

**Mọi mục dưới đây là điều phải kiểm trong implementation, chưa chạy trong phiên thiết kế.** Không bắt đủ số finding; kết luận theo bằng chứng.

### 6.1. Môi trường và artifact trước khi đo

- Pin **một hostname + port + scheme** cho web/API/WEB_ORIGIN; không hoán đổi `localhost` với `127.0.0.1`. Ghi worktree, Git SHA, lệnh build/serve, web URL, API URL, browser/UA, thời điểm Asia/Ho_Chi_Minh.
- Xác minh fingerprint đúng build bằng HTML/script asset hash và source/build commit do process đang phục vụ, không chỉ nhìn port mở hoặc title giống nhau. `reuseExistingServer` không được âm thầm nhận listener cũ; Q/lead chỉnh config thuộc quyền Q để preview/E2E dùng đúng process.
- Dùng mock API có schema hoặc DB/API **riêng** được phép; không seed/ghi DB chia sẻ. E2E mock phải fail/ghi lỗi cho endpoint ngoài handler, không fallback sang API thật rồi coi là mock đủ. Login tạo session và các mutation phải nằm môi trường QA được cấp, không bypass Origin để tuyên bố login UI pass.
- Kiểm rendering bằng Orca embedded browser theo skill/runtime hiện hành; screenshot lưu vùng QA trong workspace. Screenshot lỗi CDP chỉ là lỗi công cụ cho đến khi có bằng chứng app, không báo finding UI suy đoán.
- Mỗi artifact ghi route/query/hash + role + fixture state + viewport + text-size + SHA. Ghi console/network lỗi, bounding boxes và screenshot thật; không nhận ảnh v4/v6 hoặc nhánh riêng là ảnh hợp nhất.

### 6.2. Ma trận viewport

Với **mọi nhóm route**, gồm public/auth/invite/404, shell+Hôm nay, alerts/detail/inbox, health/history/insights, subjects/create/edit/danger/share/contacts/devices/tasks/settings, cả năm mục admin và ba route Studio:

- `1280×900`, `390×844`, `360×740` CSS px, DPR ghi rõ.
- Mỗi viewport cỡ thường **và** `html[data-text-size=large]` (20px). Chạy thêm browser zoom 200% để phát hiện fixed-height/clipping; không đòi mọi field dài nằm trên một viewport ở zoom 200%, phải reflow và scroll/focus tới action.
- Happy path + loading + empty + retryable error + no-permission + stale phù hợp route. Không bịa stale cho auth/404; kiểm trạng thái invalid/session tương ứng. Mở form/menu/confirm/preview/JSON cần thiết, không chỉ chụp tab mặc định.
- Các regression 320×640/360×640/375×667 đang có trong smoke không bị xóa chỉ vì ma trận mới bắt đầu 360×740. Nếu có xung đột requirement thật, lead ghi quyết định trước thay test; không tự hạ chuẩn.

### 6.3. Action ở màn đầu

Đo khi page vừa tải xong fixture tiêu chuẩn, **scrollY=0**, bàn phím phần mềm chưa mở; dùng `getBoundingClientRect`/boundingBox của element hiển thị. Một action đạt khi bbox không bị clipping/overlay và `bottom <= bottomNav.getBoundingClientRect().top - 8px` trong app; bbox nav đã gồm safe-area nên không trừ safe-area lần thứ hai. Public không trừ nav. Không chỉ `toBeVisible` hoặc “có trong DOM”.

| Màn/trạng thái | Action cần thấy trọn trong viewport đầu |
| --- | --- |
| Landing guest | Tạo tài khoản + Đăng nhập + dòng giới hạn đầy đủ nằm sau CTA |
| Login/register pristine | Submit; register 360×740 chữ lớn vẫn trọn như regression cũ, không ẩn label/hint cần thiết |
| Hôm nay có incident mở | Gọi khi contact hợp lệ và Xem cảnh báo trước hội thoại; heading AI + input/Gửi còn thấy với fixture tiêu chuẩn |
| Hôm nay fresh/no-data | Ô hỏi/Gửi nếu đủ quyền; nếu không hồ sơ thì Thêm người; thiếu quyền phải thấy explanation thay nút gửi mù |
| Alert detail đang mở | Contact chính/Gọi nếu có trước thao tác đổi trạng thái; không bị timeline đẩy xuống. Không contact thì thông báo + đường tiếp theo thay button giả |
| Alerts/health/people/devices/tasks | Filter/action chính tương ứng: mở row đầu hoặc empty CTA; Lịch sử đo; Thêm người; Gắn thiết bị khi empty; Tạo việc nếu owner |
| Settings/admin/Studio | Action đầu của tác vụ đang chọn: Lưu tên; Lọc; Xem trước; Tạo view/Lưu bản nháp. Với form dài, action gắn phần đang làm có thể phải cuộn, nhưng phải đến được và không bị fixed bars che |

Không hứa mọi cảnh báo kèm tên siêu dài/error banner đều vừa 740px. Với tên dài, chữ lớn, nhiều notice ưu tiên đúng nội dung/action khẩn rồi scroll tự nhiên; ghi số đo thực. Không cắt lỗi/quyền/dòng an toàn hoặc thu nhỏ chữ để đạt phép đo. Expanded validation/error phải đưa focus lỗi vào vùng nhìn thấy, không ép submit giữ fold bằng che thông báo.

### 6.4. Hình học, focus và semantics

- `document.documentElement.scrollWidth <= clientWidth` (sai số tối đa 1px do làm tròn), kiểm cả body; xác định phần tử gây tràn. Chart/table/JSON được cuộn cục bộ với label và keyboard; không dùng `overflow-x:hidden` trên body để làm test xanh.
- Mọi nút/link hành động đứng riêng, brand/header/account/secondary auth link/select/disclosure summary ≥44×44 CSS px, khoảng target không chồng. Link trong văn xuôi không cần phình paragraph nhưng link điều hướng độc lập phải có hit area; không kết luận mọi link 20px tự vi phạm WCAG từ task criterion.
- Một H1/main; H2/H3 đúng cây, labels và accessible names rõ, trạng thái icon+chữ, chart có dữ liệu thay thế. Không hidden duplicate mobile/desktop controls nhận focus; chỉ một context/account trigger đang active tại breakpoint.
- Tab/Shift+Tab/Enter/Space, Escape/outside/menu Arrow/Home/End nếu giữ menu/tabs APG; focus-visible đủ tương phản, không bị nav che, đóng confirm/menu trả đúng trigger. Skip link đến main, PUSH route đổi focus hợp lý, POP/hash không reset scroll tùy tiện.
- Submit field error focus field đầu và nối message bằng describedby; lỗi server focus summary gần action, dữ liệu input không mất. Pending không tạo duplicate mutation, success/409/permission không bị announce lặp do polling. Reduced-motion thực sự không slide/pulse.
- Đo contrast computed trên trạng thái thường/hover/focus/error/disabled/nav, không chỉ tin palette tính sẵn. Kiểm Vietnamese dấu không bị cắt bởi line-height, tên/URL/email/serial/JSON dài không làm nổ cột.

### 6.5. Quyền và dữ liệu sống

- Owner/caregiver/admin matrix ở §5.2: kiểm UI **và request có/không gửi**, không chỉ nút ẩn. Thiếu số đo không thấy HR/steps/history/CSV/AI/Studio data cũ; vẫn nhận/xem cảnh báo nếu quyền cho phép.
- Offline device khác mất mạng browser/SSE và khác data stale; kiểm lastSeen vs lastMeasured/asOf/policy, không thay bằng client đoán. Không-alert thành công không phải “sức khỏe bình thường”. Không Web Push/auto-call claim.
- A→B late request + revoke + tab hidden/reconnect như §5.2; memory/cache ngoài `['subjects',id]` (Studio/tasks/notifications/alert detail) phải được kiểm đúng scope, không purge bừa toàn app khiến account/admin mất form.
- CAS/revision/digest mutation có cạnh tranh: server state là nguồn, UI báo conflict, không tự retry với version mới. AI fail không ngăn alert query/action; contacts fail không làm cả detail trắng.

## 7. Lệnh kiểm và quy tắc báo bằng chứng

Chạy tuần tự, bắt đầu typecheck rồi suite nhỏ. Dưới đây là **lệnh đề nghị**, không phải kết quả đã chạy trong phiên thiết kế. Dependency chưa có thì cài đúng lock theo quyền được cấp, không dùng package toàn máy; không seed DB chia sẻ.

```text
pnpm --filter @annhien/web typecheck
pnpm --filter @annhien/web exec vitest run <file-test-thuoc-lane>
pnpm --filter @annhien/web test
pnpm --filter @annhien/web build
pnpm --filter @annhien/web exec playwright test --workers=1
python tools/docs/build.py
python tools/docs/build.py --check
```

Các dòng `vitest`/`test` ở trên là mẫu chọn suite; khi thực thi Q/F đọc `vitest --help` đúng `5.1.0` rồi **chạy tuần tự file** bằng flags được phiên bản đó hỗ trợ (dự kiến `--no-file-parallelism --maxWorkers=1`), không mặc định chạy nguyên script nhiều worker. Không chạy nhiều bộ test/build/seed tranh tài nguyên. Q cấu hình E2E sang build/preview URL đúng nhánh theo §6, **không** chạy mù config hiện tại (`localhost:5173`, reuseExisting, fullyParallel). Có thể dùng E2E mock trước; luồng API thật phải riêng biệt và có quyền ghi.

Khi cần contracts/example: `pnpm build:contracts` → `node tools/docs/check-examples.mjs`; API test chỉ mở khi diff/auth/query/security boundary thật đòi hỏi hoặc cổng cuối yêu cầu. Không ép chạy full API chỉ cho thay CSS/tài liệu và không kế thừa con số README cũ làm pass mới.

Mỗi handoff lane/gate ghi: SHA, files, thay đổi hành vi/presentation, test command + exit code + thời điểm + môi trường/fixture, ảnh/metrics thật, test diff thay gì/vì sao, phần chưa kiểm và finding còn mở. Chỉ báo **đã kiểm** khi có output và artifact đúng build; “spec đã viết” khác “UI đã làm” khác “review đã qua” khác “người dùng chấp nhận”.

## 8. Rollout và phục hồi

- Tất cả thay đổi ở nhánh/worktree riêng, lead tích hợp sau gate; không overwrite backend/data/tests để “làm sạch”. Không release master từng nửa shell trong khi routes vẫn phụ thuộc CSS cũ.
- Nếu lane fail, giữ nhánh tích hợp trước commit đó, sửa đúng owner; không xóa hợp đồng/hành vi test để ship. Nếu rollback presentation, rollback code/build đồng bộ imports và components, không trộn tokens cũ với feature mới.
- Không có migration DB trong kế hoạch này; rollback UI **không** hoàn tác ack/close/claim/revoke/publish đã thực hiện trong môi trường QA. Seed/reset chỉ ở DB riêng đã được phép, không lấy rollback branch làm lý do đụng dữ liệu chia sẻ.
- Chỉ retire compatibility aliases/old components khi call-site audit + build + browser state matrix chứng minh không dùng. Không xóa test nghiệp vụ cùng component cũ nếu hành vi vẫn còn ở vị trí mới.
