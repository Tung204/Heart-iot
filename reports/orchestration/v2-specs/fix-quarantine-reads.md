# Fix worker — chặn telemetry cách ly ở trợ lý và Studio

Bạn là worker sửa lỗi trên worktree riêng. Đọc `AGENTS.md`, `reports/qa/v2-data-integrity.md` P1-1/P1-2, `reports/handoffs/v2-fix-ingest-quarantine.md`, code `assistant.service.ts`, `studio.service.ts`.

Chỉ sửa: `apps/api/src/assistant/assistant.service.ts`, `apps/api/src/studio/studio.service.ts`, test assistant/studio tương ứng. Không sửa ingest/measurements/devices/contracts/app.module/web. Cài dependency/build contracts; test assistant+studio + typecheck.

Yêu cầu:
- Mọi truy vấn telemetry trong assistant summary/ask và Studio data lọc `is_quarantined = false`; chỉ dùng `measured_at` đã đồng bộ, không lấy mẫu tương lai (<= now) khi tổng hợp.
- Nếu tất cả mẫu bị loại, trả “không có dữ liệu”/empty đúng hợp đồng, không bịa 0 hoặc average.
- Thêm test: mẫu quarantine + mẫu tương lai không lọt summary/ask/Studio; mẫu hợp lệ vẫn có; coverage/last values không đổi với dữ liệu sạch.
- Không đổi contract/shape trừ khi bắt buộc (ghi handoff).
- Handoff `reports/handoffs/v2-fix-quarantine-reads.md`; commit nhánh riêng. Báo commit hash, test counts, rủi ro.
