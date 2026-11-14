# Đồ án sức khỏe IoT

**Hệ thống Giám sát sức khỏe và Cảnh báo té ngã cho Người cao tuổi ứng dụng IoT và Trợ lý (AI).**

Hệ thống gồm thiết bị ghi nhận nhịp tim/vận động, nền tảng theo dõi cho người dùng và người thân, luồng cảnh báo té ngã có xác nhận. Yêu cầu bổ sung: AI thực hiện nghiệp vụ và tự chạy trong phạm vi được giao, cùng web/app có cấu hình động và giao diện thao tác thông thường.

**Trạng thái ngày 11/11/2026:** có thiết kế IoT v0.1, khung thư mục, yêu cầu nền tảng AI/cấu hình động và đặc tả đề xuất chi tiết về thực thi AI. Đã dùng Codex review độc lập và bổ sung quy tắc cho bốn khoảng trống thiết kế tìm được. Chưa có mã ứng dụng, firmware chạy được, thiết bị đã kiểm chứng hoặc kết quả thử nghiệm sản phẩm. Hướng nền tảng và các lựa chọn công nghệ còn cần chốt; không coi baseline v0.1 là đặc tả đầy đủ cho AI thực thi.

## Bắt đầu đọc

**[Mở bộ tài liệu HTML](docs/html/index.html)** — đọc ngoại tuyến, tìm kiếm không dấu, xem sơ đồ và in/lưu PDF. Bản HTML gồm thiết kế, review, cấu trúc và payload; được sinh từ các nguồn Markdown/JSON. [Cách cập nhật HTML](tools/docs/README.md).

1. [Tổng quan và ý tưởng](docs/01-tong-quan-va-y-tuong.md): bài toán, các phương án và hướng đề xuất.
2. [Yêu cầu và phạm vi](docs/02-yeu-cau-va-pham-vi.md): MVP, vai trò, tiêu chí chấp nhận.
3. [Kiến trúc hệ thống](docs/03-kien-truc-he-thong.md): thành phần, luồng cảnh báo và công nghệ ứng viên.
4. [Mục lục tài liệu](docs/README.md): dữ liệu/API, phần cứng, màn hình, AI, kiểm thử và hồ sơ.
5. [Nền tảng AI, web/app và cấu hình động](docs/11-nen-tang-ai-va-cau-hinh-dong.md): yêu cầu mới, ranh giới AI sửa backend, preview frontend và phương án cần chốt.
6. [Nguyên tắc phát triển và bằng chứng](docs/12-nguyen-tac-phat-trien-va-bang-chung.md): luôn cập nhật docs, đọc đúng version, tái sử dụng và kiểm tác động xuyên module.
7. [Đặc tả thực thi AI và cấu hình](docs/13-dac-ta-thuc-thi-ai-va-cau-hinh.md): quyền/ủy quyền, run/step, retry, preview/publication, trigger/scheduler, ranh giới code và 17 phép kiểm đề xuất.
8. [Review nền tảng AI](docs/reviews/02-nen-tang-ai-va-cau-hinh-dong.md): 1 P1 và 3 P2, tình huống lỗi, cách bổ sung đặc tả và bằng chứng còn cần kiểm.

## Khung thư mục

```text
DATN/
├── apps/
│   ├── web/                 # Web responsive cho người dùng, người thân, admin
│   └── api/                 # Backend nghiệp vụ, tiếp nhận dữ liệu, cảnh báo
├── firmware/               # Chương trình trên thiết bị IoT
├── hardware/               # BOM, sơ đồ mạch, kết quả khảo sát cơ khí/nguồn
├── packages/contracts/     # Hợp đồng dữ liệu và payload minh họa
├── infra/                  # Cấu hình môi trường và triển khai dự kiến
├── tools/
│   ├── simulator/          # Công cụ mô phỏng thiết bị dự kiến
│   └── docs/               # Công cụ sinh và kiểm bản HTML từ Markdown/JSON
├── tests/                  # Quy ước và kịch bản kiểm thử liên thành phần
├── data/                   # Quy ước dữ liệu mẫu/thử nghiệm
├── reports/                # Báo cáo, hình, tài liệu bảo vệ
└── docs/                   # Nguồn chính của thiết kế kỹ thuật
    └── html/index.html     # Bản đọc ngoại tuyến được sinh từ nguồn
```

Các thư mục hiện có README nêu trách nhiệm và điều kiện bắt đầu. Payload trong `packages/contracts/examples/` là dữ liệu tổng hợp để trao đổi thiết kế; chưa phải bộ dữ liệu đo. Chưa tạo package manifest, lockfile hay lệnh chạy giả khi framework/version chưa được chốt.

## Hướng đề xuất

- Prototype tại nhà dùng Wi-Fi; web responsive là giao diện đầu tiên.
- Kiểm chứng vị trí đeo, IMU và tín hiệu nhịp tim trước khi chốt vỏ thiết bị.
- Backend dạng modular monolith, database quan hệ, giao tiếp thiết bị có định danh và chống xử lý trùng.
- Cảnh báo hoạt động độc lập với AI. Baseline có tóm tắt dữ liệu; hướng mới bổ sung AI thực thi qua Business Tools dùng chung với UI, được kiểm quyền và ghi lịch sử.
- Đề xuất lõi nền tảng dùng chung, lấy sức khỏe IoT làm ứng dụng hoàn chỉnh đầu tiên; phạm vi tổng quát và mức sinh code chưa chốt.
- Bản demo đầu tiên dùng dữ liệu mô phỏng, thể hiện đủ mất mạng, báo nhầm và xác nhận cảnh báo.

## Nguồn và cách tiếp tục

Đề cương gốc cùng kế hoạch có trạng thái nằm trong dự án **Đồ án sức khỏe IoT** ở Obsidian. [Nguồn và điều chưa xác minh](docs/10-nguon-va-cau-hoi-mo.md) ghi đường dẫn, tài liệu đã đọc và thông tin còn thiếu. `docs` là nguồn chính cho kỹ thuật; không duy trì checklist tiến độ thứ hai tại repository.

Bước tiếp theo là chốt phạm vi nền tảng, ranh giới tự chủ và cấu hình động, đối chiếu yêu cầu của trường/linh kiện, rồi cập nhật đồng bộ đặc tả trước khi triển khai. [Lộ trình v0.1](docs/09-lo-trinh-va-ho-so.md) là baseline IoT; [chương 11](docs/11-nen-tang-ai-va-cau-hinh-dong.md) bổ sung bằng chứng cần trình diễn cho hướng AI thực thi.
