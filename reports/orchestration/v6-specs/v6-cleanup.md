# v6 cleanup — bỏ Studio khỏi người dùng, bớt lặp tên

Base master `HEAD` sau merge v6. Chỉ sửa:
`apps/web/src/app/AppShell.tsx`, `AppShell.test.tsx`, `apps/web/src/pages/LandingPage.tsx`, `LandingPage.test.tsx`, `apps/web/src/styles/{base,layout,tokens}.css` (chỉ comment), `apps/web/src/features/subjects/selection.ts` (comment). Không đổi API.

## Việc

1. **Bỏ mục `Studio` khỏi menu tài khoản** với mọi người dùng thường (kể cả chủ hồ sơ). Route `/app/studio*` giữ nguyên nhưng không còn link trong shell/account; admin cũng không cần link này. Bỏ prop `isStudioUser` nếu không dùng; cập nhật test.
2. Landing:
   - H2 `Theo dõi sức khỏe làm gì` → `Ứng dụng làm gì`.
   - Hero lead bỏ lặp tên: dùng `Nhịp tim, vận động và kết nối thiết bị của người thân được ghi lại; bạn nhận cảnh báo khi có bất thường. Trợ lý AI trả lời câu hỏi về số liệu của người thân.`
   - Không đổi CTA/dòng an toàn.
3. Đổi comment `An Nhiên — ...` trong `base.css`, `layout.css`, `tokens.css` thành `Theo dõi sức khỏe — ...`; comment `Hồ sơ đang xem` trong `selection.ts` thành `Hồ sơ đang chọn` (chỉ comment, không đổi logic).
4. Không thêm màn/nút mới; không đụng Subjects/Assistant/Public khác.

## Kiểm

Web test/typecheck/build; grep `An Nhiên` trong `apps/web/src` còn 0 ngoài test âm bản; ảnh landing 390 + app 390; menu tài khoản không còn Studio; 0 tràn ngang. Handoff `reports/handoffs/v6-cleanup.md`; commit branch `v6-cleanup`; không merge.
