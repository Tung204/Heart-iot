# v7-color — làm giao diện rực rỡ hơn (bản xem trước)

Người dùng nói giao diện hiện tại **đơn giản quá, cần màu mè hơn**. Đây là thay đổi **lớp trình bày**, không đổi IA/nghiệp vụ/copy. Làm trên nhánh riêng để chủ dự án xem ảnh trước khi hợp nhất.

## Hướng thẩm mỹ

“Ấm áp — sống động — vẫn điềm tĩnh”: một sản phẩm chăm sóc sức khỏe cho người cao tuổi nhưng không nhàm chán.

- **Nền:** gradient mềm `#eef4ff → #fdf3f7` thay nền phẳng; thêm 2–3 vệt radial rất nhẹ (sky/teal/blush) ở góc trang, không cản chữ.
- **Rail/topbar:** gradient mực xanh `#0e2a4a → #143f63`; mục đang chọn có dải cyan/teal và icon trong chip màu; giữ độ tương phản chữ trắng.
- **Màu nhấn theo nhóm chức năng:** Hôm nay = cobalt `#1d4ed8`; Cảnh báo = coral `#d92d20`; Sức khỏe = teal `#0f766e`; Người thân = violet `#6d28d9`. Dùng cho icon, viền trên card, badge, tiêu đề mục — không tô kín vùng chữ.
- **Card/khối:** nền trắng hoặc tint rất nhạt (`#ecfdf5`, `#f5f3ff`, `#fff7ed`), viền 1px màu tint đậm hơn, radius 16–20px, bóng mềm `0 10px 30px rgb(15 42 74 / 0.08)`. Không dùng bóng đen đậm.
- **Nút chính:** giữ nền đặc đủ tương phản (cobalt), thêm hover gradient nhẹ; nút phụ dùng tint theo ngữ cảnh.
- **Dữ liệu:** stat tile có nền tint + số lớn màu đậm; sparkline/chart dùng teal→violet; pill trạng thái giữ chữ + icon, không chỉ màu.
- **Landing/auth:** hero có mesh gradient + blob mờ; feature card tint khác nhau; vẫn một H1, CTA rõ.
- **Trang Hôm nay:** dải trạng thái là hero gradient nhẹ (cobalt→teal) với chữ đậm; thẻ trợ lý có viền gradient; cảnh báo đang mở là card coral tint.
- **Chuyển động:** giữ 120ms, chỉ nền/opacity; tôn trọng `prefers-reduced-motion`.

## Ràng buộc bắt buộc

- Không đổi route, nav 4 mục, thứ tự nội dung, copy, API, quyền, test.
- Không thêm dependency/font mới. Dùng token hiện có + mở rộng token màu/shadow/radius.
- Tương phản: chữ thường ≥ 4.5:1, chữ lớn ≥ 3:1, focus ring ≥ 3:1; ghi bảng đo thật.
- Target độc lập ≥ 44×44, không tràn ngang ở 1280×900, 390×844, 360×740, chữ lớn 20px.
- Không dùng màu làm tín hiệu duy nhất; trạng thái vẫn có chữ.
- Chỉ sửa CSS + token; nếu buộc phải sửa TSX thì chỉ thêm wrapper/class trang trí, không đổi logic.

## File dự kiến

`apps/web/src/styles/{tokens,base,shell,fonts}.css`, `src/components/primitives.css`, CSS feature (`alerts.css`, `health.css`/`dashboard.css`, `assistant.css`, `landing.css`/`public.css`, `admin.css`, `studio.css` — đúng tên thực tế trong repo). Không sửa `reports/qa` ngoài ảnh mới.

## Cổng và bằng chứng

- `pnpm --filter @heart-iot/web typecheck`; vitest full; build; E2E 26/26 (không sửa test).
- Chạy web cổng **4363**, API **3015** + DB riêng (`PGLITE_DATA_DIR=.data/color`, `WEB_ORIGIN=http://127.0.0.1:4363`).
- Ảnh vào `reports/qa/evidence/v7-color/`: `/`, `/login`, `/app`, `/app/overview`, `/app/alerts`, `/app/alerts/<id>` × 1280×900 và 390×844 (12 ảnh), thêm 1 ảnh 360×740 và 1 ảnh chữ lớn.
- `reports/design/v7-color-preview.md`: palette, ảnh, bảng tương phản đo thật, những gì đổi/không đổi, phần chưa kiểm.
- `reports/handoffs/v7-color.md`: provider/model thật, commit, cổng, ảnh.

## Bàn giao

Commit nhánh `v7-color` (từ `master`), **không merge/push**. Trả lời ngắn: đã đổi gì, ảnh ở đâu, số đo.
