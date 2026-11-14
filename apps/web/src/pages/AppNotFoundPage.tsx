import { ButtonLink } from '../components/Button';
import { EmptyState } from '../components/EmptyState';

/** 404 trong khung ứng dụng — không lặp header/footer của trang công khai. */
export function AppNotFoundPage() {
  return (
    <EmptyState
      title="Không tìm thấy trang"
      description="Đường dẫn này không tồn tại trong ứng dụng hoặc đã được chuyển đi. Kiểm tra lại địa chỉ hoặc quay về tổng quan."
      action={<ButtonLink to="/app">Về tổng quan</ButtonLink>}
    />
  );
}
