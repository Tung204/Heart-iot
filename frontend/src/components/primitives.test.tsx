import { describe, expect, it, vi } from 'vitest';
import type { ReactElement } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { Alert } from './Alert';
import { Button, ButtonLink } from './Button';
import { Card } from './Card';
import { EmptyState } from './EmptyState';
import { ErrorState } from './ErrorState';
import { TextField } from './Field';
import { PageHeader } from './PageHeader';
import { PageLoader } from './PageLoader';
import { Section } from './Section';
import { SkipLink } from './SkipLink';
import { StatusPill } from './StatusPill';

function renderInRouter(ui: ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

// v7 primitives — hợp đồng API khoá ở F1: variant/size/native props/ref,
// label/hint/error liên kết, heading level linh hoạt để không lồng H1.
describe('Button / ButtonLink', () => {
  it('giữ variant + size + native props, type mặc định là button và nhận ref', async () => {
    const ref = { current: null as HTMLButtonElement | null };
    const onClick = vi.fn();
    render(
      <Button
        ref={(node) => {
          ref.current = node;
        }}
        variant="secondary"
        size="sm"
        disabled={false}
        onClick={onClick}
        aria-label="Lưu tên"
      >
        Lưu
      </Button>,
    );

    const button = screen.getByRole('button', { name: 'Lưu tên' });
    expect(button).toHaveAttribute('type', 'button');
    expect(button.className).toContain('button--secondary');
    expect(button.className).toContain('button--sm');
    expect(ref.current).toBe(button);

    await userEvent.setup().click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('pending vẫn do caller quyết định nhãn và chặn submit trùng khi disabled', () => {
    render(
      <Button type="submit" disabled>
        Đang lưu…
      </Button>,
    );
    const button = screen.getByRole('button', { name: 'Đang lưu…' });
    expect(button).toHaveAttribute('type', 'submit');
    expect(button).toBeDisabled();
  });

  it('ButtonLink giữ anchor + variant + href nội bộ', () => {
    renderInRouter(
      <ButtonLink to="/app/alerts" variant="subtle" size="sm">
        Xem cảnh báo
      </ButtonLink>,
    );
    const link = screen.getByRole('link', { name: 'Xem cảnh báo' });
    expect(link).toHaveAttribute('href', '/app/alerts');
    expect(link.className).toContain('button--subtle');
    expect(link.className).toContain('button--sm');
  });
});

describe('TextField', () => {
  it('nối aria-describedby cho cả hint và error, aria-invalid khi lỗi', () => {
    render(
      <TextField
        id="displayName"
        label="Tên của bạn"
        hint="Tối đa 120 ký tự"
        error="Tên không được để trống"
        required
      />,
    );

    const input = screen.getByLabelText(/Tên của bạn/);
    expect(input).toHaveAttribute('id', 'displayName');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAttribute(
      'aria-describedby',
      'displayName-hint displayName-error',
    );
    expect(input).toBeRequired();
    expect(document.getElementById('displayName-hint')).toHaveTextContent('Tối đa 120 ký tự');
    expect(document.getElementById('displayName-error')).toHaveTextContent(
      'Tên không được để trống',
    );
    // Lỗi được announce nhưng vẫn gắn đúng field.
    expect(screen.getByRole('alert')).toHaveAttribute('id', 'displayName-error');
  });

  it('chỉ có hint: describedby trỏ hint, không aria-invalid', () => {
    render(<TextField id="email" label="Email" hint="Dùng email đã nhận lời mời" />);
    const input = screen.getByLabelText('Email');
    expect(input).toHaveAttribute('aria-describedby', 'email-hint');
    expect(input).not.toHaveAttribute('aria-invalid');
  });
});

describe('Card / Section / PageHeader', () => {
  it('Card cho chọn heading level để không lồng H1', () => {
    render(
      <Card title="Gắn thiết bị" description="Nhập mã một lần" headingLevel={2}>
        <p>Nội dung</p>
      </Card>,
    );
    expect(screen.getByRole('heading', { level: 2, name: 'Gắn thiết bị' })).toBeInTheDocument();
    expect(screen.getByText('Nhập mã một lần')).toBeInTheDocument();
  });

  it('Section mặc định phẳng với H2; PageHeader là H1 duy nhất + action', () => {
    render(
      <>
        <PageHeader
          title="Cảnh báo"
          context="Một câu ngữ cảnh"
          actions={<Button size="sm">Lọc</Button>}
        />
        <Section title="Đang mở" lead="Dữ liệu từ máy chủ">
          <p>Danh sách</p>
        </Section>
      </>,
    );
    const h1 = screen.getByRole('heading', { level: 1, name: 'Cảnh báo' });
    expect(h1).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Đang mở' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Lọc' })).toBeInTheDocument();
    expect(screen.getByText('Một câu ngữ cảnh')).toBeInTheDocument();
  });
});

describe('Alert / StatusPill', () => {
  it('warning/error announce như alert; có thể hạ xuống status cho banner lặp', () => {
    const { rerender } = render(
      <Alert tone="warning" title="Mất kết nối">
        Đang thử lại
      </Alert>,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Mất kết nối');

    rerender(
      <Alert tone="warning" title="Mất kết nối" announce="status">
        Đang thử lại
      </Alert>,
    );
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Đang thử lại');
  });

  it('info/success dùng status; tone có nhãn chữ ẩn để không chỉ dựa màu', () => {
    render(
      <Alert tone="success" title="Đã gắn thiết bị">
        Thiết bị đang chờ dữ liệu
      </Alert>,
    );
    const region = screen.getByRole('status');
    expect(within(region).getByText(/Đã xong/)).toBeInTheDocument();
  });

  it('StatusPill giữ tone cũ và tone nghĩa mới', () => {
    const { rerender } = render(<StatusPill tone="teal">Đang mở</StatusPill>);
    expect(screen.getByText('Đang mở')).toHaveClass('pill--teal');

    rerender(<StatusPill tone="warning">Chưa xác định</StatusPill>);
    expect(screen.getByText('Chưa xác định')).toHaveClass('pill--warning');
  });
});

describe('EmptyState / ErrorState / PageLoader / SkipLink', () => {
  it('EmptyState không lồng H1; gắn action + không số 0 giả', () => {
    render(
      <EmptyState
        title="Không có cảnh báo đang mở"
        description="Khi thiết bị gửi sự kiện, cảnh báo sẽ xuất hiện ở đây."
        action={<Button size="sm">Kiểm tra thiết bị</Button>}
      />,
    );
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(
      'Không có cảnh báo đang mở',
    );
    expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Kiểm tra thiết bị' })).toBeInTheDocument();
    expect(document.querySelector('.empty-state__icon')).toBeNull();
  });

  it('ErrorState cho chọn heading level; vẫn role=alert + nút thử lại', () => {
    render(
      <ErrorState
        title="Không tải được danh sách"
        message="Kiểm tra kết nối rồi thử lại."
        onRetry={() => {}}
        headingLevel={2}
      />,
    );
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Không tải được danh sách');
    expect(screen.getByRole('button', { name: 'Thử lại' })).toBeInTheDocument();
  });

  it('PageLoader có status + aria-busy + skeleton trung tính, không số liệu giả', () => {
    render(<PageLoader label="Đang tải trang…" />);
    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('aria-busy', 'true');
    expect(status).toHaveTextContent('Đang tải trang…');
    expect(status.querySelectorAll('.page-loader__skeleton span')).toHaveLength(3);
    expect(status).not.toHaveTextContent(/\d+\s*(bpm|%|bước)/i);
  });

  it('SkipLink trỏ tới #main và là target ≥44px (class dùng chung)', () => {
    render(<SkipLink />);
    const link = screen.getByRole('link', { name: 'Chuyển tới nội dung chính' });
    expect(link).toHaveAttribute('href', '#main');
    expect(link).toHaveClass('skip-link');
  });
});
