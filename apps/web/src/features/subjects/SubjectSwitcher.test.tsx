import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { errorEnvelope, mockResponse, renderApp } from '../../test/utils';
import { SUBJECT, USER } from '../../test/utils';

function meOk() {
  return mockResponse({ user: USER });
}

// FR-01 — bộ chuyển hồ sơ: trạng thái rỗng không hiện số 0 giả;
// API /subjects chưa có → trạng thái "chưa kết nối được" thay vì lỗi thô.
describe('SubjectSwitcher (trong /app)', () => {
  it('danh sách rỗng → hiển thị "Chưa có hồ sơ nào" kèm CTA tạo hồ sơ, không hiện số 0', async () => {
    renderApp('/app', (url) => {
      const u = String(url);
      if (u.endsWith('/me')) return meOk();
      if (u.endsWith('/subjects')) return mockResponse({ items: [] });
      return mockResponse(errorEnvelope('Không tìm thấy.', 'NOT_FOUND'), 404);
    });

    // Wave 2: cả bộ chuyển hồ sơ và dashboard đều báo "chưa có hồ sơ".
    expect((await screen.findAllByText('Chưa có hồ sơ nào')).length).toBeGreaterThan(0);
    // Wave 2: CTA thật dẫn tới trang quản lý hồ sơ (không còn disabled).
    // Có thể xuất hiện ở cả bộ chuyển hồ sơ lẫn dashboard — kiểm cả hai đều trỏ đúng.
    const ctas = screen.getAllByRole('link', { name: 'Tạo hồ sơ' });
    expect(ctas.length).toBeGreaterThan(0);
    for (const cta of ctas) {
      expect(cta).toHaveAttribute('href', '/app/subjects');
    }
    // Không có chữ "0" giả mạo dữ liệu.
    expect(screen.queryByText(/\b0\b/)).not.toBeInTheDocument();
  });

  it('người thân chỉ thấy lối "Danh sách hồ sơ", không thấy "Quản lý và chia sẻ"', async () => {
    renderApp('/app', (url) => {
      const u = String(url);
      if (u.endsWith('/me')) return meOk();
      if (u.endsWith('/subjects')) {
        return mockResponse({ items: [{ ...SUBJECT, role: 'caregiver' }] });
      }
      return mockResponse(errorEnvelope('Không tìm thấy.', 'NOT_FOUND'), 404);
    });

    expect(await screen.findByRole('link', { name: 'Danh sách hồ sơ' })).toHaveAttribute(
      'href',
      '/app/subjects',
    );
    expect(screen.queryByRole('link', { name: 'Quản lý và chia sẻ' })).not.toBeInTheDocument();
  });

  it('API /subjects chưa có (404) → trạng thái "chưa kết nối được dữ liệu hồ sơ", không lỗi thô', async () => {
    renderApp('/app', (url) => {
      const u = String(url);
      if (u.endsWith('/me')) return meOk();
      return mockResponse(errorEnvelope('Không tìm thấy.', 'NOT_FOUND'), 404);
    });

    expect(await screen.findByText('Chưa kết nối được dữ liệu hồ sơ')).toBeInTheDocument();
    // Lỗi HTTP thô không xuất hiện.
    expect(screen.queryByText(/404/)).not.toBeInTheDocument();
  });
});
