import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SubjectForm } from './SubjectForm';

// FR-02 / form hồ sơ — lỗi field từ schema hợp đồng, submit hợp lệ truyền giá trị đúng.
describe('SubjectForm', () => {
  it('để trống tên → hiển thị lỗi field, không gọi onSubmit, focus về field lỗi', async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(<SubjectForm mode="create" onSubmit={onSubmit} />);

    await user.click(screen.getByRole('button', { name: 'Tạo hồ sơ' }));

    expect(
      await screen.findByText('Vui lòng nhập tên người được theo dõi.'),
    ).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByLabelText(/^Tên người được theo dõi/)).toHaveFocus();
  });

  it('tên đúng giới hạn 120 ký tự vẫn hợp lệ — input và schema cùng tôn trọng giới hạn', async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(<SubjectForm mode="create" onSubmit={onSubmit} />);

    const name = 'a'.repeat(120);
    fireEvent.change(screen.getByLabelText(/^Tên người được theo dõi/), {
      target: { value: name },
    });
    await user.click(screen.getByRole('button', { name: 'Tạo hồ sơ' }));

    // 120 ký tự đúng giới hạn createSubjectSchema (min 1 – max 120).
    expect(onSubmit).toHaveBeenCalledWith({
      displayName: name,
      timezone: 'Asia/Ho_Chi_Minh',
    });
  });

  it('múi giờ mặc định Asia/Ho_Chi_Minh; submit hợp lệ truyền đúng giá trị', async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(<SubjectForm mode="create" onSubmit={onSubmit} />);

    expect(screen.getByLabelText(/^Múi giờ/)).toHaveValue('Asia/Ho_Chi_Minh');

    await user.type(screen.getByLabelText(/^Tên người được theo dõi/), 'Bà Năm');
    await user.click(screen.getByRole('button', { name: 'Tạo hồ sơ' }));

    expect(onSubmit).toHaveBeenCalledWith({
      displayName: 'Bà Năm',
      timezone: 'Asia/Ho_Chi_Minh',
    });
  });
});
