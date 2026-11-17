# Re-review v4 — công khai sau sửa

Reviewer độc lập, không sửa code, không tin handoff/test worker. Nguồn lỗi: `reports/qa/v4-review-public.md`.

## Nhánh

`fix-v4-public` — code `1d4ca1d` + follow-up `dd1fbd5`, handoff sau `1249b9b`, base `feat/v4-simple-public` (`f572ef4`). Worktree riêng, không merge.

## Phải kiểm

1. Đọc diff từ `f572ef4` đến `fix-v4-public`; soi **diff test trước**, tìm test bị nới/xóa.
2. Chạy lại: contracts build, web test, typecheck, build. Không dùng output handoff.
3. Web cổng riêng **4343**; API 3000 chỉ đọc `/me`; không đăng nhập/không ghi DB/không seed.
4. Kiểm lại **từng** P1/P2 của báo cáo gốc, đặc biệt:
   - P1-1/P1-3: dòng an toàn/disclaimer nằm trong viewport đầu ở 1280/390/360/large, không lặp footer;
   - P1-2: hero/thẻ nói rõ trợ lý AI;
   - P1-4: `apps/web/e2e/smoke.spec.ts` không còn “Mở trợ lý”; chạy smoke thật;
   - P1-5: trang login công khai **không còn** khối “Tài khoản trải nghiệm”, không có nút tự điền admin/email/mật khẩu;
   - P1-6: test an toàn và đúng một CTA mỗi đích;
   - P2: duplicate CTA, register chữ lớn, invite, target size, focus field, /me pending/500, thiết bị đeo, Escape details, quyền invite.
5. Kiểm hồi quy: landing đã đăng nhập, pending/500, mobile 390/360, chữ lớn, bàn phím, skip link, form validation, 404/invite.
6. Phải nêu **ít nhất 10 phát hiện** còn lại hoặc rủi ro; nếu không còn P1, ghi rõ bằng chứng từng mục. Không viết “pass/đạt”.
7. Chỉ ghi `reports/qa/v4-rereview-public.md`; không sửa code/merge.
8. Trả lời: số phát hiện, P1 còn lại, file.
