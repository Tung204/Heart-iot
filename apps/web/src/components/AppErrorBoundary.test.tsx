import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { AppErrorBoundary } from './AppErrorBoundary';

function BrokenPage(): never {
  throw new Error('chunk failed');
}

describe('AppErrorBoundary', () => {
  it('hiển thị lỗi thân thiện thay vì trắng trang, có lối tải lại và về tổng quan', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <MemoryRouter>
        <AppErrorBoundary>
          <BrokenPage />
        </AppErrorBoundary>
      </MemoryRouter>,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Trang này chưa tải được');
    expect(screen.getByRole('button', { name: 'Tải lại trang' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Về tổng quan' })).toHaveAttribute(
      'href',
      '/app/overview',
    );
    spy.mockRestore();
  });
});
