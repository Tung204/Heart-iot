# v7 — đặc tả presentation layer

**Ngày:** 15/11/2026 · **Tác giả:** Pi / dola / gpt-6.1-sol · **Baseline khảo sát:** `bc10ae60d5cc443a8e4070da63b5e6be0e4a8127`.

**Trạng thái:** thiết kế để triển khai và phản biện, chưa phải UI đã làm, kết quả kiểm browser hay nghiệm thu của người dùng. Mandate mới yêu cầu thay trực tiếp trên nhánh, không có vòng hỏi chọn phương án/duyệt preview riêng; vẫn phải tự kiểm hình ảnh và có reviewer độc lập trước hợp nhất. Không ghi Obsidian trong tác vụ này.

Nguồn ưu tiên: mandate tại `C:/MyFolder/Hoc_Tap/project/DATN/reports/orchestration/v7-specs/mandate.md` → chức năng/contracts/source ở baseline → [docs/06](../../../docs/06-trai-nghiem-va-man-hinh.md), [07](../../../docs/07-tro-ly-ai.md), [11](../../../docs/11-nen-tang-ai-va-cau-hinh-dong.md), [12](../../../docs/12-nguyen-tac-phat-trien-va-bang-chung.md), [14](../../../docs/14-ke-hoach-trien-khai-phan-mem.md) để đối chiếu lịch sử. README web còn mô tả nav 5 mục/Thêm; router và shell hiện có 4 mục, không lấy mô tả cũ làm yêu cầu. Kế hoạch chia file, migration và phép kiểm nằm trong [implementation-plan.md](implementation-plan.md).

## 1. Quyết định thiết kế duy nhất

**Hướng chọn: nền trắng lạnh, điều hướng xanh mực, hành động cobalt, nội dung dạng hàng và vùng công việc.** Đây là mô tả thiết kế nội bộ, không phải tên thương hiệu. Nhãn sản phẩm vẫn là **Theo dõi sức khỏe**.

- Một họ sans tiếng Việt cho toàn bộ heading, thân bài, form và chỉ số; không Newsreader/serif, nền giấy, bóng thẻ hay hero vòng nhịp tim cũ.
- Desktop có rail xanh mực hẹp; vùng làm việc trắng/xám lạnh, trang bám trên thay vì căn giữa như poster. Mobile dùng header gọn và thanh dưới bốn mục.
- Dùng **trật tự tác vụ**, typography và khoảng cách để nhóm nội dung. Không bọc mỗi đoạn/mỗi chỉ số trong một card. Bảng/hàng dữ liệu chia cột bằng lưới; đường phân cách chỉ ở ranh giới bản ghi hoặc nhóm thực sự.
- Cobalt chỉ hành động/điều hướng/AI; đỏ dành cảnh báo cần xử lý và thao tác phá hủy; amber dành dữ liệu cũ/chưa rõ. Không dùng xanh lá để ngụ ý sức khỏe an toàn.
- AI có tiêu đề nhìn thấy **Hỏi trợ lý AI**, ô hỏi và gợi ý trong màn đầu Hôm nay; không trốn trong avatar, cũng không đưa bản tổng quan số liệu lên Hôm nay.

**Khác bản bị bác:** thay cả cấu trúc JSX/primitive/nguồn CSS, hệ chữ, nền, rail, hierarchy và cách tổ chức từng route; không phải đổi vài màu rồi giữ lưới card kem. Chọn hướng này để đọc tên người, thời điểm và hành động nhanh, đồng thời dùng được cho bảng quản trị mà không sinh một hệ UI thứ hai. Đây là lập luận thiết kế, chưa phải bằng chứng khả dụng với người cao tuổi thật.

## 2. Tokens có giá trị thực hiện

### 2.1. Màu và ý nghĩa

| Token mới | Giá trị | Dùng |
| --- | --- | --- |
| `--bg-app` | `#F4F7FB` | Nền ngoài vùng làm việc |
| `--bg-surface` | `#FFFFFF` | Nội dung, form, bảng |
| `--bg-subtle` | `#EDF2F8` | Header bảng, vùng phụ; không phủ mọi section |
| `--text-primary` | `#18263D` | Heading, nhãn, dữ liệu |
| `--text-secondary` | `#526176` | Mô tả, thời gian, đơn vị |
| `--text-disabled` | `#64748B` | Nhãn disabled; vẫn có giải thích lý do |
| `--border-subtle` | `#D5DEEA` | Phân nhóm/bản ghi, không dùng làm viền input duy nhất |
| `--border-control` | `#7A8AA1` | Viền input/control chưa focus |
| `--action` | `#174BC5` | Nút chính, link, đường chart nhịp tim |
| `--action-hover` | `#123B9D` | Hover có pointer |
| `--action-soft` | `#EAF0FF` | Mục đang chọn, câu hỏi của user |
| `--nav-bg` | `#15253E` | Rail desktop |
| `--nav-text` | `#FFFFFF` | Chữ trên rail |
| `--nav-active` | `#284976` | Nền mục active; kèm vạch 3px và `aria-current` |
| `--danger` / `--danger-soft` | `#B42318` / `#FEF3F2` | Cảnh báo mở, lỗi, phá hủy; có icon/chữ |
| `--warning` / `--warning-soft` | `#835100` / `#FFF7E6` | Stale, offline, chưa xác định, conflict |
| `--success` / `--success-soft` | `#166246` / `#ECF8F1` | Thao tác thành công/kết nối đã xác nhận; không kết luận y khoa |
| `--focus` | `#174BC5` | Outline 3px + offset 3px trên sáng; trên rail dùng trắng |

Tính WCAG relative luminance từ các cặp hex trong phiên thiết kế: chữ chính/trắng **15,18:1**, phụ/nền app **5,87:1**, action/trắng **7,37:1**, danger/nền danger **6,05:1**, warning/nền warning **6,27:1**, success/nền success **6,71:1**, chữ trắng/rail **15,37:1**. Đây là tính toán token, **không phải audit giao diện đã render**; cần đo lại màu computed, focus, disabled và các trạng thái thật.

### 2.2. Chữ

Giữ dependency sẵn có `@fontsource/be-vietnam-pro@5.3.0`; self-host WOFF2 vietnamese + latin, weight 400/500/600/700 như source font hiện có. **Một family mới cho toàn bộ vai trò:** `--font-ui: 'Be Vietnam Pro', 'Segoe UI', system-ui, sans-serif`. `--font-display` trong thời gian migration trỏ cùng family; bỏ khai báo/nạp Newsreader khỏi stylesheet, không cần đổi manifest/lock chỉ để bỏ sử dụng.

| Vai trò | Cỡ / line-height / weight | Quy tắc |
| --- | --- | --- |
| Body | `1rem / 1.55 / 400` | Root mặc định 16px, chữ lớn 20px; giữ key `an:text-size` |
| Secondary, label phụ | `.875rem / 1.5 / 400–500` | 14px mặc định; không dùng cho chỉ dẫn lỗi quan trọng |
| Form label, button | `1rem / 1.4 / 600` | Không uppercase/letter-spacing trang trí |
| H1 sản phẩm desktop | `2rem / 1.25 / 700` | 32px; mobile `1.5rem / 1.3 / 700` |
| H2 | `1.25rem / 1.4 / 600` | 20px; không nối H1 → H3 |
| H3/tiêu đề hàng | `1.0625rem / 1.4 / 600` | 17px; chỉ dùng khi có section cha |
| Giá trị đo chính | `2rem / 1.2 / 600` | Đơn vị `1rem`, `tabular-nums`; không to như poster |
| H1 landing | `2.5rem / 1.15 / 700` desktop; `1.75rem / 1.25` mobile | Không quá 3 dòng ở 360px; copy ngắn trước khi giảm chữ |
| Mã kỹ thuật | `ui-monospace, Consolas, monospace` | Chỉ serial, digest, request ID, JSON; không biến dữ liệu thường thành code |

Độ dài nội dung đọc tối đa `68ch`; hội thoại `64ch`; form desktop tối đa `32rem`. Body/heading không có fixed-height hay clamp cắt nội dung. Đổi chữ lớn phải nở control và xuống dòng, không scale transform. Không mặc định giảm font để ép test viewport.

### 2.3. Khoảng cách, kích thước và bề mặt

- Scale: `4, 8, 12, 16, 24, 32, 48` px tương ứng `.25, .5, .75, 1, 1.5, 2, 3rem`. Control dùng `min-height`, không khóa height của chữ.
- Radius control `6px`, vùng tác vụ độc lập `10px`, chip trạng thái `4px`; chỉ avatar tròn. Không pill mọi nút.
- Không shadow trên nội dung thường. Popup/menu: `0 8px 28px rgb(24 38 61 / .16)`; nền modal chỉ khi thật sự cần, không thêm modal cho mọi form.
- Nút thường cao tối thiểu `3rem` (48px mặc định), nút compact/header/link hành động độc lập **ít nhất 44×44 CSS px**, padding ngang `1rem`. `sm` vẫn ≥44px; không 32px vì là admin.
- Input/select tối thiểu `3rem`, textarea 2 dòng trừ composer 1–3 dòng tự nở; checkbox 20px trong label có vùng chạm ≥44px. Khoảng giữa các target độc lập ≥8px khi có thể.
- Row danh sách padding block `1rem`; bảng desktop cell `12px 16px`, min-height hàng tương tác 52px. Admin dùng font 14–16px, không giảm target.
- Thứ tự z-index: nội dung 0, header 20, bottom-nav 30, popup 50, skip-link 100. Focus không bị clipping do overflow hidden.
- Motion: đổi nền/opacity 120ms; không slide cả route, hover lift, xoay hero, pulse trạng thái hay shimmer dài. `prefers-reduced-motion: reduce` tắt animation/transition, loader vẫn có chữ.

## 3. Shell, điều hướng và responsive

### 3.1. Desktop và mobile

- **≥1024px:** rail 216px (`13.5rem` mặc định), cố định trái; brand hai dòng ngắn trong target ≥44px; bốn mục chính ở trên, avatar tài khoản dưới. Nội dung còn lại có top utility line, padding 32px; max-width 1120px, canh trái trong khung. Hôm nay max-width 800px, không có cột dashboard phụ.
- **768–1023px:** không rail; header + bottom-nav như mobile, nội dung max 920px, padding 24px. Hai cột chỉ khi mỗi cột còn ≥280px.
- **<768px:** header min-height 56px, brand sans 16px và avatar 44px; content padding 16px (360px có thể 12px). Bottom-nav bốn cột bằng nhau, min-height 64px + `env(safe-area-inset-bottom)`, icon 22px, nhãn 14px và tăng theo chữ lớn. Không icon-only nav.
- Main có bottom padding = chiều cao nav thực + 16px, scroll padding/margin cho focus. Không hai vùng cuộn dọc độc lập. Bảng/chart/JSON có cuộn ngang **cục bộ**, nhãn vùng và focus; trang không được tràn ngang.
- Ở chữ lớn desktop, rail được tăng đủ nhãn hoặc chuyển shell gọn nếu vùng nội dung không đủ; không co nav để giữ số cột. Ở mobile, action row wrap hoặc thành full-width. Không `white-space: nowrap` trên tên người/status.

### 3.2. Bốn mục chính và đường tìm mọi khả năng

| Mục/điểm vào | Đích và quy tắc |
| --- | --- |
| **Hôm nay** | `/app`; `/app/assistant` vẫn mở cùng màn và cùng trạng thái active nav |
| **Cảnh báo** | `/app/alerts`, chi tiết `/app/alerts/:id`; page có link **Thông báo đã nhận** → `/app/alerts?view=notifications` |
| **Sức khỏe** | `/app/overview`; **Lịch sử đo** `/app/history` active trong nhóm này |
| **Người thân** | `/app/subjects`; hàng mỗi người có **Xem sức khỏe**, **Thiết bị**, owner có **Chia sẻ và liên hệ**; đường này active cho devices/share |
| Thiết bị | `/app/devices`; mở từ hàng Người thân (chọn đúng `subjectId` trước navigate), hoặc từ lỗi kết nối/Hôm nay/Sức khỏe. Heading có action **Công việc bảo trì** → `/app/tasks` |
| Công việc | `/app/tasks`; link nhìn thấy ở header Người thân **Công việc bảo trì**, và header Thiết bị; danh sách **mọi hồ sơ có quyền**, không giả như API chỉ lọc người đang chọn |
| Chia sẻ/liên hệ | `/app/subjects/:id/share`; owner vào bằng action rõ ở hàng, có anchor `#contacts` tới liên hệ; link quản lý từ chi tiết cảnh báo khi owner. Không chôn liên hệ dưới menu tài khoản |
| Tài khoản | Avatar → tên user + **Tài khoản**, **Chữ lớn**, **Đăng xuất**; `/app/settings` cho tên user/mật khẩu/phiên. Chỉ admin thêm **Quản trị** |
| Studio trực tiếp | `/app/studio`, `/app/studio/:id`, `/app/studio/:id/data`; giữ deep link/bookmark, không thêm vào primary nav/avatar/menu người dùng. Breadcrumb trong Studio luôn có **Về Hôm nay**, và danh sách/view/data liên kết qua lại |
| Quản trị | `/app/admin`; vào từ avatar đúng role. Trong admin có các mục nghiệp vụ trực tiếp, và link **Công việc bảo trì** cho task kỹ thuật không gắn hồ sơ. Không admin quyền sức khỏe ngầm |
| URL thông báo cũ | `/app/notifications` redirect replace tới `/app/alerts?view=notifications`; không làm mất đánh dấu đã đọc hoặc hộp thông báo toàn tài khoản |

**Không có menu Thêm.** Không chuyển Thiết bị/Công việc/Studio vào một thùng công cụ. Các đường mới chỉ dùng route và dữ liệu đã có; `?view=notifications` là thay đổi UI được đề xuất để khôi phục đường tới `NotificationsPage` đang có source nhưng không được router mount ở baseline. Badge primary Cảnh báo là **cảnh báo đang mở của hồ sơ**, ghi rõ khi count có cursor (`20+`), không trộn với **thông báo chưa đọc toàn tài khoản** ở link Thông báo đã nhận. Không tự dùng 0 khi query chưa thành công hoặc thiếu quyền.

Admin không có hồ sơ giữ ngoại lệ hiện có: `/app` về `/app/admin`, điều hướng theo không gian quản trị, không bày bốn trang sức khỏe trống. Admin có care link/owner dùng nav người dùng như thường và Quản trị qua avatar. Studio vẫn trực tiếp cho tài khoản đủ quyền; không chỉ admin.

### 3.3. Tài khoản và người được đo là hai thực thể

- Avatar trên shell đại diện **user đăng nhập**; accessible name “Tài khoản của {user.displayName}”. Không lấy tên hồ sơ cho avatar/account form.
- Ngữ cảnh subject là một dòng compact **Theo dõi: {tên}** hoặc native select có label **Người được theo dõi**; một hồ sơ thì text, nhiều hồ sơ thì select ≥44px. Không card, ảnh avatar lớn, email, câu “Hồ sơ đang xem” hoặc một tiêu đề lặp.
- Dòng này dùng cùng component trên Hôm nay, Sức khỏe, Lịch sử, danh sách Cảnh báo và Thiết bị. Shell render **selected context** một lần ở đúng năm loại trang này (kể cả alias Hôm nay), trừ chế độ inbox; page bỏ dòng subject cục bộ. Với trang ghim đối tượng, page render **pinned context** bằng cùng primitive sau khi xác minh đối tượng, shell không render thêm. Một subject không mất dòng nhận diện; nhiều subject không phải về Người thân mới đổi được.
- Trang collection Người thân/Công việc/Thông báo ghi “Các hồ sơ bạn có quyền xem”/“Tất cả hồ sơ có quyền”, **không** đặt một select toàn cục khiến người xem nghĩ list đã lọc.
- Share URL `:id`, alert detail và Studio subject-scope **ghim theo đối tượng từ API/URL**, hiển thị cùng kiểu dòng nhận diện nhưng không có select tự do. Đừng hiển thị tên A trên alert của B. Muốn đổi subject ở alert detail: **Về danh sách cảnh báo** rồi chọn người; không âm thầm giữ detail cũ.
- Settings/admin/Studio list/editor không có global subject select. Studio preview/data có label riêng **Dữ liệu xem trước cho**/**Dữ liệu của**, không tự đổi đối tượng của view khi đổi nguồn preview.
- Tên dài wrap tối đa tự nhiên; ở header rất hẹp có thể ellipsis phần text hiển thị của select nhưng option phải đầy đủ, accessible name không cắt. Không dùng `title` làm cách duy nhất biết tên.

### 3.4. Cô lập state khi đổi subject — contract bắt buộc

1. Khi chọn B, tên và quyền B cập nhật cùng lần render với việc **gỡ toàn bộ UI của A**: hội thoại, câu hỏi, chart, bảng, mã gắn, xác nhận hành động, lỗi/success cục bộ. Skeleton/loading của B thay chỗ; không giữ A mờ dưới tên B.
2. Query key có subjectId + tham số; consume AbortSignal ở API đang hỗ trợ. Không `keepPreviousData` qua hai subject; có thể giữ dữ liệu cùng subject khi đổi khoảng nếu nhãn khoảng vẫn chính xác. Source `insights/useInsights.ts` đang dùng placeholder chung: phải kiểm riêng đường này.
3. State form/thread key theo identity. Khi request A về muộn, chỉ được tác động cache của A nếu còn hợp lệ, không append câu trả lời, toast, focus hoặc set form của B. Với mutation đã gửi, đổi trang **không** có nghĩa hủy tác động server; không báo “đã hủy”.
4. SSE A đóng, B mở theo quyền; response/stream cũ không invalidate/đổi trạng thái B. Thu hồi quyền gỡ dữ liệu/cache nhạy cảm cả REST, AI, CSV, Studio/notifications theo boundary hiện có; 401 dùng xử lý phiên tập trung.
5. Navigation từ hàng người thân chọn subject trước khi navigate. Deep link alert/share kiểm subject của đối tượng, không dùng selection làm quyền. Selection lưu lại chỉ có hiệu lực nếu còn trong danh sách của tài khoản hiện tại.
6. Focus sau đổi subject ở control chọn (không kéo xuống cuối thread cũ), thông báo polite “Đang xem {B}”. Không đọc to mọi lần polling.

## 4. Primitive và trạng thái dùng chung

| Pattern | Presentation và hành vi |
| --- | --- |
| `PageHeader` | Một H1, tối đa một câu ngữ cảnh hữu ích, action chính bên phải desktop/dưới H1 mobile. Breadcrumb là target 44px, không hàng chữ 20px |
| `Section` / `Surface` | Section phẳng mặc định, H2 + body. Surface chỉ cho form đang mở, khối hành động khẩn cấp, preview canvas; không bọc lồng thẻ |
| `Button` / `ButtonLink` | Primary cobalt, secondary nền trắng viền control, subtle link rõ focus, danger đỏ. Link điều hướng giữ anchor; thao tác ghi là button. Pending giữ nhãn có nghĩa, chặn submit trùng |
| `Field` | Label thật, hint ngắn trước input khi cần, lỗi ngay sau input. `aria-invalid`, `aria-describedby` nối cả hint + error nếu cùng tồn tại. Submit lỗi focus field đầu; lỗi không gắn field focus summary gần action |
| `Notice` | Icon 20px + tiêu đề ngắn + nội dung + action nếu có. Có severity bằng chữ. Không dùng role alert liên tục cho mọi banner stale; lỗi hành động/thu hồi mới cần announce khẩn |
| Status | Góc 4px, text 14px, icon khi cần: **Đang mở**, **Đang hỗ trợ**, **Đã đóng**, **Chưa xác định**, **Chưa có số đo mới**, **Ngoại tuyến**. Không chấm màu đứng một mình |
| Empty | H2 trong trang đã có H1; câu sự thật + một bước có thể làm. Không icon thư mục lớn và không 0/biểu đồ giả |
| Loading | Giữ H1/ngữ cảnh/action không phụ thuộc dữ liệu. Skeleton trung tính + câu `role=status`, `aria-busy`; không số đo placeholder. Mỗi vùng tải độc lập, không chặn cảnh báo vì chart/AI chậm |
| Error | Phân biệt validation 400/422, chưa đăng nhập 401, thiếu quyền 403, không tồn tại/không được thấy 404, CAS 409, giới hạn 429, mạng/5xx. Chỉ retry khi có thể hồi phục; giữ input và không tự gửi lại mutation |
| Freshness | Stale/offline/never khác nhau; nêu **lần đo cuối** cho stale, **lần nhận cuối** cho offline theo server/policy. Query cache stale không phải thiết bị offline. Không tô trạng thái “bình thường” từ absence of alerts |
| Permission | Không gửi query đo/AI/export đã biết bị cấm; nói quyền bị thiếu và cách liên hệ chủ hồ sơ. Cảnh báo vẫn chạy nếu có quyền cảnh báo. 403 không thành empty/no alerts, admin không tự có care permission |
| Conflict | Đặt notice cạnh thao tác: “Dữ liệu đã thay đổi”, ai hỗ trợ nếu response cho biết; tải lại bản hiện hành, không tự retry POST bằng revision mới |
| Menu/disclosure | Chỉ account là menu toàn cục; Escape/outside/Tab-out đóng, focus trả trigger phù hợp. Thao tác nguy hiểm tại đúng bản ghi có xác nhận inline, tên đối tượng và Hủy; không confirm trình duyệt |

Icon: dùng SVG nội bộ 24×24, stroke 1.8, round caps; không thêm thư viện. Bộ tên: home, alert-triangle, activity, users, chevron, arrow-left, phone, device, clipboard, settings, shield, message, clock, check, close. Nút icon phải có accessible name; decorative SVG `aria-hidden`. Không emoji thay trạng thái/chẩn đoán, không icon mơ hồ không nhãn.

## 5. Nội dung và cấu trúc từng nhóm route

Áp dụng toàn bộ matrix trạng thái §4 cho từng route; các mục dưới chỉ rõ thứ tự và ngoại lệ. Không thêm endpoint mới để đạt bố cục.

### 5.1. Công khai `/`

**Nhiệm vụ:** hiểu sản phẩm làm gì và vào ứng dụng; không chứng nhận an toàn/y khoa.

- H1: **Theo dõi sức khỏe người thân**. Một câu: “Xem dữ liệu thiết bị, xử lý cảnh báo và hỏi trợ lý AI.” Không “vẫn an tâm” như cam kết.
- Desktop: nền trắng, vùng hero 7/5 cột. Cột trái H1 → một câu → CTA **Tạo tài khoản**, secondary **Đăng nhập** (hoặc **Mở ứng dụng** khi đã xác nhận user) → dòng giới hạn đầy đủ. Cột phải là sơ đồ chữ/vector **Thiết bị → Cảnh báo / Dữ liệu → Người hỗ trợ / Trợ lý AI**, không screenshot fake/card/số giả/ảnh stock.
- Dưới hero là ba **hàng thông tin** Theo dõi / Cảnh báo / Trợ lý AI với icon nhỏ và một câu mỗi hàng, không ba card giống v6. Footer một dòng, không lặp toàn bộ disclaimer nhiều nơi.
- Mobile: cột CTA trước, sơ đồ nằm dưới và không cạnh tranh màn đầu. Giữ đủ bốn ý trong dòng giới hạn: dữ liệu mô phỏng; chỉ cập nhật khi web kết nối; không tự gọi cấp cứu; không thay thế cấp cứu. Copy được rút gọn có nghĩa nhưng không ẩn bằng CSS.
- `/me` loading không hiện nhầm CTA khách; lỗi phiên không suy ra logout, giữ đường vào và Thử lại. Không số liệu thật/credentials/tài khoản tự điền.

### 5.2. Đăng nhập, đăng ký `/login`, `/register`

**Nhiệm vụ:** hoàn thành form; H1 **Đăng nhập** / **Tạo tài khoản**.

- Bỏ thẻ nổi giữa nền kem. Desktop là cột form trắng canh trên (max 448–512px) + dải phụ nền xanh nhạt chiếm tối đa 40%, chỉ một câu về quyền và cảnh báo; mobile bỏ dải phụ, không bỏ hướng dẫn field. Đăng ký mobile không cần intro riêng: H1 và label đã đủ nghĩa.
- Header brand 44px → H1 → lỗi form nếu có → field theo thứ tự hiện có → submit → link đổi chế độ dạng hàng target 44px → dòng nguồn/giới hạn ngắn.
- Đăng ký giữ đủ tên tài khoản/email/mật khẩu/nhập lại, autocomplete, validation từ contract, focus first error. Nhãn **Tên của bạn** để không bị hiểu là tạo người được đo. Không thêm quên mật khẩu, social login hay checkbox pháp lý không có nền nghiệp vụ.
- Form đăng ký compact: khoảng field 8px ở mobile, label/input gap 4px, hint mật khẩu một dòng, H1-to-form 8px; header mobile 44px + padding block 4px. Với chữ lớn, control có thể dùng `max(44px, 2.4rem)` tại form auth compact (48px khi root 20px), vẫn chữ 20px/line-height 1.4, không hạ target/chữ. Submit phải trong màn đầu 360×740 chữ lớn ở trạng thái pristine như regression hiện có; link đổi chế độ/dòng note sau submit được cuộn tự nhiên nếu cần.
- Giữ `next` an toàn xuyên login/register/invite; input và field errors không mất khi lỗi mạng. 401 sai thông tin khác lỗi server, pending không gửi hai lần.

### 5.3. Lời mời `/invite/:token`

**Nhiệm vụ:** hiểu ai mời, theo dõi ai và quyền nào trước khi chấp nhận. Cùng typography/auth frame mới nhưng **không** biến thành bản sao login.

- H1 **Lời mời theo dõi** → tên người mời/tên người được đo → quyền thành danh sách label/value (số đo & khoảng lịch sử, cảnh báo, hỗ trợ, đóng, AI) → hết hạn → action **Đăng nhập để tiếp tục** hoặc **Đồng ý tham gia** → kết quả.
- Nếu không chia sẻ số đo, ghi “Không được xem số đo và lịch sử”; không vẫn khẳng định xem N ngày chỉ vì field historyDays tồn tại. Không lộ email người nhận, token thô, số đo hoặc contacts trong preview công khai.
- Loading giữ H1 và “Đang kiểm tra lời mời”; lỗi **400/422 token sai định dạng** và **404 hết hạn/không tồn tại/đã dùng** có thông báo link không hợp lệ + kiểm tra/xin gửi lại + Về trang chủ, không retry lỗi validation cố định. Mạng/5xx có Thử lại; 401 `/me` là khách bình thường.
- Thành công “Đã tham gia” + **Mở ứng dụng**, không tự nhận đã bật push. Chấp nhận bị từ chối giữ ngữ cảnh và giải thích đúng response. Quyền nhiều dòng được scroll tự nhiên; action không fixed che danh sách quyền.

### 5.4. Hôm nay `/app`, alias `/app/assistant`

**Nhiệm vụ:** biết điều cần làm ngay và hỏi về dữ liệu; **không** overview thứ hai.

Thứ tự DOM/visual: compact subject context → H1 **Hôm nay** → một vùng tín hiệu ưu tiên → **Hỏi trợ lý AI** + composer → ba gợi ý → thread nếu đã hỏi → link Sức khỏe + giới hạn.

- Vùng tín hiệu dạng dải trái đỏ/amber khi cần, không card thường xuyên. Ưu tiên cảnh báo mở + **Gọi {tên liên hệ}** (tel, nếu được phép/có contact) / **Xem cảnh báo**; tiếp theo offline/stale/never; cuối cùng câu trung tính “Chưa có cảnh báo đang mở · kiểm tra lúc …” chỉ sau query cảnh báo thành công có quyền.
- Không có contact thì không có Gọi giả; giữ Xem cảnh báo, owner có đường cấu hình liên hệ ở detail. Không phải chờ contacts hoặc AI mới hiện cảnh báo/action.
- Nếu cảnh báo mở đồng thời thiết bị offline: giữ hành động cảnh báo trước, thêm một dòng offline. Không để lỗi AI/summary che cảnh báo. Khi chỉ có quyền nhận cảnh báo, vùng này vẫn hoạt động; composer có explanation quyền riêng.
- Composer có label nhìn thấy **Câu hỏi về {tên}** hoặc label Câu hỏi dưới heading đã có context; textarea + nút **Gửi** cùng hàng khi đủ, không floating/sticky. Ba gợi ý nhãn **Nhịp tim tuần này**, **Cảnh báo đang mở**, **Pin thiết bị**; bấm điền câu hỏi, không tự gửi; wrap, không mask/cuộn giấu gợi ý.
- Không tự gọi summary API để lấp khoảng trống. Không metrics/BPM/pin/coverage/trend khi chưa hỏi. Nguồn/chất lượng xuất hiện **trong câu trả lời**, không biến thành bản tin mặc định.
- Câu hỏi user nền action-soft, câu trả lời nền trắng và đường căn trái; không bong bóng bo tròn lớn. Response hiện provider **AI** hoặc **Tóm tắt theo mẫu**, khoảng dùng/coverage/gaps/nguồn mô phỏng theo response, nguồn số liệu và disclaimer. Có thể gập phần chi tiết nguồn, nhưng giới hạn dữ liệu quan trọng phải thấy mà không mở.
- Loading/từ chối/429/fallback có text; giữ câu hỏi khi lỗi. Empty không hồ sơ: H1 + bước **Thêm người** vào Người thân; không empty chat ảo. Không quyền AI/số đo không query AI và không mời retry; không quyền cảnh báo không nói “không có cảnh báo”.
- Mobile/chữ lớn: **hành động cảnh báo và composer/Gửi** ở phần trên bottom-nav trước khi cuộn với fixture tiêu chuẩn (một subject, một cảnh báo, tên bình thường). Gợi ý/thread/chi tiết nguồn có thể ở dưới fold; không ép mọi thông tin vào 740px bằng chữ nhỏ.

### 5.5. Danh sách Cảnh báo `/app/alerts`

**Nhiệm vụ:** xử lý cảnh báo của đúng người; H1 **Cảnh báo**.

- Subject context → H1 + link **Thông báo đã nhận** (nếu có unread count thì label rõ) → nhóm lọc **Đang mở / Đã đóng** → list → tải thêm → giới hạn kênh trong ứng dụng.
- Row desktop: loại + trạng thái + thời điểm, người đang hỗ trợ, action **Xem chi tiết** và **Tôi đang hỗ trợ** nếu quyền/trạng thái cho phép. Mobile xếp title/status → thời gian/người hỗ trợ → actions, không card đổ bóng.
- Xác nhận nhanh giữ bước hỏi lại trước POST. Ack/resolve theo expectedVersion; 409 cập nhật người hỗ trợ/trạng thái và mời tải lại, không optimistic báo thành công.
- Đã đóng gồm **Chưa xác định** đúng lifecycle, không coi là đã an toàn. Nhận trễ ghi rõ. Empty “Không có cảnh báo đang mở” chỉ khi đã nhận list thành công; không minh họa check xanh “Tất cả an toàn”.
- Loading/error list cục bộ, tab và subject vẫn rõ. Không quyền cảnh báo: giải thích, không tải list biết chắc bị cấm. Stale query/SSE hỏng giữ danh sách cùng timestamp, không xóa cảnh báo cũ.

**Thông báo đã nhận** `?view=notifications`: H1 vẫn Cảnh báo, H2 **Thông báo đã nhận**, scope **tất cả hồ sơ có quyền**. Dùng lại khả năng fetch/mark-read/rollback của `NotificationsPage`, chỉ bỏ page header lặp. Hàng có tên subject, loại, giờ nhận, đã/chưa đọc, **Xem cảnh báo**, **Đánh dấu đã đọc**. Có **Về cảnh báo của {người}**. Đây không phải tab Đã đóng và đánh dấu đọc không ack/resolve. Banner toàn tài khoản mở **đúng incident** hoặc đúng chế độ thông báo; không đưa về list của subject A khi banner nói B.

### 5.6. Chi tiết `/app/alerts/:id`

**Nhiệm vụ:** liên hệ và phối hợp xử lý, sau đó ghi kết quả. Ghim context theo `detail.subjectId`; H1 là nhãn loại sự kiện từ contract, trạng thái ở hàng phụ không nhét vào heading.

- Breadcrumb → subject/loại/thời điểm ngắn → cảnh báo nhận trễ/bắt đầu trước chia sẻ nếu có → **liên hệ chính + Gọi** → người hỗ trợ/action **Tôi đang hỗ trợ**, **Đóng cảnh báo** → timeline → người nhận/hành động.
- Desktop có thể đặt liên hệ + thao tác trong cột phải 320px, nhưng DOM giữ gọi trước thao tác đổi trạng thái; mobile một cột. Không sticky hai thanh đè bottom-nav; target Gọi trong viewport đầu khi cảnh báo đang mở tiêu chuẩn.
- Form đóng inline bên dưới nút, giữ outcome/lý do/validation; focus field đầu khi mở, Hủy trả focus; không auto-close khi mutation fail. Sau đóng thành công ưu tiên **kết quả/trạng thái đã kết thúc** trước contacts. Không kêu Gọi khẩn cấp cho incident đã đóng/hủy.
- Timeline phân biệt giờ xảy ra/giờ nhận/skipped event khi API có; không sáng tác timestamp. Với startedBeforeShare không đưa lại dữ liệu lịch sử bị cắt. 404 dùng cách nói không tồn tại/không có quyền, không rò đối tượng. 403/action quyền thiếu có giải thích, contact lỗi không chặn ack và ngược lại.

### 5.7. Sức khỏe `/app/overview`, xu hướng và Lịch sử `/app/history`

**Sức khỏe:** đọc/đối chiếu dữ liệu, không hàng loạt KPI card.

- Compact subject → H1 **Sức khỏe** + action **Lịch sử đo** → cảnh báo mở **nếu có/đang tải/lỗi** (vùng độc lập, có thể giữ dòng trung tính khi empty) → khối dữ liệu ngày → xu hướng 7/14/30 → kết nối thiết bị và link quản lý.
- Dữ liệu ngày là một `dl` ba cột desktop: nhịp tim trung bình (min–max và mẫu hợp lệ ở dòng phụ), bước (completeness), pin (null = chưa biết). Mobile xếp các hàng label/value, không ba card. Chỉ hiển thị zero khi API thực sự biết giá trị và mức đầy đủ; chưa có đo không lấy default 0.
- Gắn ngày theo timezone hồ sơ, nguồn mô phỏng, thời điểm và câu về độ phủ/khoảng thiếu ngay với khối số liệu. Xu hướng là vùng chart+bảng/summary, label đơn vị rõ, missing day là khoảng thiếu/“—”, không cột 0. Chọn 7/14/30 là segmented `role=group + aria-pressed` nếu không triển khai semantics tabs đủ.
- Desktop dữ liệu chính 2/3, thiết bị 1/3 nếu đủ chỗ; mobile ưu tiên dữ liệu+coverage trước thiết bị. Vùng chart/cuộn không đẩy width trang. Loading/error từng vùng, cảnh báo không đợi summary/insights.
- Không quyền số đo: không query/render số đo, insights hoặc link CSV; một vùng quyền rõ + cảnh báo độc lập nếu có quyền. Stale/offline hiện cạnh thời điểm, không đổi nhãn “Trực tuyến” thành nghĩa dữ liệu mới.

**Lịch sử:** H1 **Lịch sử đo**, breadcrumb Sức khỏe, subject context → khoảng 24h/7d/30d (theo historyDays/sharedFrom) → **Cập nhật khoảng**, **Tải CSV** nếu đủ quyền → chart + gap legend → bảng/lists → một nút tải/hiện thêm.

- Giữ window snapshot ổn định, không refetch toàn bộ mỗi phút/đổi nhãn thời gian. Giữ giới hạn render hiện có: initial 10, tăng 50, trần 400, CSV là đường đầy đủ; đây là tham số UI/performance, không số đo demo.
- Desktop bảng semantic, mobile chỉ render một danh sách bản ghi label/value thay bảng, không hai cây DOM cùng chạy. SVG được đổi màu/nét/axis presentation, giữ downsampling/timestamp/quality và phương án dữ liệu thay thế.
- Thiếu dữ liệu/tín hiệu kém/không đeo/unsynced/quarantine có lời giải thích đúng response; không vẽ BPM không hợp lệ. Tắt range không cho phép kèm lý do bằng chữ, không chỉ tooltip. CSV giữ `from/to` đã clamp; không thêm export giả.

### 5.8. Người thân `/app/subjects`, form và dữ liệu nhạy cảm

**Nhiệm vụ:** tìm người đúng và vào công việc đúng. H1 **Người thân**; đây là danh sách **hồ sơ người được theo dõi**, không danh sách account đăng nhập.

- H1 + primary **Thêm người** → link ngữ cảnh **Công việc bảo trì** → danh sách người có tên + vai trò/quyền ngắn → actions **Xem sức khỏe**, **Thiết bị**, owner **Chia sẻ và liên hệ** → owner disclosure **Quản lý hồ sơ** cho sửa/lưu trữ/yêu cầu xóa.
- Desktop danh sách hàng trắng, cột tên/vai trò/hành động; mobile tên và quyền trên, action grid wrap dưới. Không thêm số cảnh báo nếu không có nguồn trả đúng, không fetch N hồ sơ chỉ để trang trí badge.
- Form thêm/sửa inline có surface xanh rất nhạt, tên + timezone, Lưu/Hủy; nhãn **Tên người được theo dõi**, không ghi “Sửa tên” khi còn có thể đổi timezone. Không thêm field quan hệ/ngày sinh chưa có contract.
- Archive/deletion nằm trong disclosure ở cuối đúng hàng, không ngang hàng nút thường. Form có tên đối tượng, lý do, xác nhận tên, warning về tác động và Hủy. Archive = lưu trữ + thu hồi chia sẻ, **không xóa**; deletion = đã ghi nhận, **chưa xóa dữ liệu**. Success không biến thành toast biến mất trước khi đọc.
- Empty giữ Thêm người và hướng dẫn người nhận lời mời kiểm link; loading/error chỉ list, heading/action còn rõ. Caregiver không thấy owner actions, nhưng vẫn có đường xem thiết bị theo quyền.

### 5.9. Chia sẻ và liên hệ `/app/subjects/:id/share`

H1 **Chia sẻ và liên hệ** + compact context ghim theo URL. Thứ tự: link/anchor **Chia sẻ quyền / Liên hệ khẩn cấp** → người đang có quyền + action **Mời người thân** → form mời khi mở → lời mời đã gửi → contacts. Không tabs giấu contacts không có đường thẳng; `#contacts` phải scroll/focus đúng heading.

- Form mời giữ email, tất cả permission flags, historyDays, expiresInHours từ contract; nhóm “Số đo và AI” riêng “Cảnh báo và hỗ trợ”, không preset quyền giả. Tắt số đo thì historyDays disabled và `canViewAi=false` theo logic hiện có; các quyền nhận/ack/resolve vẫn phân biệt.
- Token/acceptUrl chỉ hiện một lần sau tạo, bẻ dòng/copy đúng text, không log/đưa vào title; không hứa email đã được gửi khi API chỉ tạo link. Thu hồi có xác nhận đúng người và cảnh báo quyền mất ngay/CSV đã tải không thu hồi được.
- Contacts: tối đa theo constant hiện có (5), chọn chính, thêm/sửa/xóa xác nhận, `tel:` hợp lệ. Contacts không cần phải có account/chia sẻ quyền. Read-only caregiver chỉ được đọc ở đường được phép, không mở owner share để vượt guard.
- Mobile hai nhóm permission một cột, action cạnh đối tượng không rời xa; success/error tại form/row tương ứng. Owner-only page không tải invitations/care links trước khi xác minh owner. Đổi URL id/reset form không mang token/liên hệ của người cũ.

### 5.10. Thiết bị `/app/devices`, Công việc `/app/tasks`

**Thiết bị:** H1 **Thiết bị**, subject context → **Công việc bảo trì** → list thiết bị → form **Gắn thiết bị** (mở sẵn khi chưa gắn, owner mới thao tác).

- Row tên/serial + freshness → lastSeen/lastMeasured đúng nghĩa → pin/nhịp tim chất lượng nếu có quyền → firmware ở chi tiết → owner **Tháo gắn** xác nhận. Không gửi phép claim/release biết trước caregiver không có quyền; metadata còn được đọc theo API nhưng không lộ số đo bị cấm.
- Chưa có thiết bị khác chưa từng kết nối; claim thành công chỉ nói **Đã gắn thiết bị**, không “đã trực tuyến”. Mã dùng một lần/hết hạn theo contract/server, không demo code điền sẵn. Form đổi subject phải reset mã/lỗi/confirm; late response không dán serial của A vào B.
- Empty có form/đường liên hệ owner theo quyền. Loading/error devices không chặn link Công việc; freshness amber không đỏ khẩn như incident khi không có sự kiện an toàn.

**Công việc:** H1 **Công việc bảo trì**, scope **Tất cả hồ sơ có quyền**; breadcrumb Người thân/Thiết bị theo điểm vào, không ghi mỗi A khi API trả cả B.

- H1 + owner **Tạo việc** → Đang mở/Đã đóng → list tên task + **tên subject**/task kỹ thuật + thiết bị + hạn/ưu tiên/status → đóng task nếu owner/admin theo logic hiện có → tải thêm.
- Tạo việc inline: chủ hồ sơ, thiết bị đang gắn, kind/title/priority/due/notes; chưa có thiết bị có **Gắn thiết bị** tới đúng subject. Không thêm scheduler, AI tự tạo việc hoặc nút bắt đầu việc chưa có API.
- Đóng có lý do, conflict tải lại, pending chống trùng, focus trả trigger. **Caregiver hiện chỉ xem** theo `canClose` trong source; câu docs cũ “caregiver đóng nếu có quyền” không tự thành quyền mới. Admin task không subject được trình bày riêng nhưng vẫn dùng API/guard hiện có.
- Mobile label/value theo hàng, form một cột; chưa có task không nói mọi thiết bị tốt; task stale/409 khác offline device.

### 5.11. Tài khoản `/app/settings`, phiên và đăng xuất

H1 **Tài khoản**, không subject context. Text rõ **Tài khoản của {user.displayName}**; thứ tự **Tên của bạn → Mật khẩu → Phiên đăng nhập**. Desktop các section có cột label hẹp/body form; mobile một cột, không ba card cùng bóng.

- Đổi tên cập nhật avatar/header; không đổi tên subject. Đổi mật khẩu giữ phiên hiện tại/thu hồi phiên khác đúng API, field/password errors gần submit, success thông báo tác động thật.
- Phiên là row thiết bị/thời điểm + **Thiết bị này** hoặc **Thu hồi**, action **Thu hồi các phiên khác** dưới list. Giữ hai bước hỏi lại, refresh/conflict/not found, pending và focus. Không biến thao tác thu hồi thành đăng xuất mọi nơi ngoài mô tả API.
- Avatar menu account/Chữ lớn/đăng xuất: giữ đồng bộ toggle và lưu lựa chọn, xác nhận logout, lỗi không mất phiên/UI nhầm. Menu nằm trong viewport, có thể scroll khi chữ lớn, không che target cần focus.

### 5.12. Quản trị `/app/admin` và query params

**Nhiệm vụ:** vận hành hệ thống, không xem sức khỏe ngầm. H1 **Quản trị**; cùng tokens nhưng density dữ liệu cao hơn, không dùng card marketing.

- Local navigation đặt tên thật **Tổng quan / Người dùng / Thiết bị / Chính sách / Nhật ký**, không “Nâng cao” thành chỗ giấu chức năng. Giữ compatibility `?tab=advanced&view=policy|audit`; có thể ánh xạ hai mục cuối vào URL cũ, không buộc đổi endpoint.
- Desktop nav local ngang dạng underline; mobile grid hai cột/ba hàng hoặc native select có label khi chữ lớn, không cắt scroll tab mất mục. Semantics chọn một cách hoàn chỉnh: giữ ARIA tabs + keyboard như hiện có nếu vẫn là tab panel; không gắn role tab vào link không xử lý keyboard.
- **Tổng quan:** ưu tiên vấn đề cần chú ý từ response → nhóm số vận hành dạng `dl`/hàng (tài khoản, thiết bị, việc, outbox…) → các link hành động đến tab/task. Không biến số liệu chưa tải thành 0 và không chỉ giữ 4 KPI rồi giấu phần còn lại.
- **Người dùng:** search/status/filter → count nếu API có → bảng tên/email/role/status/ngày/action → form khóa/mở đúng row có lý do → feedback ngoài bảng, tải thêm. Chặn tự khóa và last-admin theo logic server; không loại validation để “đơn giản UI”. Mobile chỉ một biến thể row label/value với action 44px.
- **Thiết bị:** danh sách metadata/serial/kết nối/assignment ID theo response → cấp mã → one-time secret panel → xoay khóa xác nhận. Không hiện BPM/steps, không tạo form thiết bị mới giả (baseline chỉ có API tạo, chưa có UI). Copy lỗi có feedback, rời/ẩn phải xóa secret khỏi DOM, không ghi log/storage.
- **Chính sách:** active revision → field có đơn vị/validation → **Xem trước** → diff/warnings → **Phát hành** chỉ sau preview đúng nội dung/revision/digest → history/defaults. Desktop form trái/kết quả phải, mobile kết quả ngay sau action, không dưới cả history. Sửa form làm vô hiệu preview; 409 không retry tự động.
- **Nhật ký:** action/actor/filter → bảng thời gian/người/action/đối tượng/kết quả → **Xem chi tiết** mở panel ngoài vùng cuộn → phân trang. JSON cuộn cục bộ có label; không đưa raw secrets/health vào log UI; không dùng email đầy đủ ngoài màn admin được phép.
- Role không admin: H1 + permission notice + đường về, **không chạy admin query**. Loading/error từng tab giữ context/local nav. Stale giữ timestamp và cập nhật, không xóa form chưa gửi vì polling.

### 5.13. Studio trực tiếp `/app/studio`, `/:id`, `/:id/data`

Không bỏ vì không có menu. Cùng sans/cobalt và nền lạnh; không giữ nguyên presentation hiện tại chỉ vì là công cụ nội bộ.

- **Danh sách:** breadcrumb Về Hôm nay → H1 **Studio** → action **Tạo view** → list tên/scope/nháp/công bố → **Quản lý**, **Xem bản công bố** theo quyền; form key/name/scope/subject owner giữ nguyên contract. Empty có Tạo view, không giả view mẫu đã lưu.
- **Editor:** breadcrumb Studio → H1 tên view, scope + **Bản nháp rN / Công bố rM** rõ → dải quy trình **Soạn nháp · Xem trước · Công bố** là anchor/tiến trình, không wizard giả bắt bỏ qua lịch sử → editor → preview → publish → history/rollback.
- Desktop editor trái và preview phải khoảng 45/55 khi đủ ≥1024px, lịch sử bên dưới. Mobile các vùng cùng thứ tự một cột, không canvas fixed-width. Widget edit là hàng có title/type/options, move up/down/remove 44px; JSON option có label/validation, không arbitrary JS/HTML.
- Preview luôn ghi **Chỉ xem trước — không ghi dữ liệu nghiệp vụ**, **Dữ liệu mẫu** hoặc subject có quyền. **Dữ liệu mẫu** (`sample=true`) khác **Dữ liệu mô phỏng** (nguồn telemetry tổng hợp dù đang xem publication thật). Đổi source preview không đổi scope/view target. Reset canvas/error khi subject/view thay đổi, không giữ chart A dưới nhãn B.
- Publish chỉ sau lưu và preview đúng revision/digest, chỉnh draft vô hiệu preview. Conflict hiện base/draft hiện hành, action Tải lại; rollback xác nhận và nói **tạo bản công bố mới**, không “xóa bản hiện tại”. Không giả approval người thứ hai vì chưa có workflow này.
- **Data route:** H1 tên view → bản công bố/revision/digest từ response thực đang render → nguồn dữ liệu/subject selector nếu user/global scope → widgets. Chưa publication = empty + về quản lý nếu có quyền, không lấp sample; có draft chưa công bố nói rõ publication vẫn đang chạy.
- Widget metric/chart/alerts/summary/tasks đều đổi typography/spacing/nền, dùng dữ liệu/config thực; grid span theo config, mobile một cột, bảng thay thế/chart có đơn vị/gap/no-data. Thiếu quyền dùng warning/empty theo response, không lộ cache cũ; admin không được chọn subject ngoài quyền.

### 5.14. 404, lỗi route/chunk và route chuyển tiếp

- Public `*`: H1 **Không tìm thấy trang**, địa chỉ không tồn tại/đã chuyển, **Về trang chủ**, hướng dẫn kiểm link mời đầy đủ. Layout phẳng, nhãn 404 phụ nhỏ, không reuse auth-card cũ.
- `/app/*`: giữ shell, một H1, **Về Hôm nay**; không “tổng quan” khi mặc định là Hôm nay. Chưa có subject/admin-only chọn đích an toàn theo role, không link sức khỏe 404.
- `index.html` cũng đổi theme-color, inline boot/noscript: nền `#F4F7FB`, chữ `#18263D`, skeleton tĩnh xanh xám, không shimmer/cream flash trước React. Không thêm script đoán phiên hoặc dữ liệu vào boot. `PageLoader`, `ErrorState`, `AppErrorBoundary`, ProtectedRoute, trang chưa dùng `ComingSoonPage` nếu còn được giữ đều theo primitives mới. Không lồng H1 từ ErrorState dưới page H1; component cho phép heading level/context.
- Chunk/render error không trắng shell; Tải lại trang + về khu vực hợp lệ, không tuyên bố browser vẫn nhận cảnh báo khi mất kết nối. 401 về login giữ next; network kiểm phiên không tự suy ra guest.

## 6. Những gì không được đổi trong redesign

Giữ API adapters/schema parsing, query/event logic hợp lệ, permissions, CAS/expectedVersion, sharedFrom/historyDays, dữ liệu thật từ response, 401 handling, SSE revocation/backoff, notification mark-read khác ack, tel thủ công, không auto-ack/resolve/auto-call bằng AI. Không thêm endpoint, role, ngưỡng y khoa, quyền AI thực thi hoặc kết quả demo để phục vụ bố cục.

Cấu hình view/policy vẫn qua schema/version/preview/digest đang có; các token/spacing là hằng số presentation hợp lệ, không cần tạo runtime theme engine hay backend-config cho mọi pixel. Không mở rộng proposal AI/runtime trong docs/11 thành năng lực đã có.

## 7. Căn cứ và giới hạn đã khảo sát

- Đã đọc router/main, primitives, AppShell, các trang/features, local hooks/API adapters, toàn bộ nhóm stylesheet và các vùng override cuối `layout.css`, test/E2E liên quan; đây là khảo sát source, **không** khẳng định đã render baseline hay thử hành vi runtime trong phiên này.
- Package versions từ [manifest web](../../../apps/web/package.json): React/DOM `19.3.1`, Router `7.18.5`, Query `5.107.1`, Vite `8.3.8`, Fontsource Be Vietnam Pro `5.3.0`. Không thêm dependency. Chỉ giữ APIs đã có; worker xác minh thêm docs đúng chức năng nếu cần API mới.
- [React — Preserving and resetting state](https://react.dev/learn/preserving-and-resetting-state): key theo identity reset subtree/form; **không** tự hủy tác động async. Đã đọc guide chính thức; truy vấn Context7 bản React `19.3.1` không cho hướng dẫn key đủ rõ nên không lấy compiler-internal API làm giải pháp.
- [TanStack Query v5 — Query cancellation](https://tanstack.com/query/v5/docs/framework/react/guides/query-cancellation): consume AbortSignal/cancelQueries; không coi đổi query key tự bảo đảm xóa UI/cache. Docs v5 theo dòng major, không là bằng chứng thực thi patch `5.107.1`.
- [Vite — CSS Modules](https://vite.dev/guide/features#css-modules): `.module.css` built-in; không cần CSS framework/plugin mới. Đã đối chiếu guide hiện hành cho Vite 8, không nâng Vite.
- [Fontsource — Be Vietnam Pro](https://fontsource.org/fonts/be-vietnam-pro) và license chính thức qua registry Fontsource: OFL-1.1, font self-host/weight/subset; đường WOFF2 400/500/600/700 đã có trong source `fonts.css`. Không phát sinh font CDN/stock image/licensing mới.
- Review v6 bổ sung từ lead: token ngắn 422 bị gọi lỗi mạng, target link auth/header 20–28px và hostname trả nhầm worktree. Chuyển thành acceptance bắt buộc trong kế hoạch, **không** coi hai finding đó là toàn bộ rủi ro v7.
