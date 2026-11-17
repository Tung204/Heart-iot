# Bàn giao v7 — thiết kế và kế hoạch triển khai

**Tác giả:** Pi / dola / gpt-6.1-sol · **Ngày:** 15/11/2026, Asia/Ho_Chi_Minh · **Nhánh:** `v7-design`.

**Task:** `task_97a71e5b7953` · **Dispatch:** `ctx_096f43a67fb1` · **Baseline đã khảo sát:** `bc10ae60d5cc443a8e4070da63b5e6be0e4a8127`.

## 1. Đã thực sự làm

Chỉ tạo ba file được giao, không sửa code/test/dependency/DB, không khởi chạy worker phụ, không ghi Obsidian và không merge:

| File | Nội dung / nguồn chính |
| --- | --- |
| [design-system.md](../orchestration/v7/design-system.md) | Một visual direction; token hex/scale/typography có giá trị; shell/nav/context; toàn bộ nhóm route/action/state/responsive; bất biến quyền và AI |
| [implementation-plan.md](../orchestration/v7/implementation-plan.md) | Source impact map; chiến lược thay CSS/JSX và retire override; ownership không overlap theo wave; phụ thuộc tích hợp/reviewer; migration tests và acceptance đo browser |
| `reports/handoffs/v7-design.md` | Bản bàn giao này, scope/bằng chứng/giới hạn/phần cần phản biện |

Đã đọc mandate ở workspace lead (chỉ đọc), README/docs README, docs/06/07/11/12/14, frontend-design skill; khảo sát router/main/index boot, shell/primitives, toàn bộ nhóm features và CSS, contracts/hook/API/test liên quan. Đã tiếp nhận và đọc báo cáo v6 do lead gửi; không tái kiểm runtime các finding v6 trong lượt này. Có tra tài liệu chính thức Fontsource/React/Query/Vite cho font, identity reset, cancellation và CSS built-in, ghi nguồn/giới hạn phiên bản trong đặc tả.

## 2. Các quyết định thiết kế đề xuất thống nhất

- **Một hướng:** sans Be Vietnam Pro cho tất cả vai trò; nền trắng/xám lạnh, rail xanh mực, action cobalt; không serif/kem/hero nhịp tim/lưới card cũ. Không thêm tên thương hiệu/dependency/stock image. Header/boot/noscript/auth/404/admin/Studio đều thuộc scope thay.
- **Bốn nav giữ nguyên:** Hôm nay / Cảnh báo / Sức khỏe / Người thân. Avatar chỉ tài khoản/chữ lớn/đăng xuất và admin có Quản trị; thiết bị/chia sẻ/liên hệ nằm đúng hàng người và đường ngữ cảnh; công việc có link rõ ở Người thân/Thiết bị/Quản trị; Studio giữ direct route, không vào menu người dùng.
- **Hôm nay:** một tín hiệu cần làm trước, sau đó heading Hỏi trợ lý AI nhìn thấy + composer/gợi ý; không overview/metrics/summary mặc định. Cảnh báo, liên hệ và hành động không chờ AI. Nguồn/chất lượng/giới hạn đi cùng câu trả lời và dữ liệu.
- **Multi-profile:** một primitive compact, shell chỉ render selected context ở năm loại trang subject-scoped; collection/account/admin không có selector giả lọc; detail/share/Studio data ghim theo đối tượng API/URL. Đổi identity phải gỡ DOM cũ ngay và chặn late response, không chỉ reset sau effect.
- **Giữ chức năng inbox:** đề xuất `/app/alerts?view=notifications`, legacy `/app/notifications` về inbox mode; dùng khả năng NotificationsPage đang có nhưng không được mount ở baseline. Open-alert badge khác account-wide unread; mark-read không ack/resolve; banner phải dẫn đúng incident/subject.
- **Admin:** năm mục tên thật Tổng quan/Người dùng/Thiết bị/Chính sách/Nhật ký, policy/audit vẫn tương thích query URL cũ. **Tasks account-wide**, caregiver chỉ xem theo source hiện có; không biến copy docs cũ thành quyền mới.
- **CSS:** tách nguyên tử source stylesheet cũ vào owner feature, thay tokens/primitives/shell, không nạp đồng thời old+new và không tạo override cuối. F1 một writer sở hữu tạm việc extract CSS, sau đó chuyển lease cho lanes; main/router/tokens/components shared chỉ foundation writer. Mỗi feature thay JSX/presentation thực, dọn rule cũ theo call-site/state/build evidence.

Các lựa chọn trên là **đề xuất kỹ thuật trong phạm vi design**, chưa có UI v7 được thực thi hoặc chấp nhận. Mandate cho phép thay trực tiếp trên nhánh không xin thêm vòng preview; không bỏ cổng tự kiểm ảnh/reviewer độc lập.

## 3. Phần cần reviewer/lead phản biện trước dispatch implementation

1. **Khả năng tìm chức năng và scope:** kiểm inbox khôi phục đủ mark-read/deep link, công việc account-wide không bị hiểu là chỉ một người; Studio trực tiếp vẫn usable và đủ quyền. Đặc biệt mọi banner B trong selection A phải mở đúng đối tượng B, không dùng selection làm quyền detail.
2. **Migration foundation:** rà ledger selectors/classes/imports và thời điểm chuyển ownership CSS. Nếu cần component/context API khác, chốt **trước** lanes; không để mỗi worker tự viết primitive/override. R có scope rộng, lead có thể tách thư mục trước dispatch hoặc chia tuần tự, không thêm writer chéo khi đang chạy.
3. **Viewport và quyền:** phản biện tính thực thi composer/action Hôm nay cùng Gọi trên 360×740 chữ lớn, form đăng ký pristine trong viewport, contacts lỗi không chặn incident, placeholder insights/Studio/share/claim không lẫn identity. Không được đạt hình học bằng che label/error/giới hạn hoặc giảm chữ.

Không cần phản biện bằng đủ số finding; chỉ ghi thiếu sót có source/route/state/expected-actual hoặc mâu thuẫn mandate. Không dùng hai finding v6 làm danh sách đóng của review v7.

## 4. Kiểm chứng đã chạy và chưa chạy

**Đã chạy cho tài liệu:** kiểm UTF-8 không ký tự thay thế, code fence cân bằng, toàn bộ link Markdown tương đối tồn tại; kiểm marker 14 route rõ cộng nhóm public/404/detail; `git diff --check` và xác minh scope chỉ ba file mới. Các cặp màu được tính relative luminance bằng JavaScript trong phiên, không coi là audit computed CSS.

**Chưa chạy:** lint/typecheck/unit/build/E2E ứng dụng, rendering/screenshot/đo target/focus/viewport, API/DB/seed hoặc kiểm người dùng thật. Đây là design-only, không báo kết quả ứng dụng từ số test README. Ba file reports không nằm trong danh sách nguồn của `tools/docs/build.py`; không sửa generated HTML và không cần sinh lại chỉ cho tác vụ này. Lead cập nhật nguồn docs/HTML sau khi có implementation thực tế theo kế hoạch.

## 5. Bước tiếp theo duy nhất

Lead lấy spec này làm nguồn thiết kế chung, giao reviewer độc lập đối chiếu migration inventory/permissions/IA, ghi điều chỉnh công khai nếu có rồi dispatch **F1 foundation trước**, sau cổng F1 mới chạy P/C/H/R/A song song và tích hợp tuần tự. Cổng browser phải pin hostname/port/build fingerprint đúng nhánh tích hợp; không dùng `localhost`/`127.0.0.1` thay nhau hoặc nhận ảnh cũ. Không có blocker cần coordinator trả lời để hoàn tất tác vụ thiết kế này; phần còn lại là phản biện, triển khai và kiểm chứng theo hai đặc tả.
