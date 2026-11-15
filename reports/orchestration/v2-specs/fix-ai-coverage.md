# Fix worker — trợ lý AI phải nêu độ phủ, khoảng thiếu, nguồn

Bạn là worker sửa lỗi trên worktree riêng. Đọc `AGENTS.md`, `reports/qa/v2-product-gaps.md` P2-2, `reports/qa/v2-requirement-trace.md` F5, `reports/qa/v2-privacy-ethics.md` P2-8, `docs/07`, `docs/11`, code assistant.

Chỉ sửa: `packages/contracts/src/assistant.ts`, `apps/api/src/assistant/**`, `apps/api/test/assistant.spec.ts`, `apps/web/src/features/assistant/**` + test. Không sửa measurements/incidents/app.module/router/layout.css. Cài install/build contracts; test assistant + typecheck web.

Yêu cầu:
- Thêm vào summary (và answer nếu phù hợp) khối `dataQuality`: coveragePercent, observedCount, expectedCount, gaps (số khoảng + lý do), lastSeenAt, synthetic boolean, limitations (mảng ngắn). Không chứa số đo thô; không chẩn đoán.
- Summary template và prompt provider phải dùng coverage/gaps/lastSeen/synthetic: nếu coverage thấp hoặc thiếu nhiều, câu chữ nói rõ “chỉ từ X mẫu, độ phủ Y%, Z khoảng thiếu”; không mô tả “bình thường” khi dữ liệu thiếu. Nếu synthetic, nêu “dữ liệu mô phỏng”.
- UI Assistant hiển thị khối “Chất lượng dữ liệu” (độ phủ, số mẫu, khoảng thiếu, nguồn mô phỏng), dễ đọc, không chỉ màu; giữ disclaimer.
- Không thay đổi endpoint/shape cũ ngoài field mới; giữ backward compatibility; test template fallback + provider fake + UI.
- Tests: coverage 0/thiếu gaps/synthetic → text và dataQuality đúng; dữ liệu đầy đủ → không bịa; quyền AI vẫn 403 khi thiếu; disclaimer.
- Handoff `reports/handoffs/v2-fix-ai-coverage.md`; commit nhánh riêng. Báo commit hash, test counts, giới hạn.
