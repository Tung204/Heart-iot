# Prompt worker — fe-studio (wave 3)

Bạn là **fe-studio**, worker frontend của dự án An Nhiên. Repo `C:/MyFolder/Hoc_Tap/project/DATN`.
Đọc prompt này rồi **thực thi ngay**, không chỉ lập kế hoạch.

## Bắt buộc đọc

1. `docs/11-nen-tang-ai-va-cau-hinh-dong.md` — preview trước khi publish, không tác động dữ liệu thật.
2. `packages/contracts/src/studio.ts` — schema chính xác của view/config/preview/publish/rollback.
3. `apps/api/src/studio/studio.controller.ts` — route + response thật.
4. `apps/web/src` hiện có (router, components, lib/api, query, features/subjects) — dùng lại, không tạo hệ CSS mới.
5. Handoff `reports/handoffs/wave2-be-studio.md` — response publish/rollback là `{publication, view}`.

## Vùng ghi

- `apps/web/src/features/studio/**`
- `apps/web/src/app/router.tsx` (chỉ thêm route studio; giữ nguyên route khác)
- `apps/web/src/app/AppShell.tsx` (chỉ thêm mục nav studio cho owner/admin)
- `apps/web/src/features/studio/*.test.tsx`, `apps/web/README.md`
- `reports/handoffs/wave3-fe-studio.md`

**Không** sửa `apps/api/**`, `packages/contracts/**`, `package.json`, `tsconfig`, vite/playwright config,
`lib/api.ts` (nếu thiếu hàm thì viết trong `features/studio/api.ts`), docs, HTML, `.env`.
Không chạy `git`, không `pnpm add`.

## Phải làm

### 1. `/app/studio` — danh sách view

- Gọi `GET /workspace-views`; hiển thị tên, key, scope (user/subject/global), trạng thái,
  draftRevision, publication đang active (revision/digest rút gọn), cập nhật lúc nào.
- Nút "Tạo view" mở form: key (a-z0-9-), tên, scope. Scope `subject` bắt buộc chọn hồ sơ
  trong danh sách hồ sơ người dùng có quyền; scope `global` chỉ hiện với admin.
- Empty/loading/error states; không hiện nút publish nếu không có quyền (owner view; admin global).

### 2. `/app/studio/:id` — draft → preview → publish

- Hiển thị config draft hiện tại (layout + danh sách widget). Cho sửa:
  - layout `stack|grid`;
  - thêm/xóa widget (tối đa 12), mỗi widget: id, type (`metric|chart|alerts|summary|tasks`),
    title, span 1|2|3, options JSON **tùy chọn** (nếu nhập JSON sai → lỗi tại field, không gửi).
  - Không cần kéo-thả; nút lên/xuống để đổi thứ tự.
- Lưu draft: `PUT /workspace-views/:id/draft` với `config` + `baseRevision` hiện tại;
  thành công cập nhật draftRevision/digest; 409 → hiện "bản đã thay đổi", cho tải lại, không ghi đè.
- Preview: `POST /workspace-views/:id/previews` body `{draftRevision}` (có thể chọn
  `previewSubjectId` để xem dữ liệu thật có quyền; mặc định dữ liệu mẫu).
  Render preview bằng component đọc `preview.data`:
  - metric: các chỉ số có trong data (không tự bịa thêm);
  - chart: SVG series đơn giản có nhãn trục + bảng thay thế;
  - alerts: danh sách alert tối đa 10;
  - summary/tasks: danh sách gọn.
  Luôn hiện badge **"Dữ liệu mẫu"** khi `data.sample=true`; badge "Dữ liệu thật" khi có subject.
- Publish: nút chỉ bật sau khi preview thành công và draft không đổi.
  Gửi `POST /publications` với `draftRevision`, `digest` từ preview, `baseRevision`, note tùy chọn.
  409 `APPROVAL_STALE` → hiện currentRevision/currentDigest + nút tải lại; không tự publish lại.
- Lịch sử: `GET /workspace-views/:id/publications`; rollback có xác nhận, gửi
  `POST /rollback` `{publicationId}`; giải thích rollback tạo bản mới, không xóa lịch sử.

### 3. `/app/studio/:id/data` (hoặc tab "Xem") — render published

- Gọi `GET /workspace-views/:id/data`; render như preview nhưng dữ liệu thật;
  nếu view chưa publish → thông báo rõ, không giả lập.

### 4. Chất lượng

- Dùng component/token hiện có (`Button`, `Card`, `Field`, `Alert`, `StatusPill`, `EmptyState`,
  `ErrorState`, `PageLoader`); CSS mới đặt trong `features/studio/studio.css` và import một lần.
- Chữ lớn không vỡ; bàn phím dùng được; `aria-label` cho nút icon; không dùng màu làm tín hiệu duy nhất.
- Không hiển thị HTML từ model/JSON người dùng; chỉ text.
- Mobile 360px: form và preview xếp dọc; bảng có overflow ngang có nhãn.

## Kiểm phải chạy

```bash
cd apps/web
pnpm typecheck
pnpm test
pnpm build
```

Thêm test:
1. Danh sách view empty/error.
2. Form widget: thêm/xóa/đổi thứ tự, JSON options sai → lỗi field.
3. Preview sample hiện badge "Dữ liệu mẫu"; preview subject hiện "Dữ liệu thật".
4. Publish gửi đúng digest/draftRevision/baseRevision (mock API); 409 hiện thông báo stale.
5. Rollback có xác nhận và gọi đúng publicationId.

E2E chỉ chạy nếu API+web đang chạy; nếu không, ghi "chưa chạy", không bịa.

## Kết thúc

Ghi `reports/handoffs/wave3-fe-studio.md`: file, lệnh + kết quả thật, phần chưa làm, rủi ro.
Kẹt >15 phút ở một lỗi thì dừng, ghi handoff trung thực.
