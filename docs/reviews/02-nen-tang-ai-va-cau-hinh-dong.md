# Review nền tảng AI và cấu hình động

Ngày review: **11/11/2026**. Phạm vi: chương 11/12, chương 13 được bổ sung trong lượt làm việc và các tài liệu liên quan. Reviewer độc lập: **Codex qua Orca**, chỉ đọc repository, không sửa file hoặc Obsidian. Mã tham chiếu lượt review: `task_482d295c05c3`; lượt đối chiếu bản sửa: `task_d803cc75023c`.

Kết quả lượt đầu: **4 khoảng trống thiết kế — 1 P1, 3 P2**. Agent chính đã bổ sung quy tắc và cách kiểm. **Lượt review độc lập thứ hai xác nhận cả bốn điểm được xử lý ở mức đặc tả; không phát hiện P1/P2 còn lại trong đúng các phần sửa được giao.** Đây không phải review lại toàn repository. **Chưa có triển khai hoặc bằng chứng runtime; “đã bổ sung đặc tả” không có nghĩa “test đạt” hay quyết định kỹ thuật đã được người dùng duyệt.**

Mức P1/P2 chỉ mức cần xử lý trước khi triển khai năng lực tương ứng. Không mô tả đây là lỗ hổng đã được tái hiện trên một sản phẩm đang chạy. Vị trí dòng bên dưới thuộc bản được review lần đầu; sau bổ sung, số dòng có thể thay đổi. Dùng liên kết tới chương và tên mục để đọc bản hiện tại.

## AI-R01 — P1: branch không cô lập việc chạy code chưa duyệt

**Vị trí lúc phát hiện:** `docs/11-nen-tang-ai-va-cau-hinh-dong.md:54`, đối chiếu dòng 49/52 và `docs/13-dac-ta-thuc-thi-ai-va-cau-hinh.md:160`, 163, 167.

**Tình huống:** Coding Agent tạo code trong một branch rồi chạy build/test trước review. Máy chạy vẫn có credential developer hoặc đường ghi production. Script test, cài dependency hoặc migration có thể đọc secrets, gửi dữ liệu hoặc thay production ngay trước bước phát hành. Tách credential của AI runtime không bảo vệ tiến trình build/test này.

**Bổ sung đặc tả:** [chương 11 — AI có nên sửa backend](../11-nen-tang-ai-va-cau-hinh-dong.md) tách branch quản lý diff khỏi môi trường thực thi. [Chương 13, mục 7](../13-dac-ta-thuc-thi-ai-va-cau-hinh.md) đặt điều kiện filesystem/process, credential, database và network; đường release có quyền riêng và chỉ phát hành artifact đã duyệt. Áp dụng nếu chọn Coding Agent trong sản phẩm; không tự đưa sandbox vào phạm vi đã cam kết.

**Cách kiểm khi có triển khai:** AI-17 dùng canary file/secret ngoài scope và endpoint giả lập production. Code chưa duyệt phải bị chặn truy cập trong khi build/test bằng fixture tổng hợp vẫn chạy. Lưu cấu hình và quyền thực tế của tiến trình, không lấy tên branch làm bằng chứng cô lập.

**Trạng thái:** đã bổ sung điều kiện thiết kế; chưa chọn cơ chế sandbox và chưa chạy kiểm cô lập.

## AI-R02 — P2: retry request đầu có thể tạo hai run

**Vị trí lúc phát hiện:** `docs/13-dac-ta-thuc-thi-ai-va-cau-hinh.md:105`, 190, 201; đối chiếu AI-05 ở dòng 242.

**Tình huống:** `POST /agent-runs` đã commit nhưng response mất; client chưa có run/operation ID do server cấp. Retry bị coi là yêu cầu mới, tạo hai run; mỗi run chống trùng operation đúng nhưng cả hai cùng thực hiện nhiệm vụ. Dedup bên trong run chưa chặn trùng ở cửa nhận việc.

**Bổ sung đặc tả:** [chương 13, mục 5 và 9](../13-dac-ta-thuc-thi-ai-va-cau-hinh.md) yêu cầu `request_key` có trước lần gửi đầu; server xác định scope, kiểm fingerprint và ghi ánh xạ key → run/operation cùng transaction. Retry cùng ý định trả cùng run sau kiểm quyền; cùng key khác input bị conflict. Scheduler/event handler có khóa occurrence/trigger/generation ổn định. Không tự đổi key vì timeout.

**Cách kiểm khi có triển khai:** AI-05 làm mất response sau commit tạo run, retry cùng request và cho hai request đến đồng thời; xác nhận đúng một run và một chuỗi tác động. Kiểm key trùng khác payload bị từ chối, yêu cầu độc lập có key khác được phân biệt. Sau đó mới kiểm dedup từng bước và hai worker cùng operation.

**Trạng thái:** đã bổ sung invariant nhận việc; vị trí truyền request key, schema lưu và thời hạn retry còn cần chốt cùng API/database. Chưa chạy test.

## AI-R03 — P2: workflow có thể tạo chuỗi run không giới hạn

**Vị trí lúc phát hiện:** `docs/13-dac-ta-thuc-thi-ai-va-cau-hinh.md:118`, 151; đối chiếu dòng 33 và AI-15 ở dòng 252.

**Tình huống:** trigger “công việc được tạo” gọi action tạo công việc, hoặc hai workflow kích hoạt lẫn nhau. Mỗi run chỉ vài bước; ID event và operation mới nên per-run budget, dedup và giới hạn vòng lặp nội bộ đều không ngăn chuỗi run tăng liên tục.

**Bổ sung đặc tả:** [chương 13, mục 5](../13-dac-ta-thuc-thi-ai-va-cau-hinh.md) giữ root/parent/causation từ server; đề xuất chặn self-trigger/re-entry mặc định và kiểm chu kỳ có thể xác định khi publish. Quota delegation/root execution được kế thừa, reserve atomically qua các run; quota workspace bổ sung giới hạn khi mất correlation hoặc có nhiều nguồn độc lập. Run con không tự reset ngân sách. Tác động chưa xác định không được hoàn quota như chắc chắn chưa thực hiện.

**Cách kiểm khi có triển khai:** AI-15 có self-trigger, A/B kích hoạt qua lại, giao event lặp và worker đồng thời. Chuỗi phải bị chặn theo policy; audit truy về gốc, số run/tác động không tăng ngoài quota. Kiểm đường cảnh báo IoT vẫn chạy độc lập với ngân sách model.

**Trạng thái:** đã bổ sung phạm vi kiểm xuyên run; hạn mức, cửa sổ thời gian và chính sách re-entry còn là quyết định mở. Chưa có runtime test.

## AI-R04 — P2: callback lịch cũ có thể chạy sau publication mới

**Vị trí lúc phát hiện:** `docs/13-dac-ta-thuc-thi-ai-va-cau-hinh.md:132`, 145; đối chiếu dòng 95/118 và AI-11 ở dòng 248.

**Tình huống:** v2 đã bỏ lịch nhưng callback v1 đang trong queue đến muộn và chưa có run. Quyền người giao việc vẫn hợp lệ; v1 vẫn chạy được. Pin version cho run đang chạy không bao phủ callback chưa tạo run, nên lịch đã bỏ vẫn phát sinh tác động mới.

**Bổ sung đặc tả:** [chương 13, mục 6](../13-dac-ta-thuc-thi-ai-va-cau-hinh.md) định nghĩa activation generation, mốc hiệu lực và occurrence ID. Khi tạo run phải kiểm generation atomically với nguồn publication và dedup occurrence. Callback stale bị chặn; event publication đến đảo thứ tự không làm lùi active generation. Phân biệt callback, run chưa dispatch và run đã dispatch; lần dispatch đầu cũng kiểm generation/fencing. Rollback nội dung tạo generation mới.

**Cách kiểm khi có triển khai:** AI-11 cho callback v1 đến sau v2 bỏ trigger, đảo event publication, restart scheduler và chạy race giữa publish/dispatch đầu. Không tạo run từ activation hết hiệu lực; run cũ giữ/dừng theo policy đã được công bố, không chuyển ngầm version.

**Trạng thái:** đã bổ sung policy baseline hủy run cũ chưa dispatch và cho run đã dispatch kết thúc/đối soát trong quyền còn hiệu lực. Policy vẫn là đề xuất; cơ chế atomic/fencing phụ thuộc stack, chưa được kiểm.

## Những điểm đã có trước khi trả findings

Reviewer đã đối chiếu chương 13 và không tiếp tục liệt kê các điểm sau thành khoảng trống mở: tách principal/delegation/approver; kiểm quyền trước đọc/gửi model/ghi/giao kết quả; approval gắn target/digest/version; `unknown` và đối soát; worker lease, cancel và pin version; preview chặn tác động thật; CAS publication; dependency làm preview stale; provenance và quyền hiện tại của memory/cache/artifact.

Các nội dung đó mới được làm rõ trên giấy. Chúng cần contract và bằng chứng kiểm tương ứng sau khi chọn stack; việc reviewer không phát hiện vấn đề không chứng minh an toàn hoặc hoàn chỉnh tuyệt đối.

## Kết quả đối chiếu bản sửa

Codex đối chiếu chương 11/13 và ma trận kiểm, xác nhận các cặp: AI-R01 → AI-17 (cô lập thực thi), AI-R02 → AI-05 (chống trùng lúc nhận yêu cầu), AI-R03 → AI-15 (lineage và hạn mức xuyên run), AI-R04 → AI-11 (activation generation và cutover lịch).

Reviewer cũng đối chiếu vòng đời liên quan: `suspended` chặn dispatch mới; nhánh độc lập vẫn có thể tiếp tục khi một step chờ; hết hạn đối soát giữ step `unknown` và lịch sử; version bị vô hiệu hóa không được âm thầm thay thế. Không phát hiện mâu thuẫn P1/P2 mới giữa các quy tắc này và policy cho run chưa/đã dispatch.

Phần hiện thực hóa còn phụ thuộc stack/policy được chốt: transaction/constraint/fencing, thời hạn request key, giá trị và cách lưu quota, timezone/backlog của lịch, môi trường cô lập. Đây là công việc triển khai còn lại, không phải kết quả đã kiểm và cũng không phải findings mới của lượt đối chiếu.

## Phạm vi kiểm chứng và phần còn mở

- Reviewer thực hiện đọc/tìm kiếm đối chiếu tài liệu; không chạy ứng dụng, firmware, thiết bị hoặc test runtime.
- Agent chính bổ sung chương 13, mẫu hồ sơ bằng chứng ở chương 12 và đồng bộ mục lục/nguồn/HTML. Kiểm ngày 11/11/2026: syntax Python của bộ sinh đạt; build và `--check` đạt với **271 liên kết, 169 ID duy nhất, 18 phần**. Kiểm riêng **30 file Markdown, 125 liên kết file nội bộ và 3 JSON mẫu**: file đích tồn tại, JSON parse được. Phép kiểm file không xác minh URL bên ngoài hoặc fragment heading Markdown; bộ sinh kiểm anchor của HTML đầu ra.
- Trình duyệt local HTTP: kiểm bằng DOM hai chương mới trong mục lục, truy vấn không dấu theo mục cụ thể và điều hướng/focus kết quả; trang không tràn ngang ở 1280px và 390px. Ở 390px, menu đóng sau chọn chương; 15 bảng chương 13 có vùng cuộn riêng. Cửa sổ ở nền (`visibilityState=hidden`), nên tải mới trang sau đổi viewport; không coi các sự kiện DOM là kiểm thao tác chuột hoặc resize trực tiếp. Tìm kiếm hiện chỉ hiển thị tám mục đầu; truy vấn rộng có thể chưa đưa mục cần tìm vào danh sách đó. Đây là kiểm HTML tài liệu, không phải duyệt frontend sản phẩm hoặc kiểm runtime AI.
- Không khóa framework, tenant, hạn mức, hành động tự chủ hoặc Coding Agent chỉ để đóng findings. Đây vẫn là phương án cần chốt.
- Bốn findings IoT trong [review v0.1](01-thiet-ke-v0.1.md) vẫn mở; review này không thay thế hoặc đóng chúng.

Khi triển khai, nối AI-R01…AI-R04 với AI-17, AI-05, AI-15 và AI-11; lưu expected/actual, version và số tác động thật theo [nguyên tắc bằng chứng](../12-nguyen-tac-phat-trien-va-bang-chung.md). Tài liệu nguồn vẫn là nơi giữ chi tiết kỹ thuật; kế hoạch có trạng thái nằm ở Obsidian.

[Mục lục tài liệu](../README.md) · [Đặc tả thực thi AI](../13-dac-ta-thuc-thi-ai-va-cau-hinh.md).
