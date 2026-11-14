import { StatusPill } from './StatusPill';

/** Nhãn minh bạch trên trang công khai: bản demo, dữ liệu tổng hợp. */
export function DemoNotice() {
  return (
    <p className="demo-notice">
      <StatusPill tone="sand">Bản demo</StatusPill>{' '}
      An Nhiên hiện là bản demo dùng <strong>dữ liệu tổng hợp</strong> từ thiết bị mô phỏng.
      Cảnh báo chỉ hiển thị khi trang web đang mở; hệ thống không tự gọi cấp cứu.
    </p>
  );
}
