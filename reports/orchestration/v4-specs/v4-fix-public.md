# Fix worker v4 — sửa lỗi review công khai

Base: `feat/v4-simple-public`. Đọc báo cáo đầy đủ tại `C:/MyFolder/Hoc_Tap/project/DATN/reports/qa/v4-review-public.md`. Không merge.

## Phải sửa

1. **P1-1/P1-3 — ranh giới cảnh báo + disclaimer trong màn đầu.** Dưới CTA hero thêm đúng một dòng nhỏ, không tách khối:
   `Dữ liệu mô phỏng · cảnh báo chỉ hiện khi web mở · không tự gọi cấp cứu.`
   Footer chỉ còn tên + một câu mô tả, không lặp disclaimer. Test phải kiểm dòng này nằm trong viewport đầu (dùng DOM/vị trí hoặc ít nhất tồn tại đúng 1 lần và test geometry nếu chạy browser được).
2. **P1-2 — nói rõ trợ lý AI.** Hero thêm đúng một câu ngắn: `Trợ lý AI trả lời câu hỏi về số liệu của người thân.` Thẻ thứ ba đổi thành `Hỏi trợ lý` và mô tả `Hỏi trợ lý AI về số liệu của người thân.` Không dùng “Hỏi đáp” mơ hồ. Cập nhật title/meta nếu cần.
3. **P1-4 — E2E smoke.** Sửa `apps/web/e2e/smoke.spec.ts` để không còn tìm `Mở trợ lý`; kiểm CTA mới `Tạo tài khoản` (khách) hoặc `Mở ứng dụng` (đã đăng nhập). Chạy smoke thật, ghi output.
4. **P2-1/P2-2 — CTA trùng.** Header chỉ logo, không CTA. Hero là nơi duy nhất có CTA: khách `Tạo tài khoản` + `Đăng nhập`; đã đăng nhập chỉ `Mở ứng dụng` (một nút). Test phải khẳng định đúng một link cho mỗi đích, không dùng `length > 0`.
5. **P2-3 — register chữ lớn.** Ở 390×844 chữ lớn, nút submit phải nằm trong viewport đầu. Giảm khoảng cách/padding khung auth, không cắt field; kiểm lại 390/360 thường + chữ lớn.
6. **P2-4 — invite lỗi.** Giữ thông tin “đã được dùng/đã hết hạn” và lời nhắc kiểm tra link/nhờ mời lại, nhưng tối đa 2 câu. 404 giữ một câu hướng dẫn link lời mời.
7. **P2-5 — target/link.** Link “Về trang chủ”, “Tạo tài khoản mới”, “Đăng nhập” phải có vùng chạm ≥44px hoặc là link trong câu có underline rõ; dùng cùng kiểu nút/khung với 404. Invite lỗi dùng `AuthLayout` hoặc có dòng dữ liệu mô phỏng tương đương.
8. **P2-10 — focus lỗi form.** Khi submit login/register lỗi, focus vào field lỗi đầu tiên (không chỉ role=alert). Giữ aria-invalid/aria-describedby.
9. **P2-8 — thiết bị đeo.** Thêm từ “thiết bị đeo” vào hero hoặc thẻ Theo dõi, không thêm đoạn dài.
10. **P2-7 — /me pending/500.** Không hiện CTA khách khi đang kiểm tra phiên; nếu `/me` lỗi 500, hiện một dòng ngắn “Không kiểm tra được phiên đăng nhập” + link đăng nhập, không giả vờ là khách. Không cần retry phức tạp.
11. **P2-6/P2-9** nếu còn thời gian: Escape đóng `<details>`; quyền invite thành danh sách ngắn. Không bắt buộc nếu ảnh hưởng lớn.

## Ràng buộc

- Không đổi API/contract, không đổi route/quyền, không thêm dependency.
- Không sửa AppShell/router/layout.css/admin/app CSS.
- Copy ngắn; không thêm section. Không dùng “demo/đồ án/giảng viên/nghiệm thu”.
- Cập nhật test cũ, không nới assertion; thêm test cho an toàn, CTA đúng một, focus lỗi.
- Chạy web test/typecheck/build; smoke E2E; ảnh 1280/390/360/large; đo overflow và vị trí disclaimer/CTA. Ghi handoff `reports/handoffs/v4-fix-public.md`, commit branch riêng, không merge.
