# Re-review v4 — quản trị sau sửa

Reviewer độc lập, không sửa code, không tin handoff/test worker. Nguồn lỗi: `reports/qa/v4-review-admin.md`.

## Nhánh

`fix-v4-admin` — code `d6e59d2`, handoff `7b31ef4`, base `v4-simple-admin` (`fe31dec`). Worktree riêng; không merge.

## Phải kiểm

1. Đọc diff từ `fe31dec` đến `fix-v4-admin`; soi **diff test trước**, tìm test bị nới/xóa.
2. Chạy lại contracts build, web test, typecheck, build; không dùng output handoff.
3. Web cổng riêng **4344**; API 3000 chỉ đọc, đăng nhập admin để xem; không khóa user/publish policy/seed/xóa DB.
4. Kiểm lại từng P1/P2/P3:
   - F01 details audit full-width đọc được 1280/390/360, JSON không bẻ từ;
   - F02 lỗi field policy + 409 trong viewport, focus/scroll đúng, nút Tải lại thấy;
   - F03 audit mobile card/không giấu cột, hint 768/1024;
   - F04 copy history đúng; F05 digest/version; F06 tasks/pending; F08 ngày tạo/hint;
   - F09/F10 focus/notice/required; F11 không đọc lặp nhãn; F12 nhãn action/target;
   - F13 tab URL/reload (nếu chưa làm ghi rõ); F14 tablist/H2/Arrow;
   - F15/F16 nhãn policy/thiết bị; F17 test mới.
5. Kiểm hồi quy: 4 tab, 4 KPI, khóa user có lý do, policy preview/publish/409, audit lọc, device, mobile, chữ lớn, bàn phím, overflow.
6. Phải nêu **ít nhất 10 phát hiện** còn lại hoặc rủi ro; không viết “pass/đạt”.
7. Chỉ ghi `reports/qa/v4-rereview-admin.md`; không sửa code/merge.
8. Trả lời: số phát hiện, P1 còn lại, file.
