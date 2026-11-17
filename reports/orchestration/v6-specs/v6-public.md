# v6 public — bỏ tên “An Nhiên”

Base master `08fd3b5`. Chỉ sửa `apps/web/src/components/SiteHeader.tsx`, `SiteFooter.tsx`, `pages/LandingPage.tsx`, `features/auth/LoginPage.tsx`, `RegisterPage.tsx`, test liên quan, `public-simple.css`, `apps/web/index.html` (title/meta). Không sửa AppShell/API.

## Việc

- Bỏ **toàn bộ** chuỗi “An Nhiên” khỏi UI công khai: header, footer, hero, title/meta, login/register, 404 public, aria-label.
- Thay bằng tên trung tính `Theo dõi sức khỏe` (không tự đặt brand mới). Ví dụ title `Theo dõi sức khỏe — người thân và trợ lý AI`; hero `Theo dõi sức khỏe người thân từ xa`.
- Giữ nguyên bố cục đơn giản hiện tại: hero + 3 thẻ + dòng an toàn; login/register một thẻ; không thêm khối.
- Cập nhật test/assertion đang tìm “An Nhiên”; không nới test khác.
- Không đổi credentials/seed/API.

## Kiểm

Web test/typecheck/build; ảnh landing 1280/390, login/register 390; 0 tràn ngang; CTA + dòng an toàn trong màn đầu. Handoff `reports/handoffs/v6-public.md`; commit branch `v6-public`; không merge.
