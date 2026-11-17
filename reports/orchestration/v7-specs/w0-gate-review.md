# v7 W0 gate — phản biện thiết kế và inventory trước khi triển khai

Bạn là reviewer độc lập (không sửa code, không sửa thiết kế). Mục tiêu: kiểm hai đầu ra W0 có đủ để chia implementation mà **không mất chức năng, quyền, hoặc trạng thái**, và có mâu thuẫn với yêu cầu người dùng không.

## Đọc

- `reports/orchestration/v7-specs/mandate.md` (yêu cầu gốc)
- `reports/orchestration/v7/design-system.md`
- `reports/orchestration/v7/implementation-plan.md`
- `reports/orchestration/v7/migration-inventory.md`
- `reports/orchestration/v7-specs/w1-foundation.md` (đã dispatch, cùng lúc với bạn)
- `reports/qa/v6-review.md`

Đối chiếu với source thật khi cần: `apps/web/src/app/router.tsx`, `AppShell.tsx`, `features/*/api.ts`, các test colocated, `docs/06`. Không tin báo cáo; chỉ kết luận khi thấy đường dẫn/dòng.

## Đầu ra (chỉ 1 file)

`reports/orchestration/v7/w0-gate-review.md`, gồm:

1. **Bảng phủ route → nhiệm vụ → logic/quyền phải giữ → nơi thiết kế đã mô tả.** Nêu route/capability nào **thiếu** trong design-system hoặc implementation-plan (ví dụ: notifications mark-read, tasks không có lối vào, Studio trực tiếp, policy/audit, invite/404, share/contacts, archive/deletion, sessions thu hồi).
2. **Xung đột/yêu cầu người dùng bị vi phạm** (nếu có): nav ≠ 4 mục, có “Thêm”, brand tự đặt, card hồ sơ full-width, dữ liệu giả, mất cảnh báo độc lập AI, target <44px, copy jargon. Dẫn chỗ cụ thể trong tài liệu.
3. **Rủi ro triển khai** trong cách chia file của plan: chỗ hai lane cùng ghi một file, phụ thuộc vòng, primitive contract chưa đủ cho lane, CSS retire dễ làm hỏng feature. Đề xuất sửa cụ thể (đổi ownership/thứ tự/contract), không viết lại cả plan.
4. **Cổng kiểm W1 có đo được không**: mỗi mục trong `w1-foundation.md` §Cổng kiểm có lệnh/tiêu chí rõ chưa; thiếu thì bổ sung đề xuất.
5. **Danh sách việc phải chốt trước khi mở W2** (tối đa 8 mục, có thứ tự).

Quy tắc: không quota số finding, không viết “đạt/pass”. Finding nào cũng có mức P1/P2/P3 + bằng chứng (file:dòng hoặc trích đoạn). Không sửa code/test/tài liệu khác; không commit vào master; không ghi Obsidian. Commit file báo cáo trên branch riêng, rồi `worker_done` với tóm tắt thật và model/provider đã dùng.
