# v7 design — thiết kế mới và kế hoạch chia implementation

## Vai trò và đầu ra

Bạn là design lead độc lập qua sub-session **Pi / dola / gpt-6.1-sol**. Nhiệm vụ là thiết kế mới đủ cụ thể để worker khác xây, không sửa UI ngay và không lặp lại UI nền kem/chữ serif/card hiện tại. Người dùng yêu cầu bỏ UI xây mới hoàn toàn, không muốn vòng preview hỏi lại. Ghi phân tích/khuyến nghị công khai, không ghi chain-of-thought.

Đọc mandate đầy đủ tại `C:/MyFolder/Hoc_Tap/project/DATN/reports/orchestration/v7-specs/mandate.md` (file ở workspace lead; chỉ đọc). Đọc README, docs/README, docs/06, 07, 11, 12, 14; tài liệu là lịch sử nếu trái mandate mới. Dùng skill frontend-design. Khảo sát router, main, components, tất cả features và CSS để hiểu chức năng; không coi layout hiện có là chuẩn.

Chỉ được ghi:
- `reports/orchestration/v7/design-system.md`
- `reports/orchestration/v7/implementation-plan.md`
- `reports/handoffs/v7-design.md`
Không sửa code/test/dependency; có thể commit 3 file của mình trên nhánh riêng, không merge, không ghi Obsidian.

## Cần quyết định cụ thể

1. Một visual direction duy nhất phù hợp người chăm sóc/người cao tuổi và quản trị: typography mới từ dependency sẵn có, màu/tokens, hierarchy, density, layout desktop/mobile, states, icon. Nêu giá trị token/scale/pattern thực hiện được, không mỹ từ chung chung. Không tên thương hiệu mới.
2. Thiết kế nội dung từng nhóm route: nhiệm vụ chính, H1/ngữ cảnh, thứ tự vùng/action, không-data/loading/error/no-permission/stale, responsive. AI là khả năng cốt lõi dễ tìm nhưng không làm cảnh báo phụ thuộc AI; không lặp overview trên Hôm nay.
3. Primary nav giữ 4 item Hôm nay/Cảnh báo/Sức khỏe/Người thân theo người dùng đã chốt; mô tả đường đi tới tài khoản, thiết bị, công việc, chia sẻ/liên hệ, Studio trực tiếp, admin. Cấm menu phụ thành thùng rác và chức năng biến mất.
4. Context nhiều hồ sơ nhất quán: compact, không card Hồ sơ đang xem, change subject không lộ state cũ. Phân biệt tên user và người được đo.
5. Mọi màn đều phải đổi presentation, gồm auth/invite/404/admin/Studio, không chỉ shell/landing. Giữ nền nghiệp vụ và security invariants.
6. Đề xuất replacement CSS strategy: thay thực sự source stylesheet/primitive/JSX, retire override cũ có kiểm; tương thích class của các feature trong giai đoạn ghép, không một file override cuối toàn hệ thống.
7. Kế hoạch triển khai theo wave với ownership file không overlap, thứ tự integration/dependency, reviewer/gates, migration test; spec worker nào có thể chạy song song, ai sở hữu main/tokens/components/router.
8. Acceptance checks cụ thể theo viewport 1280/390/360/chữ lớn; đo primary action viewport, overflow, target, errors/focus, permission, late response; không bắt đủ số finding.

Đây là thiết kế và kế hoạch, không tuyên bố UI đã làm hay được người dùng chấp nhận. Không dành thời gian làm 3 phương án/moodboard; chọn một hướng rõ, giải thích ngắn tại sao khác bản bị bác. Handoff báo file/scope và phần cần phản biện. Kết thúc worker_done đúng Task/Dispatch. Không poll coordinator; hỏi bằng orchestration ask nếu blocker thật.