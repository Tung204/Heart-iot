interface PageLoaderProps {
  label?: string;
}

/**
 * Trạng thái tải: skeleton trung tính (không shimmer, không số đo placeholder)
 * + câu `role=status` để trình đọc màn hình biết đang chờ gì.
 */
export function PageLoader({ label = 'Đang tải…' }: PageLoaderProps) {
  return (
    <div className="page-loader" role="status" aria-busy="true">
      <div className="page-loader__skeleton" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      <p>{label}</p>
    </div>
  );
}
