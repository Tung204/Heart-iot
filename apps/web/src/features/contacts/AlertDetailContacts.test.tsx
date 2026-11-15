import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AlertDetailPage } from '../alerts/AlertDetailPage';
import {
  errorEnvelope,
  INCIDENT,
  mockResponse,
  stubFetch,
  SUBJECT,
  type FetchHandler,
} from '../../test/utils';

/**
 * Card "Liên hệ khẩn cấp" trên chi tiết cảnh báo:
 * - Hiện liên hệ chính + nút gọi `tel:`; liên hệ khác thu gọn.
 * - Lỗi tải không chặn nội dung cảnh báo; người thiếu quyền không thấy và không gọi API.
 */

const CONTACTS_URL = `/subjects/${SUBJECT.id}/emergency-contacts`;

function contact(overrides: Record<string, unknown> = {}) {
  return {
    id: crypto.randomUUID(),
    subjectId: SUBJECT.id,
    name: 'Cô Hoa',
    relationship: 'Con gái',
    phone: '0909 123 456',
    isPrimary: true,
    createdAt: '2026-11-14T08:00:00.000Z',
    updatedAt: '2026-11-14T08:00:00.000Z',
    ...overrides,
  };
}

function renderDetail(handler: FetchHandler) {
  const fetchMock = stubFetch(handler);
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const utils = render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/app/alerts/${INCIDENT.id}`]}>
        <Routes>
          <Route path="/app/alerts/:id" element={<AlertDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { ...utils, fetchMock };
}

/** Handler nền: hồ sơ, chi tiết cảnh báo, và phản hồi liên hệ khẩn cấp tùy test. */
function detailHandler(
  contacts: () => Response,
  subjectOverrides: Record<string, unknown> = {},
): FetchHandler {
  return (url) => {
    const u = String(url);
    if (u.endsWith('/subjects')) {
      return mockResponse({ items: [{ ...SUBJECT, ...subjectOverrides }] });
    }
    if (u.includes('/emergency-contacts')) return contacts();
    if (u.includes(`/alerts/${INCIDENT.id}`)) {
      return mockResponse({ ...INCIDENT, events: [], actions: [], recipients: [] });
    }
    return mockResponse(errorEnvelope('Không tìm thấy.', 'NOT_FOUND'), 404);
  };
}

describe('AlertDetailPage — liên hệ khẩn cấp', () => {
  it('hiện liên hệ chính + nút gọi tel:, liên hệ khác thu gọn trong details (FR-09)', async () => {
    const { fetchMock } = renderDetail(
      detailHandler(() =>
        mockResponse({
          items: [
            contact({ name: 'Cô Hoa', phone: '0909 123 456' }),
            contact({
              id: crypto.randomUUID(),
              name: 'Chú Bảo',
              relationship: 'Hàng xóm',
              phone: '+84 912 345 678',
              isPrimary: false,
            }),
          ],
        }),
      ),
    );

    expect(await screen.findByText('Liên hệ khẩn cấp')).toBeInTheDocument();
    expect(screen.getByText('Cô Hoa')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Gọi Cô Hoa' })).toHaveAttribute(
      'href',
      'tel:0909123456',
    );
    // Chỉ gọi API liên hệ của đúng hồ sơ của cảnh báo.
    expect(
      fetchMock.mock.calls.filter(([url]) => String(url).includes('/emergency-contacts')),
    ).toHaveLength(1);
    expect(
      fetchMock.mock.calls.filter(([url]) => String(url).includes(CONTACTS_URL)),
    ).toHaveLength(1);

    const summary = screen.getByText('Liên hệ khác (1)');
    const details = summary.closest('details');
    expect(details).not.toHaveAttribute('open');
    await userEvent.setup().click(summary);
    expect(details).toHaveAttribute('open');
    expect(screen.getByRole('link', { name: 'Gọi Chú Bảo' })).toHaveAttribute(
      'href',
      'tel:+84912345678',
    );
  });

  it('lỗi tải liên hệ không chặn nội dung cảnh báo', async () => {
    renderDetail(
      detailHandler(() => mockResponse(errorEnvelope('Máy chủ lỗi.', 'INTERNAL'), 500)),
    );

    // Nội dung cảnh báo vẫn hiển thị đầy đủ.
    expect(await screen.findByText('Diễn biến sự kiện')).toBeInTheDocument();
    expect(screen.getByText('Nghi ngã')).toBeInTheDocument();
    expect(screen.queryByText('Liên hệ khẩn cấp')).not.toBeInTheDocument();
  });

  it('người thân thiếu quyền nhận cảnh báo: không thấy card và không gọi API liên hệ', async () => {
    const { fetchMock } = renderDetail(
      detailHandler(
        () => mockResponse({ items: [contact()] }),
        {
          role: 'caregiver',
          permissions: { ...SUBJECT.permissions, canReceiveAlerts: false },
        },
      ),
    );

    expect(await screen.findByText('Diễn biến sự kiện')).toBeInTheDocument();
    expect(screen.queryByText('Liên hệ khẩn cấp')).not.toBeInTheDocument();
    expect(
      fetchMock.mock.calls.filter(([url]) => String(url).includes('/emergency-contacts')),
    ).toHaveLength(0);
  });

  it('người thân có quyền nhận cảnh báo: chỉ đọc, có tel: và không có nút quản lý', async () => {
    renderDetail(
      detailHandler(
        () => mockResponse({ items: [contact()] }),
        {
          role: 'caregiver',
          permissions: { ...SUBJECT.permissions, canReceiveAlerts: true, canAcknowledge: false },
        },
      ),
    );

    expect(await screen.findByText('Liên hệ khẩn cấp')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Gọi Cô Hoa' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Sửa liên hệ/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Xóa liên hệ/ })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Thêm liên hệ khẩn cấp' }),
    ).not.toBeInTheDocument();
  });

  it('chủ hồ sơ chưa có liên hệ: gợi ý thêm kèm đường dẫn trang chia sẻ', async () => {
    renderDetail(detailHandler(() => mockResponse({ items: [] })));

    expect(await screen.findByText('Liên hệ khẩn cấp')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Chưa có liên hệ khẩn cấp. Thêm ngay để người thân có thể gọi khi nhận cảnh báo.',
      ),
    ).toBeInTheDocument();
    const link = screen.getByRole('link', { name: 'Thêm liên hệ khẩn cấp' });
    expect(link).toHaveAttribute('href', `/app/subjects/${SUBJECT.id}/share`);
  });

  it('dữ liệu cũ thiếu cờ primary: vẫn hiện liên hệ đầu tiên và nút gọi', async () => {
    renderDetail(
      detailHandler(() =>
        mockResponse({
          items: [contact({ name: 'Cô Hoa', isPrimary: false })],
        }),
      ),
    );

    expect(await screen.findByText('Liên hệ khẩn cấp')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Gọi Cô Hoa' })).toBeInTheDocument();
    expect(screen.queryByText(/^Liên hệ khác/)).not.toBeInTheDocument();
  });
});
