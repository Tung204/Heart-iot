interface PageLoaderProps {
  label?: string;
}

export function PageLoader({ label = 'Đang tải…' }: PageLoaderProps) {
  return (
    <div className="page-loader" role="status" aria-busy="true">
      <span className="page-loader__spinner" aria-hidden="true" />
      <p>{label}</p>
    </div>
  );
}
