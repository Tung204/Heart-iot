# Quy trình điều phối agent cho DATN

Tài liệu này ghi **cách lead điều phối các phiên agent** (mini-lead, worker, reviewer) trong quá trình triển khai. Đây là nhật ký vận hành, không phải đặc tả sản phẩm. Nguồn kỹ thuật vẫn là `docs/` và code.

## 1. Vai trò

| Vai trò | Trách nhiệm | Không được làm |
| --- | --- | --- |
| Lead (phiên chính) | Đọc docs, chốt phạm vi/kỹ thuật trong quyền được giao, viết skeleton, chia việc, tích hợp, commit, duyệt cuối | Không tự nhận đã đo nghiệm thu của trường/giảng viên |
| Mini-lead backend/frontend | Review tích hợp các module trong miền mình, sửa lỗi ghép nối, chạy lại test, ghi handoff | Không tự mở rộng phạm vi, không sửa docs quyết định của lead |
| Worker | Triển khai đúng vùng file được giao, viết test cho hành vi sở hữu, ghi handoff có lệnh + kết quả thật | Không chạy `git`, không sửa file ngoài vùng giao, không tự `pnpm add` |
| Reviewer độc lập | Dùng phiên mới, DB/snapshot mới; tự chạy lại test và phép kiểm; không tin báo cáo test của worker; ghi finding có mức ưu tiên | Không sửa code trong lượt review đầu; không kết luận "đạt" khi chưa chạy |
| Fixer | Sửa finding đã được lead chấp nhận, chạy test hồi quy, ghi handoff | Không đóng finding khi chưa có bằng chứng chạy lại |

## 2. Nguyên tắc chia việc

1. **Một vùng ghi duy nhất**: mỗi worker sở hữu đường dẫn cụ thể. Root config, schema, `app.module.ts`, docs quyết định thuộc lead.
2. **Hợp đồng trước, code sau**: kiểu dữ liệu, route, mã lỗi nằm trong `packages/contracts` hoặc tài liệu API của lead.
3. **Không git trong worker**: lead stage/commit theo vùng để tránh tranh chấp index.
4. **Không cài dependency trong worker**: lead cài trước toàn bộ dependency của wave; worker báo thiếu qua handoff.
5. **Test là bằng chứng, không phải tuyên bố**: handoff ghi đúng lệnh, thời điểm, kết quả; reviewer chạy lại.
6. **Wave nhỏ, cổng rõ**: mỗi wave có tiêu chí vào/ra; lỗi tích hợp do lead hoặc mini-lead xử lý trước wave sau.
7. **Review độc lập**: phiên reviewer mới, prompt không chứa kết luận của worker; nhận repo hiện tại và tự tạo dữ liệu kiểm.

## 3. Quy trình một wave

1. Lead chốt phạm vi wave, ownership, dependency, lệnh kiểm.
2. Tạo pane + agent, đặt tên duy nhất (`be-core`, `fe-shell`, `rev-api`...).
3. Prompt worker theo mẫu mục 4; chạy song song khi vùng ghi rời nhau.
4. Thu handoff; lead đọc diff, chạy `typecheck`/test của wave.
5. Mini-lead (nếu có) review tích hợp và sửa lỗi ghép.
6. Reviewer độc lập chạy lại; findings vào `reports/qa/`.
7. Fixer sửa; reviewer xác nhận bằng lần chạy mới.
8. Lead commit, cập nhật docs/HTML, cập nhật nhật ký này.

## 4. Mẫu prompt worker

```text
Vai trò: <worker> — vùng ghi: <paths>. Repo: C:/MyFolder/Hoc_Tap/project/DATN.
Bắt buộc đọc: AGENTS.md, docs/12, docs/14 (kế hoạch), packages/contracts/README.md, handoff README.
Mục tiêu: <hành vi cụ thể>. Ngoài phạm vi: <loại trừ>.
Ràng buộc: không chạy git; không sửa ngoài vùng ghi; không pnpm add; không bịa kết quả test.
Kiểm: <lệnh chính xác>. Chạy tuần tự; fail thì đọc lỗi trước khi sửa.
Kết thúc: ghi reports/handoffs/<tên>.md gồm file đã đổi, lệnh + kết quả thật, phần chưa xong,
rủi ro tích hợp, và dừng. Không mở server dài hạn.
```

## 5. Mẫu handoff

```markdown
# Handoff — <worker>
- Thời điểm: YYYY-MM-DD HH:mm (Asia/Ho_Chi_Minh)
- Vùng ghi: ...
- Đã làm: ...
- Kiểm đã chạy: `<lệnh>` → kết quả thực (số test pass/fail, lỗi còn lại)
- Chưa làm / giới hạn: ...
- Rủi ro tích hợp: ...
- Đề nghị lead: ...
```

## 6. Mẫu prompt reviewer

```text
Bạn là reviewer độc lập, KHÔNG tin báo cáo test của worker. Repo hiện tại: ...
Phạm vi: <module/hành vi>. Tự tạo DB/snapshot mới; tự chạy lại test và ít nhất một phép kiểm
mà worker không chạy. Đọc code trước khi kết luận. Không sửa code trong lượt này.
Ghi reports/qa/<lượt>-<vùng>.md: finding (P0/P1/P2), tình huống tái hiện, lệnh, expected/actual,
bằng chứng; phần đã kiểm; phần chưa kiểm. Chỉ ghi "đạt" cho phép kiểm đã thực chạy.
```

## 7. Chỉ số theo dõi trong nhật ký

- Số phiên, sóng, thời gian tường (lead ghi khi quan sát).
- Số handoff thiếu bằng chứng / phải làm lại.
- Số finding theo mức, tỷ lệ tái hiện, số vòng fix.
- Lỗi tích hợp do hợp đồng mơ hồ (để cải thiện prompt/skill).
- Việc lead phải làm lại thay vì worker (dấu hiệu chia việc sai).

Nhật ký theo ngày: [`journal-2026-11-14.md`](journal-2026-11-14.md),
[`journal-2026-11-15.md`](journal-2026-11-15.md).
Bài học rút gọn cho skill điều phối: [`lessons.md`](lessons.md).
