# Web responsive

Nơi triển khai giao diện người được theo dõi, người thân và admin. **Hiện chưa có mã ứng dụng hoặc lệnh chạy.** React + TypeScript + Vite là ứng viên, chưa khóa version.

Nguồn thiết kế: [yêu cầu](../../docs/02-yeu-cau-va-pham-vi.md), [màn hình](../../docs/06-trai-nghiem-va-man-hinh.md), [API](../../docs/04-du-lieu-va-giao-tiep.md).

Sau khi chốt framework, tổ chức theo chức năng `auth`, `subjects`, `devices`, `measurements`, `alerts`, `sharing`, `assistant`, `admin`; phần dùng chung gồm API client, thành phần giao diện và định dạng thời gian/đơn vị. Không tạo các thư mục source rỗng trước khi có lát cắt triển khai.

Ưu tiên demo đọc dữ liệu, trạng thái cũ/offline và xác nhận cảnh báo. Không tính quyền truy cập chỉ ở giao diện; backend là nơi thực thi quyền. Trạng thái đang tải, rỗng, mất mạng, thiếu quyền và dữ liệu mô phỏng cần rõ ràng.
