# Handoff — v7 inventory và phản biện rebuild

- **Task:** `task_e3e7bf70c5c1`; dispatch `ctx_17d0f7673415`.
- **Người thực hiện:** Pi / `dola` / `gpt-6.1-sol`.
- **Ngày:** 15/11/2026, Asia/Ho_Chi_Minh.
- **Nhánh:** `v7-inventory`; baseline khảo sát `bc10ae60d5cc443a8e4070da63b5e6be0e4a8127`.
- **Kết quả:** hoàn tất khảo sát source/test và migration plan độc lập; **không có implementation UI v7** trong nhánh này.
- **Đầu ra chính:** [migration-inventory.md](../orchestration/v7/migration-inventory.md).

## Phạm vi đã thực kiểm

Đã đọc mandate chỉ đọc tại `C:/MyFolder/Hoc_Tap/project/DATN/reports/orchestration/v7-specs/mandate.md`, README, docs/README, docs/06/07/12/14 và công cụ docs HTML; đọc report v6 được coordinator chuyển tại `C:/MyFolder/Hoc_Tap/project/DATN/reports/qa/v6-review.md`. Không mặc định nội dung lịch sử là trạng thái router hiện tại.

Đã đối chiếu router thực và mọi nhóm route: public/login/register/invite/public404; ProtectedRoute/AppShell/app404; Hôm nay + assistant alias; overview/history/insights inline; alerts/detail; subjects/form/context/share/contacts; devices/tasks; settings/sessions inline; notifications redirect; admin overview/users/devices/policy/audit; ba route Studio list/editor/published data. Map mỗi dòng ghi actor/nhiệm vụ, API/hooks/state, phép kiểm cần giữ và file presentation được thay.

Đã truy vết query key, request signal, selected subject/localStorage, late response, quyền measurement/receive/AI/action/admin, history window/CSV, revoked cache, alert/policy/Studio CAS, loading/error/focus, synthetic labels; đối chiếu các service/contract và test API liên quan. Đã rà tên ca/assertion web ở toàn bộ 35 file và đọc sâu các nhóm behavior/layout/CSS nhạy cảm; không tuyên bố đọc từng dòng của mọi test hay review toàn hệ thống backend.

Đã truy vết entry CSS/import feature/primitive/callers, thống kê tĩnh **15 CSS / 6.824 dòng**, **35 file web test / 263 khai báo test**; đây **không phải số test pass, kích thước bundle hoặc đo dead CSS**. Đã tra tài liệu chính thức Query v5 qua Context7 về keepPreviousData/placeholderData; index không có đúng patch5.107.1 nên chỉ đối chiếu semantics v5, không nhận chứng nhận runtime.

## Những điểm lead/design cần dùng ngay

1. **Không có main.css:** entry `apps/web/src/main.tsx` nạp fonts/tokens/base/layout/public-simple/app-simple/admin-simple, cộng tám CSS local; layout 3.509 dòng chứa cả primitives và nhiều feature, simple CSS còn override chéo. Report có impact map + cut-over/import retire và quyền sở hữu file để tránh lớp override thứ tư.
2. **Nav đã đúng bốn mục trong source, docs lịch sử còn Thêm.** Task route đang không thấy lối vào UI; notifications chỉ redirect, inbox/mark-read còn trong `NotificationsPage` không được mount; không coi giữ URL hoặc component test là bảo toàn nhiệm vụ.
3. **Subject isolation cần là contract chung:** hiện context compact chỉ ở Hôm nay, SubjectsPage set người trước navigate; alert/share/Studio phải theo ID tài nguyên, không active subject tùy tiện. `useInsights` giữ previousData qua key transition không gác identity; thêm deferred A→B test trước khi tái dùng trong composition mới.
4. **Revoked cache chưa thể gọi là phủ đủ:** hook dọn nhánh subjects và alerts, trong khi Studio/tasks/notification/local state có nhánh khác. Banner notification toàn tài khoản đi `/app/alerts` theo activeSubject nên cần spec chọn đúng người/incident.
5. **Nguồn synthetic không đồng nghĩa data-mode sample:** Studio sample=false hiện gọi “Dữ liệu thật”, kể cả fixture source synthetic; assertion text đó nên sửa có căn cứ, không bảo tồn như bất biến. History point contract không có provenance riêng, không được tự suy số đo thật.
6. **Giữ các ca request/quyền/CAS/focus/window/performance; đổi được assertion layout cũ theo spec mới.** Report phân loại cụ thể hero/ba card, bốn KPI/ba attention line, CSS class/file regex, audit panel; không xóa cả test file hỗn hợp hoặc nới expected để làm xanh.
7. **Hai khoảng hở source AI cần scope logic riêng:** docs nói recheck sau provider nhưng service chỉ thấy kiểm ban đầu; gatherFacts đọc incident/task không truyền receive permission sau gate measurement+view_ai. Đây là nghi vấn có căn cứ source, **chưa tái hiện runtime**, không được biến thành “đã sửa/đã có exploit” hoặc giao frontend worker âm thầm sửa backend.
8. **Risk v6 tiếp tục cần kiểm:** invite token ngắn 422 đang bị map lỗi kết nối (test hiện mock404 không cùng validation thật); auth/header link hitbox nhỏ; localhost/127.0.0.1 từng vào hai worktree. Pin URL/origin/build fingerprint và kiểm trực quan lại, không kế thừa nghiệm thu v6.

## Câu hỏi còn mở cho spec/integration

- Điểm vào Công việc và inbox/mark-read trong Cảnh báo sẽ đặt ở ngữ cảnh nào mà vẫn đúng nav bốn mục, không Thêm/Studio menu user?
- Compact subject context ngoài Hôm nay, hành vi banner khác subject, identity/reset/cache authority sẽ do ai sở hữu chung?
- Những khoảng hở quyền/cross-cache/AI có phải blocker cần giao task logic riêng trước merge, và policy mong muốn cho AI khi không nhận cảnh báo là gì?
- URL/hostname/build fingerprint/origin và môi trường API/DB kiểm riêng được phép là gì; không seed/mutation DB dùng chung?
- Assertion layout/copy cũ nào được thay theo spec v7 và bằng chứng tương đương nào reviewer độc lập sẽ kiểm?

Các câu hỏi này không chặn hoàn tất inventory; coordinator/design lead có thể chốt trong mandate mà không bắt người dùng duyệt từng chi tiết thường lệ. Report có small matrix G0–G7, gate typecheck → targeted behavior → final full web/build/E2E/docs trên nhánh tích hợp, cùng định nghĩa “xây mới” theo composition/typography/spacing/navigation/states chứ không đổi màu.

## Kiểm chứng và giới hạn

- Đã kiểm local Markdown links và 96 tham chiếu file đơn giản dạng W/B/BT/C/E trong inventory đều tồn tại; kiểm lại hai báo cáo trước commit và `git diff --check`.
- **Không chạy typecheck/test/build/browser**, không gọi API, không tạo phiên, không seed hoặc ghi DB; source đủ cho task inventory chỉ đọc. Không báo kết quả lịch sử README hoặc số khai báo tĩnh là pass trong phiên này.
- Không thay code/test/dependency/contracts/config/HTML hoặc mandate, không merge/cherry-pick vào master; chỉ commit hai report được giao trên nhánh riêng.
- Không mở browser/tab/server/helper worker nên không có tài nguyên runtime cần đóng. Không sửa Obsidian: mandate giao lead cập nhật tổng hợp; chỉ bàn giao kết quả tại hai file trong workspace, không tạo note/vault thay thế hay tuyên bố đã lưu.

## Nguồn tiếp tục và bàn giao

- Toàn bộ map chi tiết, mốc file:test/logic, style graph, ownership và gates: [inventory](../orchestration/v7/migration-inventory.md).
- Router thật: `apps/web/src/app/router.tsx`; entry/style: `apps/web/src/main.tsx`, `styles/*`; quyền: `apps/api/src/access/access.service.ts`.
- Identity/event/cache: `apps/web/src/features/subjects/selection.ts`, `features/realtime/useSubjectEvents.ts`, `app/AppShell.tsx`, `lib/query.ts`, feature API query keys.
- State/CAS: `features/alerts/*`, `features/admin/AdminPage.tsx`, `features/studio/*`; ranh giới server/test cụ thể ghi trong inventory mục3.
- Test preservation/layout diff: inventory mục4; CSS retirement/ownership: mục5–6; phản biện/câu hỏi: mục7; test matrix: mục8; định nghĩa xây mới: mục9.

**Bước tiếp theo:** coordinator đối chiếu spec của design lead với inventory này và yêu cầu phản biện thiết kế riêng sau khi cả hai đầu ra có; chưa dispatch thêm implementation chỉ vì đã có tài liệu này.
