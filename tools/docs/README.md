# Sinh tài liệu HTML ngoại tuyến

Mở [docs/html/index.html](../../docs/html/index.html) bằng trình duyệt. Trang gồm các chương thiết kế và yêu cầu nền tảng AI/cấu hình động, nguyên tắc phát triển, ADR, review, cấu trúc dự án/trách nhiệm từng thư mục và ba payload JSON mẫu. Có mục lục theo chương, tìm nội dung không phân biệt dấu tiếng Việt, điều hướng bàn phím và kiểu trình bày khi in/lưu PDF.

HTML chứa sẵn nội dung, CSS và JavaScript; không gọi CDN, font mạng, API hoặc dịch vụ tìm kiếm. Sao chép riêng `index.html` vẫn đọc, tìm kiếm và in được; các liên kết “nguồn Markdown”/JSON cần giữ repository đi kèm. Khi JavaScript tắt, toàn bộ nội dung và mục lục vẫn đọc được; tìm kiếm/nút in chỉ xuất hiện khi JavaScript hoạt động. Có thể dùng chức năng in của trình duyệt.

## Cập nhật nội dung

Markdown trong `docs`, README các thư mục và JSON trong `packages/contracts/examples` là nguồn. Chỉnh nội dung tại nguồn, rồi sinh lại HTML; không sửa trực tiếp file đầu ra. Danh sách chương và ánh xạ liên kết nằm trong `build.py`; giao diện ở `template.html`, `style.css`, `app.js`.

Python 3.10+ và dependency được ghim trong `requirements.txt` chỉ cần cho bước sinh. Máy đọc HTML không cần cài Python hoặc Node.js.

Tại thư mục gốc repository, trên Windows/PowerShell:

```powershell
python -m venv tools/docs/.venv
& 'tools/docs/.venv/Scripts/python.exe' -m pip install -r tools/docs/requirements.txt
& 'tools/docs/.venv/Scripts/python.exe' tools/docs/build.py
& 'tools/docs/.venv/Scripts/python.exe' tools/docs/build.py --check
```

Trên Linux/macOS dùng bash:

```bash
python3 -m venv tools/docs/.venv
tools/docs/.venv/bin/python -m pip install -r tools/docs/requirements.txt
tools/docs/.venv/bin/python tools/docs/build.py
tools/docs/.venv/bin/python tools/docs/build.py --check
```

Thư mục `.venv` đã được loại khỏi Git. HTML đầu ra được giữ trong repository để mở trực tiếp. `--check` không ghi file, kiểm liên kết/ID và phát hiện HTML chưa cập nhật theo nguồn, kể cả thay đổi CSS/JS/template.

## Sơ đồ và kiểm chứng

Ba khối Mermaid hiện có được chuyển thành các luồng quan hệ HTML có hướng và nhãn, giữ đầy đủ các cạnh của sơ đồ nguồn. Người đọc có thể mở mã Mermaid gốc bên dưới. Bộ sinh chỉ hỗ trợ cú pháp đang dùng: `flowchart LR`, `stateDiagram-v2`, `erDiagram` với quan hệ `1 → 0..n`; cú pháp mới chưa hỗ trợ sẽ làm build lỗi rõ ràng, không âm thầm bỏ cạnh.

Khi sửa công cụ, kiểm syntax Python/JavaScript trước, chạy build và `--check`, rồi kiểm hành vi trình duyệt thực sự thay đổi: anchor, tìm có/không dấu, bàn phím, mục lục màn hình nhỏ, bảng cuộn ngang và print. Kiểm HTML không chứng minh ứng dụng IoT hoặc firmware đã hoạt động.

Bốn phát hiện trong [review thiết kế](../../docs/reviews/01-thiet-ke-v0.1.md) vẫn chưa được sửa trong đặc tả. Việc bổ sung bản HTML không thay trạng thái của chúng.
