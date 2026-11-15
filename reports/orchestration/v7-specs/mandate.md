# v7 — xây lại toàn bộ giao diện

## Yêu cầu đã xác nhận

Ngày 15/11/2026, sau khi v6 thay một số khu vực, người dùng yêu cầu: **“bây giờ bỏ giao diện đi, xây mới lại hoàn toàn”**. Đây là thay thế toàn bộ presentation layer, không phải tiếp tục vá copy/CSS v4/v6. Không coi UI đang có hoặc test xanh là thiết kế được chấp nhận.

Người dùng chọn **Pi với provider `dola`, model `gpt-6.1-sol`** cho các sub-session. Mọi thiết kế, giải pháp, phân chia việc và phản biện thực hiện qua sub-session. Lead điều phối, ghi quyết định công khai, ghép và kiểm chứng; không ghi suy luận nội bộ. Không cần vòng preview xin phép riêng: người dùng đã yêu cầu thay trực tiếp trên nhánh, vẫn phải tự kiểm hình ảnh trước khi hợp nhất.

## Phạm vi

- Làm mới công khai, auth, shell desktop/mobile, Hôm nay/trợ lý, cảnh báo/chi tiết, sức khỏe/lịch sử/insights, người thân/form/chia sẻ/liên hệ, thiết bị/công việc, tài khoản/phiên, invite/404, quản trị và Studio trực tiếp.
- Giữ toàn bộ năng lực nghiệp vụ hiện có. Không xóa backend, DB, dữ liệu, API client, contracts, phân quyền, query/event logic hoặc test hành vi chỉ để dựng UI sạch.
- Có thể viết lại JSX/component bố cục, design tokens và CSS; khảo sát logic dùng lại trước. Thay lớp giao diện thực sự, không chồng tiếp một stylesheet override lên đống CSS cũ. Loại bỏ stylesheet/class presentation không còn dùng theo impact map, không xóa file mù.
- Không thêm dependency/framework/ảnh stock chỉ để đổi phong cách; nếu thật sự cần phải xác minh version, tài liệu chính thức, license và chi phí trước. Không dùng dữ liệu hard-code cho số liệu sản phẩm.

## Ràng buộc từ người dùng vẫn giữ

- Không nhãn thương hiệu tự đặt “An Nhiên”; mô tả trung tính `Theo dõi sức khỏe`, package `@annhien/*` không cần đổi. Không tự đặt thương hiệu thay thế.
- Nav người dùng đúng 4 mục đã chọn: Hôm nay, Cảnh báo, Sức khỏe, Người thân; không menu `Thêm` trộn công cụ nội bộ. Account ở avatar; Studio không đưa vào menu người dùng. Chức năng phụ vẫn có đường truy cập theo ngữ cảnh rõ nghĩa.
- Không card full-width “Hồ sơ đang xem”; ngữ cảnh người đang được theo dõi phải gọn và nhất quán trên các màn, không làm dữ liệu lẫn hồ sơ.
- Tiếng Việt, ít chữ nhưng đủ nghĩa; không trang trí bằng jargon, card lặp, chú thích lặp, trạng thái an toàn giả hoặc số 0 giả. Không mang nguyên bố cục/chữ serif/nền kem hiện tại sang bản mới rồi gọi là xây lại.
- Cảnh báo độc lập AI, phân biệt stale/offline/no-data/permission; nguồn mô phỏng và giới hạn cảnh báo trong ứng dụng phải trung thực.
- Giữ accessibility: semantic heading, focus/skip link/label/error, bàn phím, reduced-motion, tương phản, target thao tác chính >=44px; kiểm 1280x900, 390x844, 360x740 và chữ lớn.

## Cổng kiểm chứng

1. Design và phản biện/migration inventory độc lập, có map màn -> hành động -> trạng thái -> logic/test cần giữ.
2. Một spec thiết kế thống nhất rồi mới chia triển khai theo quyền sở hữu file. Không để mỗi worker tự chọn một design system.
3. Typecheck trước, test nhỏ nhất cho hành vi thay đổi; không bỏ/nới test hợp lệ. Diff test phải được reviewer độc lập đọc.
4. Reviewer độc lập kiểm ảnh và hành vi trên build hợp nhất ở nhánh tích hợp trước khi đưa vào master. Không quota số finding; chỉ lỗi có bằng chứng route/viewport/expected/actual.
5. Cổng tích hợp web test/typecheck/production build/E2E, docs HTML/check; chỉ mở rộng API test khi đường ảnh hưởng hoặc cổng cuối đòi hỏi. Mỗi số liệu ghi rõ thời điểm, người chạy và giới hạn.
6. Xong phiên thì báo worker_done và release đúng tài nguyên thuộc tác vụ. Không sleep/poll worker. Không ghi ngoài workspace, không seed/ghi DB chia sẻ. Obsidian do lead cập nhật khi được phép ghi; nếu bị chặn ghi rõ, không tạo vault khác.

## Trạng thái khởi động

Baseline Git `bc10ae6`; v6 đã merge nhưng chưa có đánh giá độc lập hoàn tất. Reviewer v6 được yêu cầu kết thúc phần có bằng chứng để bàn giao rủi ro, không tiếp tục nghiệm thu UI bị thay thế. **Chưa có code v7 được triển khai tại thời điểm viết mandate này.**
