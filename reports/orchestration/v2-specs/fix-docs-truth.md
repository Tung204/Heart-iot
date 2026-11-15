# Fix worker — tài liệu khớp HEAD

Bạn là worker sửa tài liệu trên worktree riêng. Đọc `AGENTS.md`, `reports/qa/v2-docs-consistency.md` toàn bộ P1/P2, `docs/12`, `docs/14`, `tools/docs/README.md`, code/README hiện tại.

Chỉ sửa: Markdown/docs/README/example JSON/tool kiểm tra tài liệu; **không sửa code ứng dụng, schema, test ứng dụng**. Được sửa `packages/contracts/examples/*.json`, `packages/contracts/README.md`, `tests/README.md`, `docs/*.md`, `README.md`, `apps/*/README.md`, `tools/docs/*` và sinh lại `docs/html/index.html` bằng tool. Không sửa lịch sử commit.

Yêu cầu:
- Sửa P1-1..P1-5: HTML lỗi thời; README/docs/14 còn nói code-split/bundle >500k; 2 payload mẫu sai schema; docs/04 nói chưa có endpoint và liệt kê endpoint không tồn tại; docs/12/tests/README/docs/08/contracts README phủ nhận code/test/hợp đồng đã có.
- Sửa P2 hợp lý: mục 10 trùng, inventory endpoint, envelope lỗi, README web số test, `@nestjs/testing: null` (nếu là lỗi manifest, sửa `package.json` API? Đây là code manifest; được phép nếu chỉ sửa khai báo devDependency, không đổi dependency runtime), link hỏng, outbox invariant, evidence ngoài repo ghi rõ.
- Thêm kiểm tra parse **tất cả** `packages/contracts/examples/*.json` bằng schema tương ứng (script nhỏ trong `tools/docs` hoặc test tài liệu), để lỗi mẫu không tái diễn. Không cần chạy app.
- Cập nhật docs/14 trạng thái v1.1 (code-split/alert 403-404/error boundary) nhưng **không** nhận v2 feature chưa merge.
- Sinh lại HTML và chạy `--check`; ghi output thật. Nếu `--check` fail vì thay đổi khác, báo rõ.
- Handoff `reports/handoffs/v2-fix-docs-truth.md`; commit nhánh riêng. Báo commit hash, output `--check`, file thay đổi, P2 chưa làm.
