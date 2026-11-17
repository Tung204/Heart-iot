# Dọn worktree DATN — 15/11/2026

Yêu cầu người dùng: “dọn worktree đi”, sau đó “tự xoá worktree đi”. Lead thực hiện trực tiếp vì worker được giao (dispatch `ctx_814d04006c5e`) dừng do lỗi provider 502/403 của `dola` trước khi xoá được worktree nào.

## Kết quả

| Thời điểm | Workspace DATN trong Orca |
| --- | --- |
| Trước dọn | **75** (worktree chính + 74 worktree phụ) |
| Sau dọn | **3** (chính `C:/MyFolder/Hoc_Tap/project/DATN`, `v7-design`, `v7-inventory`) |
| Đã xoá | **72** worktree |

Đối chiếu sau cùng: `orca worktree list` chỉ còn 3 mục DATN; `git worktree list` còn main + 2 nhánh v7; worktree tạm detached `C:/tmp/base-bda9bb2` cũng đã gỡ. Thư mục `C:/Users/nguye/orca/workspaces/DATN/` trên đĩa chỉ còn `v7-design`, `v7-inventory`.

**Branch Git giữ toàn bộ**: 79 branch local vẫn còn (không dùng `--delete-branch`, không xoá branch, không merge thay đổi nào).

## Cách làm và bằng chứng

1. Snapshot `orca worktree list --limit 10000 --json` (107 workspace toàn host, không truncated; 75 thuộc repo DATN), `git worktree list --porcelain`, `orca worktree ps --json`, worker-list run `run_b87d2c63b2b7`.
2. Từng worktree: ghi `branch`, `head`, `git status --porcelain`. Worktree có thay đổi tracked hoặc untracked không trùng byte với `master` sẽ bị giữ lại — lần này không có trường hợp nào.
3. File untracked của các worktree review (`reports/qa/*.md`, `reports/orchestration/v5-plan-ux.md`, `reports/qa/v6-review.md`) đối chiếu **trùng byte** với `master` trước khi xoá. Hai thư mục chưa có trong master được lưu vào repo trước khi xoá, commit `27bf6fb`:
   - `reports/qa/scripts/` — 8 script đo hiệu năng v2
   - `reports/qa/evidence/` — 7 ảnh bằng chứng review sản phẩm
4. Xoá bằng CLI chính thức `orca worktree rm --worktree id:...`; không dùng `git worktree remove` trực tiếp, không `rm -rf`, không đổi quyền file.
5. Lần đầu CLI từ chối (`runtime_error: Failed to delete worktree ... ?? reports/qa/...`) vì worktree còn untracked; nội dung đã xác minh trùng master nên chạy lại với `--force` — chỉ bỏ bản sao untracked đã có trong repo, không mất dữ liệu. Vài lần lỗi `PermissionError`/locked khi xoá file do tiến trình khác đang mở; chạy lại tuần tự (không song song) thì thành công.
6. Sau khi xoá, list lại Orca và Git để xác nhận.

## Giữ lại có chủ đích

- `C:/MyFolder/Hoc_Tap/project/DATN` — worktree chính, master, điều phối và phiên của người dùng.
- `v7-design`, `v7-inventory` — hai phiên v7; đầu ra đã copy vào master ở commit `f50e7e9`, giữ worktree để dùng tiếp.
- Toàn bộ branch (79) bảo toàn lịch sử; worktree đã xoá tạo lại được từ branch khi cần.

## Còn tồn tại (không chặn)

- Metadata `.git/worktrees/<tên>` của vài chục worktree cũ còn sót; Git báo `Permission denied` khi dọn vì tiến trình khác đang giữ. Đây là thư mục quản trị cũ, không phải worktree tồn tại; `git worktree list` đã sạch. Không đổi quyền/vượt chặn để xoá.
- Một số kênh orchestration cũ ở trạng thái `release_unknown` (`worker-list`), không phải worktree; không tự đóng tài nguyên chưa xác minh sở hữu.

## Danh sách worktree đã xoá (branch @ head lúc xoá)

| Worktree | Branch | HEAD |
| --- | --- | --- |
| `docs-v2-final` | `docs-v2-final` | `c410aefd` |
| `feat-account` | `feat-account` | `1dcb2cd3` |
| `feat-assistant-product-shell` | `feat-assistant-product-shell` | `10a46c79` |
| `feat-emergency-contacts` | `feat-emergency-contacts` | `8d6d68c0` |
| `feat-motion` | `feat-motion` | `b539e5a9` |
| `feat-subject-archive` | `feat-subject-archive` | `6052f031` |
| `feat-task-create` | `feat-task-create` | `efff6bbf` |
| `feat-weekly-insights` | `feat-weekly-insights` | `fc8c1a0f` |
| `fix-a11y-p1` | `fix-a11y-p1` | `32a86881` |
| `fix-admin-devices` | `fix-admin-devices` | `d767287b` |
| `fix-ai-coverage` | `fix-ai-coverage` | `aed520fe` |
| `fix-alert-lifecycle` | `fix-alert-lifecycle` | `1d311dcd` |
| `fix-alert-write-permission` | `fix-alert-write-permission` | `0bf7adca` |
| `fix-api-insights-test` | `fix-api-insights-test` | `2541d16d` |
| `fix-caregiver-window` | `fix-caregiver-window` | `32826cf0` |
| `fix-claim-code-guard` | `fix-claim-code-guard` | `b82cd0a2` |
| `fix-docs-truth` | `fix-docs-truth` | `f8ab7075` |
| `fix-event-ingest` | `fix-event-ingest` | `11814fbc` |
| `fix-global-alerts` | `fix-global-alerts` | `599ecc97` |
| `fix-health-permission` | `fix-health-permission` | `d7e0b815` |
| `fix-ingest-quarantine` | `fix-ingest-quarantine` | `f48be7ca` |
| `fix-last-telemetry` | `fix-last-telemetry` | `17eba6cb` |
| `fix-mqtt-surface` | `fix/mqtt-surface-hardening` | `30794e41` |
| `fix-notification-boundary` | `fix-notification-boundary` | `d201e490` |
| `fix-password-rate` | `fix-password-rate` | `e9ef1616` |
| `fix-performance-p1` | `fix-performance-p1` | `c6174f57` |
| `fix-policy-preview` | `fix-policy-preview` | `20687e5a` |
| `fix-quarantine-reads` | `fix-quarantine-reads` | `75a4d949` |
| `fix-sse-revocation` | `fix-sse-revocation` | `a43232df` |
| `fix-status-boundary` | `fix-status-boundary` | `7f06559b` |
| `fix-studio-data-boundary` | `fix-studio-data-boundary` | `f089aea4` |
| `fix-studio-published` | `fix-studio-published` | `fdc886c0` |
| `fix-test-hermeticity` | `fix-test-hermeticity` | `88755bf5` |
| `fix-ux-p0-p1` | `fix-ux-p0-p1` | `f7ed50ef` |
| `fix-v4-admin` | `fix-v4-admin` | `7b31ef4a` |
| `fix-v4-admin-2` | `fix-v4-admin-2` | `0c2bae66` |
| `fix-v4-app` | `fix-v4-app` | `594ee285` |
| `fix-v4-app-2` | `fix-v4-app-2` | `216b0967` |
| `fix-v4-e2e` | `fix-v4-e2e` | `777d47cd` |
| `fix-v4-public` | `fix-v4-public` | `71a86ba3` |
| `fix-v4-public-2` | `fix-v4-public-2` | `44ead87c` |
| `qa-accessibility` | `qa-accessibility` | `8434d66c` |
| `qa-admin-ops` | `qa-admin-ops` | `8434d66c` |
| `qa-backend-security` | `qa-backend-security` | `8434d66c` |
| `qa-caregiver-journey` | `qa-caregiver-journey` | `8434d66c` |
| `qa-data-integrity` | `qa-data-integrity` | `8434d66c` |
| `qa-docs-consistency` | `qa-docs-consistency` | `8434d66c` |
| `qa-iot-protocol` | `qa-iot-protocol` | `ffb6d872` |
| `qa-owner-journey` | `qa-owner-journey` | `8434d66c` |
| `qa-privacy-ethics` | `qa-privacy-ethics` | `ffb6d872` |
| `qa-requirement-trace` | `qa-requirement-trace` | `ffb6d872` |
| `qa-test-gaps` | `qa-test-gaps` | `8434d66c` |
| `qa-ux-visual` | `qa-ux-visual` | `8434d66c` |
| `rev-v2-features` | `rev-v2-features` | `bf63f037` |
| `rev-v2-security` | `rev-v2-security` | `bf63f037` |
| `v4-rereview-admin` | `v4-rereview-admin` | `a40e09dc` |
| `v4-rereview-app` | `v4-rereview-app` | `b6186219` |
| `v4-rereview-public` | `review/v4-rereview-public-dd1fbd5` | `a474d26d` |
| `v4-review-admin` | `v4-review-admin` | `f5492872` |
| `v4-review-app` | `v4-review-app` | `d718e9eb` |
| `v4-review-public` | `review/v4-public-f572ef4` | `e5e86052` |
| `v4-simple-admin` | `v4-simple-admin` | `fe31dec3` |
| `v4-simple-app` | `v4-simple-app` | `bda9bb26` |
| `v4-simple-public` | `feat/v4-simple-public` | `49c3ac9f` |
| `v5-plan-ux` | `v5-plan-ux` | `a0ba30c5` |
| `v6-app` | `v6-app` | `fb81e670` |
| `v6-cleanup` | `v6-cleanup` | `e3e8ce29` |
| `v6-public` | `v6-public` | `71ebd78f` |
| `v6-review` | `v6-review` | `102d72c6` |
| `v6-shell` | `v6-shell` | `f36fe534` |
| `qa-performance` | `qa-performance` | `8434d66c` |
| `qa-product-gaps` | `qa-product-gaps` | `8434d66c` |
