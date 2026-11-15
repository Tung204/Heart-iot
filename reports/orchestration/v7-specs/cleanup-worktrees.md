# Dọn worktree DATN theo yêu cầu người dùng

Người dùng yêu cầu **“dọn worktree đi”**. Bạn là worker Pi provider `dola`, model `gpt-6.1-sol`, chạy trong workspace chính để không tạo thêm worktree. Nhiệm vụ dọn thực sự các worktree cũ an toàn, không chỉ viết đề xuất.

## Giới hạn cứng

- Chỉ repository DATN `d3ecaf99-91b4-47d8-8a3e-d6613841cd5f`; dùng skill orca-cli/orchestration và CLI chính thức `orca worktree rm`. Không dọn repository khác hoặc thư mục nguồn ngoài Git worktree.
- **Giữ workspace chính** `C:/MyFolder/Hoc_Tap/project/DATN` (có coordinator và agent người dùng khác), **v7-design**, **v7-inventory**, và mọi worktree có agent/task đang hoạt động. Không dừng/reset worker hoạt động.
- **Không xóa branch Git** (`--delete-branch` bị cấm), không force/remove -rf/reset/clean/prune hàng loạt, không thay quyền file, không xóa .git bằng tay. Còn nhánh commit chưa merge thì branch phải giữ; ghi số commit chưa merge và không tự merge.
- Worktree có tracked/untracked chưa lưu hoặc local DB/secret không rõ thì giữ, báo lý do. Không tự stash/commit thay đổi của người khác. Có thể bỏ worktree review có report untracked chỉ khi so byte xác nhận toàn bộ nội dung untracked đã có ở main và không còn file chưa bảo toàn; nếu không chắc giữ.
- Bắt đầu snapshot `orca worktree list --repo id:<DATN> --limit 10000 --json`, `git worktree list --porcelain`, worker-list Run `run_b87d2c63b2b7`, `orca worktree ps --json`; rà branch/head/status từng mục định xóa. Không suy worker chết chỉ vì status cũ; với worktree có live/unknown agent phải giữ. Các worktree cũ không còn agent có thể có dev server cũ: chỉ xóa qua Orca khi đúng worktree/task đã xong, giữ server chính 3000/5173.
- Check ngay trước từng remove: path đúng DATN, không main/2 v7; `git -C <path> status --porcelain` rỗng, head/branch hiện tại đã ghi; terminal/agent không là task live. Chỉ gọi `orca worktree rm --worktree <exact-selector> --json` **không force, không delete-branch**. CLI từ chối hoặc quyền/file lock thì ghi blocker, không circumvent hoặc thử raw git/rm.
- Đừng chạy global `workspace cleanup run` vì rules đang tắt và có repo khác. Không đụng `C:/tmp/base-bda9bb2` hay metadata prunable cũ không nằm trong danh sách Orca vì chưa có ownership rõ.

## Đầu ra

Chỉ ghi `reports/maintenance/worktree-cleanup-2026-11-15.md` (ngoài ra không sửa source/docs/log/Obsidian), gồm before/after thực tế, worktree xóa/giữ/block, branch/HEAD/dirty/unmerged evidence. Không ghi credentials, path secret content hoặc log thô. Có thể dùng file audit JSON trong `.git/`? **Không**, giữ snapshot đã lọc trong báo cáo Markdown, không ghi .git. Không commit vì main còn agent khác; lead tự commit report.

Sau remove phải list lại Orca và Git để xác nhận biến mất thật, các worktree giữ vẫn còn và active v7 không bị ảnh hưởng. Không coi exit 0 đơn lẻ là đủ. Gửi worker_done với số xóa thật, số giữ và blocker; báo report path. Không poll; kết thúc phiên ngay sau báo cáo. Nếu công cụ yêu cầu quyền ngoài workspace thì dùng approval của công cụ, không dùng cách khác để vượt chặn.
