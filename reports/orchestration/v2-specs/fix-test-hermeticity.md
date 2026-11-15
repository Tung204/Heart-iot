# Fix worker — test API độc lập thứ tự và không đụng môi trường thật

Bạn là worker sửa test trên worktree riêng. Đọc `AGENTS.md`, `reports/qa/v2-chat-luong-kiem-thu.md` Q-01/Q-02/Q-06/Q-07/Q-09, `apps/api/test/test-app.ts`, `jest.config.cjs`, `package.json`, các spec liên quan.

Chỉ sửa: `apps/api/test/**`, `apps/api/jest.config.cjs`, `apps/api/package.json` (script test), có thể `.env.test`/setup test; **không sửa code ứng dụng** trừ khi phát hiện bug thật (báo handoff, không tự sửa rộng). Không sửa web/docs. Cài dependency/build contracts.

Yêu cầu:
- Test API phải chạy đúng khi `--randomize` (ít nhất 3 seed khác nhau), không phụ thuộc thứ tự suite/test; cô lập user/admin/policy/session/AI giữa các suite; dọn DB/temp sau mỗi suite.
- Không đọc `.env` thật/DATABASE_URL/AI_*/MQTT_URL khi test: setup môi trường test trước `loadEnv`, dùng DB tạm/in-memory, tắt outbox timer/fake adapter mặc định; test không gọi mạng ngoài.
- Thêm test cho T-03 (chuyển thiết bị A→B/quarantine) và T-07 (outbox retry/backoff/restart) nếu code hiện có đủ; nếu thiếu API/khả năng, ghi rõ lỗ hổng và test mức thấp nhất trung thực, không giả lập qua mặt.
- Thêm kiểm tra thời gian/timezone không “bom hẹn giờ” (2027) — dùng fake timers/ngày tương đối; không nới assertion.
- Chạy: API suite thường + `--randomize --seed` 3 lần; ghi output thật và số test. Nếu còn fail, không che; báo rõ.
- Handoff `reports/handoffs/v2-fix-test-hermeticity.md`; commit nhánh riêng. Báo commit hash, seeds, test counts, việc chưa làm.
