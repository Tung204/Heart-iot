# Load ngắn trên PostgreSQL thật — bằng chứng

**Ngày:** 23/11/2026  
**Nhánh:** `v10-backend`, commit `7c19902` (script load chưa commit tại thời điểm chạy)  
**Mục đích:** kiểm API còn đúng và không lỗi khi nhiều request đồng thời trên PostgreSQL thật; đo p50/p95/p99 để tham khảo, **không phải benchmark production**.

## Môi trường

- Windows, Intel Core i9-14900HX, 34 GB RAM.
- Node v24.22.2, pnpm 12.5.1, Docker 29.8.0.
- PostgreSQL **17.11** (`postgres:17-alpine`), container tạm, DB migrate + seed demo.
- API một process, `pg` pool mặc định **max 10**, `NODE_ENV=development`, loopback `localhost:55432`, không TLS/proxy/nginx.
- Script tự khởi động API cổng 3033; mỗi lượt 5 giây; concurrency 1/10/25/50.
- Dữ liệu demo: 1 hồ sơ, cảnh báo/timeline mẫu; không phải dữ liệu thật.

## Cách chạy

```bash
DATABASE_URL=postgres://... \
  LOAD_DURATION_MS=5000 LOAD_CONCURRENCY=1,10,25,50 \
  pnpm --filter @heart-iot/api smoke:postgres-load
```

Script kiểm health, đăng nhập owner, lấy hồ sơ rồi đo ba endpoint: `/health`, `/subjects`, `/subjects/:id/alerts?limit=5`. Mọi response phải đúng **200**; có lỗi/status khác là fail. Không đặt ngưỡng p95 vì chưa có SLA.

## Kết quả (lượt đại diện)

| Endpoint | Concurrency | Request | req/s | p50 | p95 | p99 | Lỗi |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `/health` | 1 | 5.873 | 1.174,6 | 0,6 ms | 1,7 ms | 3,8 ms | 0 |
| `/health` | 10 | 6.452 | 1.290,4 | 6,7 ms | 14,5 ms | 23,1 ms | 0 |
| `/health` | 25 | 7.209 | 1.441,8 | 15,7 ms | 30,8 ms | 41,7 ms | 0 |
| `/health` | 50 | 8.558 | 1.711,6 | 27,1 ms | 47,5 ms | 62,6 ms | 0 |
| `/subjects` | 1 | 1.685 | 337,0 | 2,5 ms | 5,7 ms | 9,2 ms | 0 |
| `/subjects` | 10 | 1.833 | 366,6 | 25,6 ms | 40,8 ms | 50,5 ms | 0 |
| `/subjects` | 25 | 1.892 | 378,4 | 63,7 ms | 96,6 ms | 115,8 ms | 0 |
| `/subjects` | 50 | 2.149 | 429,8 | 113,1 ms | 156,2 ms | 189,1 ms | 0 |
| `/alerts` | 1 | 1.139 | 227,8 | 4,1 ms | 6,9 ms | 9,2 ms | 0 |
| `/alerts` | 10 | 1.421 | 284,2 | 33,8 ms | 47,4 ms | 61,1 ms | 0 |
| `/alerts` | 25 | 1.355 | 271,0 | 90,8 ms | 141,7 ms | 184,3 ms | 0 |
| `/alerts` | 50 | 1.253 | 250,6 | 193,6 ms | 281,3 ms | 304,1 ms | 0 |

- Tổng lượt đại diện: **40.819 request, 0 lỗi**.
- Lượt lặp lại cùng cấu hình: **40.327 request, 0 lỗi**; p95 concurrency 50 lần lượt là health 47,5/51,4 ms, subjects 156,2/166,3 ms, alerts 281,3/284,7 ms.
- Hai lượt đều `PASS`; không thấy 5xx, 429 hay timeout 10 giây.

## Diễn giải có giới hạn

- `/health` nhanh và tăng throughput theo concurrency; `/subjects` và `/alerts` bão hòa quanh **250–430 req/s** trên cấu hình này, p95 tăng khi vượt pool 10.
- Đây là quan sát trên **một máy dev, một process API, DB cùng máy, dữ liệu nhỏ**. Không dùng các số này để cam kết p95/NFR-07, capacity production hay độ trễ mạng thật.
- Chưa đo CPU/RAM tiến trình, connection pool chờ, khóa DB, query plan, dữ liệu lớn, nhiều instance, TLS/proxy, mạng WAN, mobile.
- Script không thay thế test chức năng; nó chỉ kiểm status dưới tải ngắn.

## Nguồn

- `backend/scripts/postgres-load.mjs`
- `backend/package.json` (`smoke:postgres-load`)
- Log chạy: hai lượt `PASS` ngày 23/11/2026
