# v7 W2 — luật chung cho 5 lane giao diện

Đọc trước: `reports/orchestration/v7-specs/mandate.md`, `reports/orchestration/v7/design-system.md`, `reports/orchestration/v7/decisions.md`, handoff `reports/handoffs/v7-foundation.md`, rồi spec lane của bạn.

## Nền và nhánh

- Base = commit cuối của `v7-foundation` (ghi SHA trong handoff). Không rebase master giữa chừng; nếu cần, báo lead.
- Mỗi lane một worktree riêng, branch riêng. Không merge, không push, không sửa master.
- **Chỉ ghi file thuộc lane mình.** File dùng chung (`src/components/*`, `src/styles/{fonts,tokens,base,shell}.css`, `components/primitives.css`, `app/*`, `lib/*`, `features/subjects/{selection,useSubjects,SubjectSwitcher}`, `test/utils.tsx`, `layout.css`) thuộc F: gửi yêu cầu/patch cho lead, không tự sửa. Interface frozen ở `decisions.md` D2: chỉ thêm, không đổi tên/chữ ký/xoá export.
- Không thêm dependency; dùng font/asset đã cài. Không hard-code dữ liệu sản phẩm; dữ liệu mẫu phải ghi nguồn mô phỏng.
- Không đổi API, schema, quyền, SSE, query key (trừ khi spec lane nói rõ và có test). Không sửa `apps/api`, `packages/contracts`, `tools/*`.

## Giao diện — bắt buộc

- Một màn một mục đích; tối đa một câu ngắn dưới mỗi tiêu đề; không lặp disclaimer/jargon; tiếng Việt.
- Mobile 390×844, 360×740 không tràn ngang; 1280×900 cũng kiểm. CTA + hành động chính trong viewport đầu. Mọi action đứng riêng ≥44×44 (kể cả `sm`, link phụ, brand, select).
- Giữ skip link, đúng một H1/trang, label cho input, focus visible, `prefers-reduced-motion`, chế độ chữ lớn.
- Không nhãn “An Nhiên”; không tự đặt brand mới; không “demo/đồ án” trong UI; nhãn “Dữ liệu mô phỏng” khi nguồn synthetic.
- Đúng 4 mục nav (Hôm nay/Cảnh báo/Sức khỏe/Người thân); không “Thêm”; menu tài khoản ở avatar; Studio không có link trong menu.

## Cổng kiểm (dán output thật vào handoff)

1. `pnpm --filter @annhien/web typecheck` — exit code.
2. `pnpm --filter @annhien/web exec vitest run <file test của lane> --no-file-parallelism --maxWorkers=1` — số file/test, exit code. Không nới test; nếu phải sửa test vì UI đổi, ghi rõ diff và lý do.
3. `pnpm --filter @annhien/web build`.
4. Dev server cổng riêng của lane; API `WEB_ORIGIN=http://127.0.0.1:<port>` (không bypass origin), PGlite cục bộ trong worktree, tài khoản demo owner `ba-an@demo.annhien.local`; admin `admin@demo.annhien.local` nếu cần.
5. Ảnh Chromium vào `reports/qa/evidence/v7-<lane>/<route>-<viewport>-<state>.png`: 1280×900, 390×844, 360×740, 390×844 chữ lớn; đo `scrollWidth <= clientWidth`, bbox target, `aria-current`, đếm H1/context line; ghi số thật + DPR.
6. Không có ảnh/lỗi mạng bị che bằng cách bỏ state xấu; lỗi API thật phải hiển thị đúng.

## Bàn giao

`reports/handoffs/v7-<lane>.md`: base SHA, file đổi, hành vi giữ/đổi, test diff, số đo ảnh, điều chưa kiểm, blocker, provider/model thật. Commit nhỏ trên branch lane; `worker_done` với trạng thái thật. Không tuyên bố “đạt/ổn/pass”.
