# Re-review v4 — ứng dụng sau sửa P1

Reviewer độc lập, không sửa code, không tin handoff/test worker. Nguồn: `reports/qa/v4-review-app.md`.

## Nhánh

`fix-v4-app` — code `a1066f3`, handoff `594ee28`, base `v4-simple-app` (`bda9bb2`). Worktree riêng; không merge.

## Phải kiểm

1. Diff `bda9bb2..fix-v4-app`; soi **diff test trước**, đặc biệt test T01 (quyền cảnh báo) và T02 (disclaimer).
2. Chạy lại contracts build, web test, typecheck, build.
3. Web cổng riêng **4345**; API 3000 chỉ đọc; đăng nhập owner/caregiver; không xác nhận/đóng/ghi DB.
4. Kiểm P1 gốc:
   - F01 caregiver không quyền cảnh báo: không được “Không có cảnh báo mở”; badge 0;
   - F03 thiết bị offline/dữ liệu cũ: câu cảnh báo đúng, tone cảnh báo;
   - F04 chi tiết cảnh báo: Gọi là hành động đầu trong viewport 390/360; Đóng không đứng đầu;
   - F07 xác nhận một chạm: không còn hoặc có hỏi lại.
5. Kiểm F02/F09/F11/F12/F13/F15/F19/F21/F30/F31 và hồi quy: nav 4 mục, Thêm, Hôm nay, Sổ hồ sơ, đổi hồ sơ, 403, mobile/chữ lớn, bàn phím, overflow.
6. Nêu **ít nhất 10 phát hiện** còn lại/rủi ro; không “pass/đạt”.
7. Chỉ ghi `reports/qa/v4-rereview-app.md`; không sửa code/merge.
8. Trả lời: số phát hiện, P1 còn lại, file.
