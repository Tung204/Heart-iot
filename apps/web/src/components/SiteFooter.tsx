export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="container">
        <p>
          <strong>An Nhiên</strong> — đồ án demo theo dõi người thân qua thiết bị đeo.
        </p>
        <p className="site-footer__note">
          Bản demo dùng dữ liệu tổng hợp, không dùng cho quyết định y tế. Cảnh báo chỉ hiển thị
          khi trang web đang mở và kết nối với máy chủ; hệ thống không tự gọi cấp cứu và không
          gửi thông báo khi trình duyệt đã đóng.
        </p>
      </div>
    </footer>
  );
}
