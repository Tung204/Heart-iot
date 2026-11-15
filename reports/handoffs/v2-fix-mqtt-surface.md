# Handoff — v2 / fix-mqtt-surface (đóng bề mặt MQTT chưa xác thực)

- **Thời điểm:** 2026-11-15 07:45 (Asia/Ho_Chi_Minh)
- **Nhánh/worktree:** `fix/mqtt-surface-hardening` (worktree `fix-mqtt-surface`, base `fef59a4`)
- **Commit code:** `51abbefa3a9caf29a3cd4e2c6664477f41dbcc79`
- **Vùng ghi:** `infra/compose.yaml`, `infra/mosquitto/{mosquitto.conf,acl}`, `infra/README.md`, `infra/check-mqtt-exposure.mjs`, `docs/03-kien-truc-he-thong.md`, `docs/04-du-lieu-va-giao-tiep.md`, `docs/html/index.html` (sinh lại), `README.md`, `.gitignore`, file này.
- **Không sửa:** API/web/contracts/schema/`app.module.ts`, `docs/14`, `docs/05`, finding trong `reports/qa/*`.

> **Đây là giảm bề mặt + ghi đúng thực tế, KHÔNG phải đã triển khai MQTT.** P0-2 trong `reports/qa/v2-iot-protocol.md` **vẫn mở và không bị sửa/xóa**: publish `fall.*`/`sos.*` lên broker vẫn không tạo incident, không ACK. P0-1 chỉ được giảm ở tầng hạ tầng (broker không còn anonymous, không mở ra ngoài); tầng ứng dụng MQTT vẫn chưa xác thực khóa thiết bị.

## Đã làm

### 1. `infra/compose.yaml`

- `mosquitto` thêm `profiles: ["mqtt-experimental"]` → `docker compose up` mặc định **không** dựng broker, không mở cổng 1883.
- Publish cổng chỉ trên loopback host: `127.0.0.1:${MQTT_EXPERIMENTAL_PORT:-1883}:1883` (trước là `1883:1883`, tức mọi interface).
- Mount thêm `./mosquitto/acl` và `./mosquitto/passwd` (read-only) vào `/mosquitto/config/`; thiếu `passwd` thì broker dừng (fail closed), không fallback anonymous.
- Bỏ `depends_on: postgres` của broker (broker không dùng DB; trước đây bật profile thử nghiệm kéo theo PostgreSQL healthy).
- PostgreSQL: đổi `5432:5432` → `127.0.0.1:5432:5432` cho nhất quán "không public" (ứng dụng vẫn mặc định PGlite).
- `restart: "no"`: cấu hình sai/thiếu secret thì dừng, không lặp vô hạn.

### 2. `infra/mosquitto/mosquitto.conf` + `infra/mosquitto/acl`

- Bỏ `listener 1883 0.0.0.0` + `allow_anonymous true`; thay bằng `listener 1883 127.0.0.1`, `allow_anonymous false`, `password_file /mosquitto/config/passwd`, `acl_file /mosquitto/config/acl`.
- Khối comment TLS/mTLS: cách chuyển sang listener 8883 + `require_certificate true`, kèm cảnh báo `per_listener_settings true` và không commit cert/key. Chưa dựng/kiểm TLS.
- `acl` (commit được vì không chứa secret): username thiết bị **phải** là `device_id`; `pattern write v1/devices/%u/telemetry`, `pattern read v1/devices/%u/acks`; user backend `annhien-ingest` chỉ `topic read v1/devices/+/telemetry`.
- Mật khẩu **không** nằm trong repo: tạo cục bộ bằng `mosquitto_passwd` (hướng dẫn trong `infra/README.md`), `.gitignore` thêm `infra/mosquitto/passwd` + `passwd.*`.

### 3. Kiểm tĩnh `infra/check-mqtt-exposure.mjs`

Chỉ dùng Node built-in (chạy được khi chưa `pnpm install`). Fail (exit 1) khi:

- `infra/mosquitto/*.conf` chứa `allow_anonymous true` hoặc thiếu `allow_anonymous false`;
- có `listener` không khai báo host hoặc host ngoài `127.0.0.1`/`localhost`/`::1`;
- thiếu `password_file` (và không có `require_certificate true`) hoặc thiếu `acl_file`;
- `acl` không có `pattern` dùng `%u`;
- `mosquitto` không nằm trong profile `mqtt-experimental` hoặc thiếu mount conf/acl/passwd;
- có service publish cổng container `1883` ra ngoài loopback (hoặc cổng `1883` ở vị trí parser không kiểm được);
- `infra/mosquitto/passwd` bị Git track (bỏ qua nếu không chạy được `git ls-files`).

Giới hạn: kiểm regex trên file cấu hình, **không** chứng minh broker chạy/TLS/ACL đúng; không thay test tích hợp.

### 4. Tài liệu

- `docs/03`: sơ đồ kiến trúc ghi rõ HTTPS `/api/v1/ingest/*` là đường đang hỗ trợ, MQTT là nhánh thử nghiệm "chưa có ingest sự kiện"; ACK ghi "chưa hiện thực"; thêm blockquote trạng thái 15/11/2026; cập nhật bảng công nghệ (broker "chưa dùng trên đường ingest"), dòng Local demo và mục "Ranh giới quyền và vận hành".
- `docs/04`: mục "Topic và giao nhận MQTT" đổi thành "(thiết kế, chưa dùng trên đường ingest)", thêm cột **Trạng thái** cho từng topic (telemetry = adapter subscribe; events = **chưa có ingest, publish bị bỏ qua, không incident/ACK**; status/acks = chưa có), nêu P0-2 vẫn mở và mô tả ACL/secret thực tế; bảng API ghi ingest HTTP là đường duy nhất đang hỗ trợ.
- `README.md`: thêm mục "PostgreSQL và MQTT qua Docker (tùy chọn)" (mặc định chỉ PostgreSQL; MQTT sau profile, không dùng cho demo cảnh báo), thêm lệnh kiểm tĩnh vào mục Kiểm thử, cập nhật mô tả `infra/` và Giới hạn đã biết.
- `infra/README.md`: viết lại theo trạng thái thật — bảng thành phần, lý do hạ profile, cách bật profile + tạo credential cục bộ, danh sách **chưa làm**, cách chạy kiểm tĩnh.
- `docs/html/index.html`: sinh lại bằng `tools/docs/build.py` (không sửa tay).

## Kiểm đã chạy (output thật)

| Lệnh | Kết quả |
| --- | --- |
| `node infra/check-mqtt-exposure.mjs` (trong repo) | **13/13 đạt**, exit 0; gồm `✓ infra/mosquitto/mosquitto.conf: không có "allow_anonymous true"`, `✓ ... listener cổng 1883 bind loopback`, `✓ compose: mosquitto nằm trong profile "mqtt-experimental"...`, `✓ compose: mọi publish cổng container 1883 chỉ bind loopback`, `✓ git: infra/mosquitto/passwd không được track` |
| `docker compose -f infra/compose.yaml config --services` | `postgres` — **chỉ PostgreSQL**, MQTT không được chọn khi không bật profile (parse client-side, không chạy container) |
| `docker compose -f infra/compose.yaml --profile mqtt-experimental config` | mosquitto `host_ip: 127.0.0.1`, `target: 1883`, `published: "1883"`, `profiles: [mqtt-experimental]`, 3 mount read-only; postgres `host_ip: 127.0.0.1` |
| `grep -n "^listener\|^allow_anonymous\|^password_file\|^acl_file" infra/mosquitto/mosquitto.conf` | `allow_anonymous false`, `password_file ...`, `acl_file ...`, `listener 1883 127.0.0.1` |
| `git grep -n "allow_anonymous true"` | chỉ khớp **văn bản lịch sử/finding** (`reports/qa/v2-iot-protocol.md`, `infra/README.md` mô tả cấu hình cũ, `docs/html`); không có file cấu hình nào |
| `tools/docs/.venv/Scripts/python.exe tools/docs/build.py` | `Validated 305 links and 227 unique IDs; 20 sections.` / `Wrote docs\html\index.html` |
| `tools/docs/.venv/Scripts/python.exe tools/docs/build.py --check` | `Generated HTML matches current sources.`, exit 0 |
| Đột biến âm (chạy trên `git archive HEAD` ở `/tmp`, không phải repo) | thêm `allow_anonymous true` → exit 1; `listener 1883 0.0.0.0` → exit 1; compose `"1883:1883"` → exit 1; bỏ `profiles` → exit 1; bỏ `acl_file` → exit 1; khôi phục → exit 0 (12/12 vì không có git trong thư mục tạm) |
| `git status --short` sau commit | sạch trước khi thêm file handoff này |

Không chạy: broker/container thật, `mosquitto_passwd`, TLS, ACL enforcement, test Jest/Vitest/simulator (chi tiết dưới).

## Chưa chạy / chưa làm (không được suy diễn là đã có)

1. **Không dựng broker.** Docker CLI có (`29.8.0`) nhưng daemon không chạy (`failed to connect to the docker API at npipe:////./pipe/dockerDesktopLinuxEngine`). Vì vậy chưa kiểm: Mosquitto parse config, quyền đọc `passwd`, việc client không credential bị từ chối, ACL chặn publish chéo `device_id`, TLS/mTLS. Chỉ có `docker compose config` (client-side).
2. **Không chạy test ứng dụng.** Repo chưa có `node_modules`/`packages/contracts/dist` trong worktree này nên không chạy `pnpm build:contracts`, `node tools/docs/check-examples.mjs`, Jest/Vitest. Thay đổi không chạm TypeScript; simulator/API giữ nguyên.
3. **P0-2 không sửa.** `v1/devices/{id}/events`, `status`, `acks` vẫn không có ingest/publish; publish sự kiện vẫn bỏ im lặng. Task này chỉ hạ broker khỏi mặc định và ghi đúng tài liệu.
4. **P0-1 chỉ giảm một phần.** Broker không còn anonymous/không mở ra ngoài, nhưng `apps/api` vẫn không xác thực khóa thiết bị cho MQTT và ACL chưa được kiểm thực thi.
5. **Chưa có provisioning/rotation credential MQTT**, chưa có persistence/backup/giám sát broker, chưa có test tự động chứng minh "client không credential không kết nối được".

## Ngoài phạm vi nhưng đã thấy (đề nghị lead mở việc)

1. `docs/14-ke-hoach-trien-khai-phan-mem.md:40` vẫn ghi "Broker thật là Mosquitto trong compose" — sau thay đổi này broker nằm sau profile thử nghiệm; `docs/14` không thuộc vùng được sửa của worker này.
2. `apps/api/src/ingest/mqtt-ingest.service.ts` (comment đầu file) ghi `infra/mosquitto.conf` (đường dẫn cũ, file thật là `infra/mosquitto/mosquitto.conf`) và "ACL ... chưa kiểm" — cần cập nhật khi có worker chạm API; code chưa đổi.
3. `.env.example` vẫn ghi "MQTT tùy chọn. Để trống => không kết nối broker" mà không nói MQTT chưa hỗ trợ ingest sự kiện; ngoài phạm vi sửa.
4. `POSTGRES_PASSWORD: annhien` vẫn hardcode trong compose (demo). Khi làm môi trường thật phải chuyển sang secret ngoài repo; không sửa ở đây để không phá luồng demo đã tài liệu hóa.
5. Quyết định P0-2 vẫn cần chốt: hiện thực ingest `events` + ACK sau commit, hoặc bỏ topic `events`/`acks` khỏi docs/03/04/05 và tuyên bố HTTPS là đường duy nhất. Nếu hiện thực, test bắt buộc phải chứng minh client không credential không kết nối được và publish chéo `device_id` bị từ chối.
