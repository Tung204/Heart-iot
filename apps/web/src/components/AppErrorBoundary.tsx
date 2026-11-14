import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button, ButtonLink } from './Button';

interface AppErrorBoundaryProps {
  children: ReactNode;
}

interface AppErrorBoundaryState {
  hasError: boolean;
}

/**
 * Chặn lỗi render của một trang (kể cả chunk route tải thất bại) để không trắng màn hình.
 * Không hiển thị stack/error kỹ thuật cho người dùng; chỉ ghi console cho dev.
 */
export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  override state: AppErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): AppErrorBoundaryState {
    return { hasError: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // Không gửi dữ liệu sức khỏe lên dịch vụ ngoài; chỉ log cục bộ cho dev.
    console.error('Trang gặp lỗi render', error, info.componentStack);
  }

  override render(): ReactNode {
    if (!this.state.hasError) return this.props.children;
    return (
      <div className="error-state" role="alert">
        <h1 className="error-state__title">Trang này chưa tải được</h1>
        <p>
          Có thể kết nối bị ngắt hoặc trang vừa gặp lỗi. Dữ liệu cảnh báo vẫn được xử lý ở máy chủ;
          hãy tải lại hoặc quay về tổng quan.
        </p>
        <div className="error-state__actions">
          <Button variant="secondary" onClick={() => window.location.reload()}>
            Tải lại trang
          </Button>
          <ButtonLink to="/app" variant="subtle">
            Về tổng quan
          </ButtonLink>
        </div>
      </div>
    );
  }
}
