# v7 inventory — phản biện rebuild và chống mất chức năng

Bạn là reviewer/migration planner độc lập **Pi / dola / gpt-6.1-sol**, chạy song song với design lead. Người dùng yêu cầu bỏ giao diện xây mới hoàn toàn; mọi việc qua sub-session. Đọc mandate lead `C:/MyFolder/Hoc_Tap/project/DATN/reports/orchestration/v7-specs/mandate.md` (chỉ đọc), README, docs/README, docs/06/07/12/14 và source/router/test thực tế. Không mặc định docs lịch sử khớp code.

## Phạm vi chỉ đọc code

Chỉ ghi `reports/orchestration/v7/migration-inventory.md`, `reports/handoffs/v7-inventory.md`; commit 2 file trên nhánh mình, không merge. Không thay code/test/dependency hoặc ghi ngoài workspace/Obsidian. Không seed/DB mutation; chưa cần mở browser nếu source đủ cho inventory.

## Đầu ra bắt buộc

1. Inventory đủ route và nhiệm vụ/user role từ router/source thật (không chỉ 4 màn chính): public/auth/invite/404, Hôm nay/assistant, overview/history/insights, alerts/detail, subjects/forms/share/contacts, devices/tasks, settings/sessions, notifications redirect, admin/policy/audit, Studio routes. Mỗi dòng: logic/API/hooks/state phải giữ, hành vi/test then chốt và file presentation được thay.
2. Nguy cơ rebuild làm mất quyền hoặc dữ liệu: canViewMeasurements/canReceiveAlerts/admin-only, selected subject, request muộn/threads, share history, offline vs stale vs no data, CAS ack/resolve/policy/Studio, loading/error focus, synthetic labels. Dẫn file:test/logic cụ thể.
3. Soi test suite hiện có: assertion nào là bất biến cần giữ, assertion nào gắn layout/text cũ được phép đổi khi hành vi giữ; kiểm rủi ro xóa/nới test. Chỉ chạy typecheck/test nếu trả lời một nghi vấn có giá trị; không full gate vô cớ.
4. Audit style/import/class graph: main.css imports, local feature CSS, primitive components; đề xuất cách retire stylesheet cũ không tạo lớp override thứ tư. Scope ảnh hưởng và ownership xung đột cần tránh khi chia worker.
5. Phản biện ngắn mandate: mâu thuẫn/rủi ro/giả định và giải pháp khả thi, không tự đổi yêu cầu người dùng. Phân biệt xây lại UI với viết lại API/hard-code số liệu. Không quota số lỗi.
6. Đề xuất small test matrix/gates độc lập trước merge master và định nghĩa thực sự 'xây mới' (composition, typography, spacing/hierarchy, navigation, states), không chỉ thay màu.

Không cần chờ designer để làm. Báo worker_done với scope thực kiểm, câu hỏi còn thiếu và nguồn file. Coordinator sẽ nhờ phản biện thiết kế sau khi cả 2 đầu ra có. Không lấy việc có tài liệu là implementation đã hoàn thành.