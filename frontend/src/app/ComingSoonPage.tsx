import { ButtonLink } from '../components/Button';

/** Các route nghiệp vụ của /app (hồ sơ, thiết bị, cảnh báo…) sẽ xây ở wave 2. */
export function ComingSoonPage() {
  return (
    <div className="stack">
      <h1 className="page-title">Khu vực này chưa có trong bản hiện tại</h1>
      <p className="page-lead">
        Trang bạn vừa mở thuộc phần chức năng sẽ được xây dựng ở wave tiếp theo.
      </p>
      <div>
        <ButtonLink to="/app">Về trang chủ ứng dụng</ButtonLink>
      </div>
    </div>
  );
}
