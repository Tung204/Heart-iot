# Fix worker — cách ly telemetry lệch giờ/ngoài assignment

Bạn là worker sửa lỗi trên worktree riêng (HEAD đã gồm xu hướng 7/14/30). Đọc `AGENTS.md`, `reports/qa/v2-data-integrity.md` P1-1/P1-2/P2-3, `docs/03`, `docs/04`, `docs/08` T-03/T-04, code ingest/measurements/insights/devices/schema/contracts.

Chỉ sửa: `packages/contracts/src/telemetry.ts`, `apps/api/src/ingest/**`, `apps/api/src/measurements/measurements.service.ts`, `insights.ts`, `measurements.controller.ts` nếu cần, `apps/api/src/config/env.ts`, `.env.example`, `apps/api/test/ingest.spec.ts`, `measurements.spec.ts`, `insights.spec.ts`. Không sửa devices.service (worker khác), incidents/notifications, app.module, web, migration. Cài dependency/build contracts; chạy 3 test file + typecheck.

Yêu cầu:
1. Contract: từ chối `clock_status='synced'` + `measured_at=null`; chỉ unsynced được null. Không phá payload hợp lệ/simulator.
2. Ingest: `measured_at` tương lai quá dung sai (env `MAX_CLOCK_SKEW_SECONDS`, mặc định 120, 0..3600) → lưu **quarantine** (`is_quarantined=true`) hoặc từ chối 422; không đưa vào đọc. Ghi audit/log protocol error, không lộ dữ liệu sức khỏe.
3. Assignment: chỉ chấp nhận mẫu có `measured_at` nằm trong khoảng assignment đang mở/assignment phù hợp (`started_at <= measured_at`, và không trước assignment đầu tiên); mẫu trước assignment/không chắc → quarantine, không gán cho chủ mới. Không chuyển dữ liệu cũ sang hồ sơ mới.
4. Tất cả đường đọc telemetry (`measurements` list, `daily-summary`, `export.csv`, `insights`) **loại `is_quarantined=true`** và không tính `measured_at > now`; sửa `computeCoverage/gaps` để không đếm mẫu bị loại. Nếu mẫu unsynced bị loại, giữ semantics gap hiện có (worker sau sẽ thêm lý do).
5. `daily-summary` hôm nay chỉ tính tới `min(to, now)` cho mọi phép tính (kể cả incidents? giữ incidents theo ngày; chỉ telemetry).
6. Test: synced+null 422; future accepted-but-quarantined/422 và không xuất hiện list/daily/insights/status; mẫu trước assignment bị quarantine; mẫu trong assignment vẫn đọc; export/insights không lộ; mẫu future không làm coverage >100 hay lastSeen tương lai.
7. Không đổi semantics endpoint measurements/daily-summary khác ngoài các lỗi trên; giữ test cũ xanh.
Handoff `reports/handoffs/v2-fix-ingest-quarantine.md`; commit nhánh riêng. Báo commit hash, test counts, quyết định 202-quarantine hay 422, file lead cần biết.
