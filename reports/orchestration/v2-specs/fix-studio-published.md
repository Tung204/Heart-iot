# Fix worker — Studio data dùng publication active

Bạn là worker sửa lỗi trên worktree riêng. Đọc `AGENTS.md`, `reports/qa/v2-owner-journey.md` P2-2, `docs/03` Studio publish/rollback, code `apps/api/src/studio/studio.service.ts`, `apps/web/src/features/studio/StudioViewDataPage.tsx`.

Chỉ sửa: `apps/api/src/studio/studio.service.ts` (nhánh data), `apps/api/test/studio.spec.ts` (hoặc test studio hiện có), `apps/web/src/features/studio/StudioViewDataPage.tsx` + test nếu có, css studio nếu cần. Không sửa app.module/router/layout/contracts nếu tránh được. Cài dependency/build contracts; test studio + typecheck.

Yêu cầu:
- `GET /workspace-views/:id/data` cho owner/admin/viewer luôn dùng **publication active** (config + digest + revision), không dùng `draftConfig`; sau rollback phải là config được rollback tới, không phải draft.
- Nếu chưa có publication active → 404/empty đúng semantics hiện có, không trả draft.
- Preview draft phải tách nhãn/đường khác nếu đã có; không gọi dữ liệu draft là “đã công bố”. UI hiển thị digest/revision khớp API và nhất quán, không hiện hai digest mâu thuẫn.
- Giữ quyền/scoping hiện có; test: có draft mới hơn active + rollback → data trả active; không active → lỗi; owner/viewer như cũ.
- Handoff `reports/handoffs/v2-fix-studio-published.md`; commit nhánh riêng. Báo commit hash, test counts, ảnh nếu có.
