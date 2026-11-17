import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TextSizeToggle } from './TextSizeToggle';

// NFR-04 — chế độ "chữ lớn": đổi attribute <html data-text-size>, lưu localStorage.
describe('TextSizeToggle', () => {
  it('bật/tắt đổi attribute data-text-size và lưu localStorage', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<TextSizeToggle />);

    const button = screen.getByRole('button', { name: 'Bật chữ lớn' });
    expect(button).toHaveAttribute('aria-pressed', 'false');
    expect(document.documentElement).not.toHaveAttribute('data-text-size');

    await user.click(button);
    expect(document.documentElement).toHaveAttribute('data-text-size', 'large');
    expect(window.localStorage.getItem('an:text-size')).toBe('large');
    expect(screen.getByRole('button', { name: 'Tắt chữ lớn' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    await user.click(screen.getByRole('button', { name: 'Tắt chữ lớn' }));
    expect(document.documentElement).not.toHaveAttribute('data-text-size');
    expect(window.localStorage.getItem('an:text-size')).toBe('default');

    unmount();
  });

  it('remount đọc lại lựa chọn đã lưu', async () => {
    window.localStorage.setItem('an:text-size', 'large');
    render(<TextSizeToggle />);

    expect(screen.getByRole('button', { name: 'Tắt chữ lớn' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(document.documentElement).toHaveAttribute('data-text-size', 'large');
  });
});
