# Bài học điều phối (rút gọn)

Tổng hợp từ [journal 14/11](journal-2026-11-14.md), [journal 15/11](journal-2026-11-15.md) và
[worklog 15/11](../worklog/2026-11-15.md). Đây là ghi chú kinh nghiệm, không phải quy trình bắt buộc
hay checklist tiến độ; chi tiết và bằng chứng nằm ở các file nguồn.

## Trước khi mở worker

- Preflight một prompt ngắn cho từng loại agent/provider trước khi mở cả wave; kiểm `agent read`
  thay vì tin `agent start` trả về. "Agent chạy được" không đồng nghĩa "provider gọi được".
- Giao vùng ghi rời nhau; lead giữ `app.module.ts`/schema (API) và router/AppShell (web), worker chỉ
  thêm module/feature trong phạm vi đã chia.
- Việc lớn nên tách nhỏ có chủ đích: incident/outbox/SSE thành 2 worker khi có deadline; 8 màn hình
  frontend tách theo nhóm (alerts so với dashboard/history) thay vì một worker.

## Khi nhận handoff

- Chạy lại lệnh trong handoff, không tin "test đã pass"; handoff phải ghi lệnh và output thật.
- Luồng E2E thật bằng Playwright là cổng bắt buộc sau khi ghép: unit test đã bỏ sót lỗi Vite dev
  interop, select hồ sơ lệch trạng thái và SSE named-event parse sai.
- Review UI phải mở URL trực tiếp bằng vai trò không phải owner, kiểm cả hành vi khi quyền bị chặn;
  không chỉ bấm đường dẫn đã hiện trên màn hình.
- Ảnh full-page của Playwright có thể đặt thanh điều hướng cố định ở giữa trang; xem thêm ảnh viewport
  ở vị trí cuộn thật trước khi kết luận lỗi z-index/che khuất.
- Cổng visual cần ma trận viewport + chữ lớn, và kiểm tính nhất quán trên nhãn (tỷ lệ mẫu, hai đầu
  trục cùng giờ, định dạng ngày) — đây là lỗi test chức năng không bắt.

## Vận hành cục bộ

- PGlite nằm ở `.data/pglite` của root repository, không phải `apps/api/.data`. Trước khi seed hoặc
  chụp ảnh, xác nhận chỉ còn **một** tiến trình API và đúng đường dẫn DB; không suy ra từ health 200.
- Dừng API bằng Ctrl+C. Kill cứng có thể làm hỏng DB; dữ liệu demo seed lại được nhưng không được báo
  test xanh khi DB chưa mở.

## Báo cáo

- Lỗi không tái hiện thì ghi "chưa kết luận", không sửa mò và không đóng finding giả.
- Chạy lại toàn bộ cổng sau thay đổi cuối, không dùng kết quả của lần chạy trước đó.

## v2 (49 phiên)

- **Spec trước, phiên sau:** mỗi worker cần phạm vi file được ghi, file cấm, DB/cổng riêng, lệnh phải
  chạy và mẫu handoff. Reviewer chỉ đọc, không commit; feature/fix commit nhánh riêng. Lead giữ file ghép
  toàn cục và chỉ merge sau khi đọc diff.
- **Reviewer độc lập bắt lỗi test xanh không bắt:** sự kiện cũ sang chủ mới, Studio trước `sharedFrom`,
  daily-summary cộng bước bắc gap, claim code cho thiết bị đang gán. Không thay review bằng test.
- **`pnpm build` sau mỗi merge CSS:** Vite dev có thể vẫn chạy với cú pháp CSS hỏng; chỉ production build
  mới fail. Build là cổng bắt buộc, không chỉ typecheck.
- **Conflict phải giữ cả hai semantics:** publish vs quarantine test, health permission vs history
  performance, a11y chart vs downsample. Giải xong phải chạy test của cả hai bên.
- **Randomize và StrictMode tạo fail giả:** audit toàn cục phải scope `targetId`; request lặp dev-only
  không được biến thành assertion “đúng 2 request”. Sửa test theo ý định, không nới hành vi.
- **Visual gate sau cùng:** mở vai trò caregiver/admin, 390/360/chữ lớn; kiểm nút disabled có lý do,
  link đúng vai trò, badge mobile, tràn ngang. Ảnh full-page có thể đặt nav sai vị trí.

## v3 (trợ lý trung tâm)

- **IA là yêu cầu sản phẩm, không phải chi tiết UI:** đổi route mặc định (`/app` → trợ lý, dashboard → `/app/overview`) phải được test ở router, nav, sau đăng nhập và E2E; không chỉ đổi nhãn menu.
- **Kiểm hành động chính trong viewport đầu:** ảnh 390/360 phải thấy ô hỏi + nút Gửi, không chỉ `scrollWidth == clientWidth`. Đo bounding box so với bottom-nav; ẩn page lead/hint nếu cần, không đẩy hành động xuống dưới.
- **State gắn hồ sơ phải reset theo `subjectId`:** thread, câu hỏi, lỗi và mutation đang chờ. Bỏ phản hồi muộn bằng ref; test cả “đổi hồ sơ” và “phản hồi về sau khi đổi”.
- **403 là trạng thái quyền:** không hiển thị “Thử lại” vô ích; khóa gửi câu hỏi, giải thích thiếu `canViewMeasurements`; không gọi API cảnh báo khi thiếu `canReceiveAlerts`.
- **Bỏ copy demo nhưng giữ nguồn dữ liệu:** “Bản demo/đồ án/giảng viên/nghiệm thu” không được có trong text/metadata/aria-label web; “Dữ liệu mô phỏng” vẫn phải có ở nơi hiển thị số đo. Không đánh đổi trung thực dữ liệu để giống sản phẩm.
- **Worker có thể over-polish cuối phiên:** theo dõi token/context; gửi lệnh “dừng polish, chạy gates, commit/handoff” trước khi hết ngân sách. Lead phải tự kiểm ảnh và build sau merge.
- **Vault Obsidian NFC/NFD:** kiểm đường dẫn thực bằng Python; không kết luận thiếu tài liệu khi có hai cây Unicode cùng tên.
