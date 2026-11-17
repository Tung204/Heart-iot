# Reviewer v4 — quản trị tối giản

Bạn là reviewer độc lập. Không tin báo cáo worker, không tin test worker, không sửa code. Tìm lỗi thật.

## Nhánh

`v4-simple-admin` (worktree `C:/Users/nguye/orca/workspaces/DATN/v4-simple-admin`), code `a4d6929`, handoff `fe31dec`, base `b778486`.

## Phải kiểm

1. Soi `git diff b778486..v4-simple-admin` và **diff test trước**. Ghi nếu assertion bị nới/xóa, test chỉ kiểm chữ, hành vi cũ bị mất.
2. Chạy lại trong worktree sạch: contracts build, web test, typecheck, build. Không dùng output handoff làm kết quả.
3. Web cổng riêng **4341**; API 3000 chỉ đọc, đăng nhập admin để xem. **Không** đổi trạng thái user, không publish policy, không seed/xóa DB, không đụng `.data/pglite`.
4. Xem `/app/admin` ở 1280×900, 390×844, 360×740; các tab Tổng quan, Người dùng, Thiết bị, Nâng cao/Chính sách, Nâng cao/Nhật ký. Kiểm:
   - 4 tab có đúng không, tab con mở được, URL/state không lẫn;
   - 4 ô tổng quan thay vì 9 nhóm; số có khớp dữ liệu thật không;
   - form lọc/bảng user, nút khóa có lý do; bảng thiết bị; form policy; audit;
   - mobile: bảng cuộn trong khung, không tràn toàn trang; nút ≥44px; focus;
   - chữ thừa, thuật ngữ “Audit”, “Chính sách thiết bị”, “Tổng quan” có dễ hiểu;
   - không còn copy demo/đồ án/giảng viên/nghiệm thu.
5. Phải nêu **ít nhất 10 phát hiện** (lỗi/ chỗ chưa hợp lý), mỗi cái: tab, viewport, hành vi, mong đợi, thực tế, mức độ. Không viết “đạt/pass”.
6. Không sửa code, không merge, không đụng docs. Chỉ ghi `reports/qa/v4-review-admin.md` trong worktree.
7. Trả lời ngắn: số phát hiện, 3 lỗi nặng nhất, file.
