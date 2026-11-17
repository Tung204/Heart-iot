# Reviewer v4 — ứng dụng khách hàng

Reviewer độc lập, không sửa code, không tin handoff/test worker.

## Nhánh

`v4-simple-app`, code `bda9bb2`, base `b778486`, worktree `C:/Users/nguye/orca/workspaces/DATN/v4-simple-app`.

## Phải kiểm

1. Soi `git diff b778486..v4-simple-app` và **diff test trước**; ghi test bị nới/xóa/chỉ kiểm chữ.
2. Chạy lại contracts build, web test, typecheck, build trong worktree sạch.
3. Web riêng cổng **4342**; API 3000 chỉ đọc (owner `ba-an@demo.annhien.local`), không xác nhận/đóng cảnh báo, không ghi DB, không seed.
4. Mở `/app` (Hôm nay), `/app/overview`, `/app/alerts`, `/app/alerts/:id`, `/app/subjects`, `/app/history`, `/app/devices`, `/app/notifications`, `/app/tasks`, `/app/settings`, `/app/admin` (nếu admin) ở 1280×900, 390×844, 360×740, chữ lớn 390. Kiểm:
   - H1/heading, CTA chính, thứ tự thông tin, số khối trên màn đầu;
   - không còn báo cáo tự động/4 ô số/độ phủ/cột Bối cảnh trên `/app`;
   - nav 4 mục + Thêm; mobile 4 mục; mục Thêm có quá nhiều đích không;
   - ô hỏi + Gửi trong màn đầu, trên bottom-nav; chip không đẩy;
   - trạng thái cảnh báo/không cảnh báo/chưa dữ liệu/403; đổi hồ sơ reset thread, phản hồi muộn;
   - mỗi màn phụ có một mục đích, không lặp disclaimer, không email demo;
   - copy còn thuật ngữ kỹ thuật/thừa: “độ phủ”, “mẫu”, “UUID”, “telemetry”, “bản tin”, “Bối cảnh”;
   - bàn phím, focus, target ≥44px, overflow.
5. Đọc thêm `reports/orchestration/v5-plan-ux.md` (kế hoạch độc lập) và đối chiếu; nêu chỗ nhánh chưa giải quyết.
6. Phải nêu **ít nhất 15 phát hiện** cụ thể (màn, viewport, hành vi, mong đợi, thực tế, mức). Không viết “pass/đạt”.
7. Chỉ ghi `reports/qa/v4-review-app.md` trong worktree; không sửa code/docs/merge.
8. Trả lời ngắn: số phát hiện, 3 lỗi nặng nhất, file.
