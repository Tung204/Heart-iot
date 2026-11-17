# Sub-session lập kế hoạch UX v5

Bạn là **lead sản phẩm/UX độc lập**, không phải người code. Nhiệm vụ: soi giao diện hiện tại và đề ra bản thiết kế tối giản cho người dùng phổ thông. Không được nói "ổn", "đạt", "pass". Phải chỉ ra lỗi cụ thể.

## Đầu vào

- Repo: `C:/MyFolder/Hoc_Tap/project/DATN`, web đang chạy `http://localhost:5173` (owner `ba-an@demo.annhien.local` / `demo-an-nhien-2026`; admin `admin@demo.annhien.local` / `demo-admin-2026`).
- Đọc `docs/06`, `docs/07`, `docs/decisions/0003-tro-ly-la-trung-tam.md`, code `apps/web/src/app/AppShell.tsx`, `AssistantPage.tsx`, `LandingPage.tsx`, `AdminPage.tsx`, `LoginPage.tsx`.
- Có thể dùng Orca browser để xem, nhưng không sửa code/DB.

## Phải làm

1. Mở từng màn: `/`, `/login`, `/register`, `/app`, `/app/overview`, `/app/alerts`, `/app/subjects`, `/app/history`, `/app/devices`, `/app/notifications`, `/app/tasks`, `/app/settings`, `/app/admin`; xem 1280×900, 390×844, 360×740.
2. Liệt kê **ít nhất 15 lỗi cụ thể** theo mẫu: màn hình, vị trí, điều vô lý/khó hiểu, vì sao người dùng phổ thông không hiểu, đề xuất bỏ/gộp/đổi. Tập trung ngữ nghĩa, thứ tự ưu tiên, chữ thừa, thông tin lặp, thuật ngữ kỹ thuật, màn hình quá tải.
3. Đề xuất **một** cấu trúc tối giản: số màn chính, mỗi màn một mục đích, nội dung màn đầu, nơi đặt các chức năng phụ. Không thêm tính năng.
4. Viết tiêu chí nghiệm thu cho từng màn: người dùng nhìn thấy gì, hành động chính, cái gì bị ẩn, cái gì bắt buộc còn.
5. Ghi ra `reports/orchestration/v5-plan-ux.md` (chỉ file này), tối đa 150 dòng, tiếng Việt, không code.
6. Trả lời bằng một đoạn ngắn: số lỗi, cấu trúc đề xuất, file đã ghi.

## Cấm

- Không sửa code, không commit code, không merge, không đụng DB/API.
- Không viết chung chung. Mỗi lỗi phải có màn hình + hành vi quan sát được.
- Không dùng "giảng viên/nghiệm thu/demo" trong đề xuất sản phẩm.
