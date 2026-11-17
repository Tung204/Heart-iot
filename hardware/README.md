# Hồ sơ phần cứng

Nơi lưu BOM được xác minh, sơ đồ mạch/pin mapping, thiết kế vỏ và bằng chứng đo nguồn/tín hiệu. **Hiện chưa có BOM chốt, schematic hoặc giá linh kiện.**

Các ứng viên và trình tự khảo sát nằm ở [thiết kế phần cứng](../docs/05-phan-cung-va-firmware.md).

Khi có đầu ra, tổ chức theo `bom`, `schematics`, `enclosure` và `measurements`. BOM cần mã part/module cụ thể, số lượng, nguồn datasheet, nhà cung cấp, ngày/giá, điện áp và lý do chọn. Kết quả đo cần board/firmware/config/version và điều kiện thử.

Chưa có linh kiện thì ghi “chưa xác minh”; không điền giá 0 hoặc thông số định mức của một chip thành thông số cả module. Ảnh/video lớn lưu ở nơi chia sẻ phù hợp và dẫn link đã kiểm quyền; không đưa dữ liệu nhận diện người tham gia vào Git.
